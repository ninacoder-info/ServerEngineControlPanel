import hashlib
import json
import os
import re
import secrets
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now():
    return datetime.now(timezone.utc).isoformat()


class EmailService:
    def __init__(self, db_path: str):
        self.path = Path(db_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._deliverability_cache = None
        self._deliverability_cache_at = 0.0
        self._setup()

    def connection(self):
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        return connection

    def _setup(self):
        with self.connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS email_mailboxes (
                id TEXT PRIMARY KEY, address TEXT NOT NULL UNIQUE, domain TEXT NOT NULL,
                quota_bytes INTEGER NOT NULL DEFAULT 1073741824, used_bytes INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'Active', last_activity TEXT, password_hash TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )""")
            db.execute("""CREATE TABLE IF NOT EXISTS email_forwarders (
                id TEXT PRIMARY KEY, source TEXT NOT NULL, destination TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'Deliver', status TEXT NOT NULL DEFAULT 'Active',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )""")
            db.execute("""CREATE TABLE IF NOT EXISTS email_autoresponders (
                id TEXT PRIMARY KEY, address TEXT NOT NULL, subject TEXT NOT NULL,
                body TEXT NOT NULL, start_at TEXT, end_at TEXT, status TEXT NOT NULL DEFAULT 'Active',
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                UNIQUE(address)
            )""")
            db.execute("""CREATE TABLE IF NOT EXISTS email_filters (
                id TEXT PRIMARY KEY, address TEXT NOT NULL, match_type TEXT NOT NULL,
                pattern TEXT NOT NULL, action TEXT NOT NULL, action_value TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )""")

    @staticmethod
    def _password_hash(password):
        if not password:
            return None
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
        return f"scrypt${salt.hex()}${digest.hex()}"

    @staticmethod
    def _validate_address(address):
        address = address.strip().lower()
        if not EMAIL_RE.fullmatch(address):
            raise ValueError("Enter a valid email address")
        return address

    def _mailbox(self, row):
        if not row:
            return None
        item = dict(row)
        item.pop("password_hash", None)
        return item

    def mailboxes(self):
        with self.connection() as db:
            return [self._mailbox(row) for row in db.execute("SELECT id,address,domain,quota_bytes,used_bytes,status,last_activity,created_at,updated_at FROM email_mailboxes ORDER BY address COLLATE NOCASE")]

    def create_mailbox(self, payload):
        address = self._validate_address(payload.address)
        domain = address.rsplit("@", 1)[1]
        from app.services.domain_service import domain_service
        if not any(item["domain"] == domain for item in domain_service.list()):
            raise ValueError(f"Create {domain} under Domains before creating a mailbox")
        now = _now()
        mailbox_id = secrets.token_hex(12)
        with self.connection() as db:
            try:
                db.execute("INSERT INTO email_mailboxes (id,address,domain,quota_bytes,status,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", (mailbox_id, address, domain, payload.quota_bytes, payload.status, self._password_hash(payload.password), now, now))
            except sqlite3.IntegrityError as error:
                raise ValueError("That mailbox already exists") from error
        return self._mailbox(self.connection_row("SELECT id,address,domain,quota_bytes,used_bytes,status,last_activity,created_at,updated_at FROM email_mailboxes WHERE id = ?", (mailbox_id,)))

    def delete_mailbox(self, mailbox_id):
        with self.connection() as db:
            cursor = db.execute("DELETE FROM email_mailboxes WHERE id = ?", (mailbox_id,))
        return cursor.rowcount > 0

    def connection_row(self, query, params=()):
        with self.connection() as db:
            return db.execute(query, params).fetchone()

    def forwarders(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute("SELECT id,source,destination,mode,status,created_at,updated_at FROM email_forwarders ORDER BY source COLLATE NOCASE")]

    def save_forwarder(self, payload, forwarder_id=None):
        source = self._validate_address(payload.source)
        destination = self._validate_address(payload.destination)
        source_domain = source.rsplit("@", 1)[1]
        from app.services.domain_service import domain_service
        if not any(item["domain"] == source_domain for item in domain_service.list()):
            raise ValueError(f"Create {source_domain} under Domains before adding a forwarder")
        now = _now()
        with self.connection() as db:
            if forwarder_id:
                cursor = db.execute("UPDATE email_forwarders SET source=?,destination=?,mode=?,status=?,updated_at=? WHERE id=?", (source, destination, payload.mode, payload.status, now, forwarder_id))
                if cursor.rowcount == 0:
                    return None
                row_id = forwarder_id
            else:
                row_id = secrets.token_hex(12)
                db.execute("INSERT INTO email_forwarders (id,source,destination,mode,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", (row_id, source, destination, payload.mode, payload.status, now, now))
        return dict(self.connection_row("SELECT id,source,destination,mode,status,created_at,updated_at FROM email_forwarders WHERE id = ?", (row_id,)))

    def delete_forwarder(self, forwarder_id):
        with self.connection() as db:
            cursor = db.execute("DELETE FROM email_forwarders WHERE id = ?", (forwarder_id,))
        return cursor.rowcount > 0

    def autoresponders(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute("SELECT id,address,subject,body,start_at,end_at,status,created_at,updated_at FROM email_autoresponders ORDER BY address COLLATE NOCASE")]

    def save_autoresponder(self, payload, autoresponder_id=None):
        address = self._validate_address(payload.address)
        with self.connection() as db:
            if db.execute("SELECT 1 FROM email_mailboxes WHERE address = ?", (address,)).fetchone() is None:
                raise ValueError("Create this mailbox before adding an autoresponder")
            now = _now()
            if autoresponder_id:
                cursor = db.execute("UPDATE email_autoresponders SET address=?,subject=?,body=?,start_at=?,end_at=?,status=?,updated_at=? WHERE id=?", (address, payload.subject.strip(), payload.body, payload.start_at, payload.end_at, payload.status, now, autoresponder_id))
                if cursor.rowcount == 0:
                    return None
                row_id = autoresponder_id
            else:
                row_id = secrets.token_hex(12)
                try:
                    db.execute("INSERT INTO email_autoresponders (id,address,subject,body,start_at,end_at,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", (row_id, address, payload.subject.strip(), payload.body, payload.start_at, payload.end_at, payload.status, now, now))
                except sqlite3.IntegrityError as error:
                    raise ValueError("This mailbox already has an autoresponder") from error
        return dict(self.connection_row("SELECT id,address,subject,body,start_at,end_at,status,created_at,updated_at FROM email_autoresponders WHERE id = ?", (row_id,)))

    def delete_autoresponder(self, autoresponder_id):
        with self.connection() as db:
            cursor = db.execute("DELETE FROM email_autoresponders WHERE id = ?", (autoresponder_id,))
        return cursor.rowcount > 0

    def filters(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute("SELECT id,address,match_type,pattern,action,action_value,status,created_at,updated_at FROM email_filters ORDER BY address COLLATE NOCASE, created_at DESC")]

    def save_filter(self, payload, filter_id=None):
        address = self._validate_address(payload.address)
        with self.connection() as db:
            if db.execute("SELECT 1 FROM email_mailboxes WHERE address = ?", (address,)).fetchone() is None:
                raise ValueError("Create this mailbox before adding a filter")
            if payload.action == "Move to folder" and not payload.action_value.strip():
                raise ValueError("Enter a folder name for this filter action")
            now = _now()
            values = (address, payload.match_type, payload.pattern.strip(), payload.action, payload.action_value.strip(), payload.status, now)
            if filter_id:
                cursor = db.execute("UPDATE email_filters SET address=?,match_type=?,pattern=?,action=?,action_value=?,status=?,updated_at=? WHERE id=?", (*values, filter_id))
                if cursor.rowcount == 0:
                    return None
                row_id = filter_id
            else:
                row_id = secrets.token_hex(12)
                db.execute("INSERT INTO email_filters (id,address,match_type,pattern,action,action_value,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", (row_id, *values))
        return dict(self.connection_row("SELECT id,address,match_type,pattern,action,action_value,status,created_at,updated_at FROM email_filters WHERE id = ?", (row_id,)))

    def delete_filter(self, filter_id):
        with self.connection() as db:
            cursor = db.execute("DELETE FROM email_filters WHERE id = ?", (filter_id,))
        return cursor.rowcount > 0

    def summary(self):
        with self.connection() as db:
            mailbox = db.execute("SELECT COUNT(*) AS count, COALESCE(SUM(used_bytes),0) AS used, COALESCE(SUM(quota_bytes),0) AS quota, COUNT(DISTINCT domain) AS domains FROM email_mailboxes").fetchone()
            forwarders = db.execute("SELECT COUNT(*) AS count FROM email_forwarders WHERE status = 'Active'").fetchone()
        return {"mailboxes": mailbox["count"], "domains": mailbox["domains"], "storage_used_bytes": mailbox["used"], "storage_quota_bytes": mailbox["quota"], "forwarders": forwarders["count"], "deliverability": {"status": "not_checked", "label": "Not checked", "detail": "Run an SPF and DKIM check after configuring your mail domain."}}

    @staticmethod
    def _dns_query(name, record_type):
        query = urllib.parse.urlencode({"name": name, "type": record_type})
        request = urllib.request.Request(
            f"https://cloudflare-dns.com/dns-query?{query}",
            headers={
                "Accept": "application/dns-json",
                "User-Agent": "Server-Engine-Control-Panel/0.1",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as error:
            return {"status": "error", "values": [], "detail": f"DNS check unavailable: {error}"}
        answers = payload.get("Answer", [])
        values = [answer.get("data", "") for answer in answers if answer.get("data")]
        return {"status": "pass" if values else "fail", "values": values, "detail": "Record found" if values else "No public record found"}

    @classmethod
    def _check_domain(cls, domain):
        mx = cls._dns_query(domain, "MX")
        txt = cls._dns_query(domain, "TXT")
        dmarc = cls._dns_query(f"_dmarc.{domain}", "TXT")
        spf_values = [value for value in txt["values"] if "v=spf1" in value.lower()]
        dmarc_values = [value for value in dmarc["values"] if "v=dmarc1" in value.lower()]
        spf = {"status": "pass" if spf_values else "fail", "values": spf_values, "detail": "SPF policy found" if spf_values else "No SPF TXT record found"}
        dmarc_result = {"status": "pass" if dmarc_values else "fail", "values": dmarc_values, "detail": "DMARC policy found" if dmarc_values else "No DMARC policy found"}
        checks = {
            "mx": {**mx, "label": "MX", "detail": "Mail exchanger found" if mx["status"] == "pass" else "No MX record found"},
            "spf": {**spf, "label": "SPF"},
            "dkim": {"status": "not_checked", "values": [], "label": "DKIM", "detail": "Configure a DKIM selector in Stalwart before this can be checked."},
            "dmarc": {**dmarc_result, "label": "DMARC"},
        }
        statuses = [check["status"] for check in checks.values()]
        status = "fail" if "fail" in statuses or "error" in statuses else "warning"
        if all(value == "pass" for value in statuses if value != "not_checked") and "not_checked" not in statuses:
            status = "healthy"
        return {"domain": domain, "status": status, "checks": checks}

    def deliverability(self, refresh=False):
        now = __import__("time").time()
        if not refresh and self._deliverability_cache is not None and now - self._deliverability_cache_at < 300:
            return self._deliverability_cache
        from app.services.domain_service import domain_service
        domains = sorted({item["domain"] for item in domain_service.list()})
        if not domains:
            result = {"status": "not_configured", "checked_at": _now(), "domains": [], "summary": {"total": 0, "healthy": 0, "warnings": 0, "failed": 0}, "message": "Add a domain before checking mail DNS."}
        else:
            results = [self._check_domain(domain) for domain in domains]
            result = {
                "status": "healthy" if all(item["status"] == "healthy" for item in results) else "warning" if any(item["status"] == "warning" for item in results) else "fail",
                "checked_at": _now(),
                "domains": results,
                "summary": {
                    "total": len(results),
                    "healthy": sum(item["status"] == "healthy" for item in results),
                    "warnings": sum(item["status"] == "warning" for item in results),
                    "failed": sum(item["status"] == "fail" for item in results),
                },
                "message": "Checks use public DNS and may take time to reflect recent changes.",
            }
        self._deliverability_cache = result
        self._deliverability_cache_at = now
        return result


email_service = EmailService(__import__("os").getenv("SE_DB_PATH", "/var/lib/server-engine/control.db"))
