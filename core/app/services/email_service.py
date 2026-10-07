import hashlib
import ipaddress
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
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$", re.I)


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
                status TEXT NOT NULL DEFAULT 'Active', last_activity TEXT, password_hash TEXT, provider_id TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )""")
            columns = {row[1] for row in db.execute("PRAGMA table_info(email_mailboxes)")}
            if "provider_id" not in columns:
                db.execute("ALTER TABLE email_mailboxes ADD COLUMN provider_id TEXT")
            db.execute("""CREATE TABLE IF NOT EXISTS email_domains (
                domain TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'pending_dns',
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
        domain = address.rsplit("@", 1)[1]
        if not DOMAIN_RE.fullmatch(domain):
            raise ValueError("Enter a valid mail domain using letters, numbers, and hyphens only")
        return address

    def _mailbox(self, row):
        if not row:
            return None
        item = dict(row)
        item.pop("password_hash", None)
        item.pop("provider_id", None)
        return item

    def mailboxes(self):
        with self.connection() as db:
            return [self._mailbox(row) for row in db.execute("SELECT id,address,domain,quota_bytes,used_bytes,status,last_activity,created_at,updated_at,provider_id FROM email_mailboxes ORDER BY address COLLATE NOCASE")]

    @staticmethod
    def _validate_domain(domain):
        domain = domain.strip().lower().rstrip(".")
        if not DOMAIN_RE.fullmatch(domain):
            raise ValueError("Enter a valid mail domain using letters, numbers, and hyphens only")
        return domain

    def mail_domains(self):
        with self.connection() as db:
            return [dict(row) for row in db.execute("SELECT domain,status,created_at,updated_at FROM email_domains ORDER BY domain COLLATE NOCASE")]

    def check_mail_domain(self, domain):
        domain = self._validate_domain(domain)
        result = self._check_domain(domain)
        required = {key: result["checks"][key] for key in ("host", "mx", "spf", "dmarc")}
        passed = all(item["status"] == "pass" for item in required.values())
        return {**result, "passed": passed, "required_checks": list(required), "message": "Required mail DNS records are present." if passed else "Publish the missing required records before creating this mail domain."}

    def check_mail_domain_record(self, domain, record):
        domain = self._validate_domain(domain)
        if record == "host":
            hostname = os.getenv("SE_MAIL_HOSTNAME", f"mail.{domain}").strip().rstrip(".")
            ipv4 = self._dns_query(hostname, "A")
            ipv6 = self._dns_query(hostname, "AAAA")
            values = ipv4["values"] + ipv6["values"]
            return {"domain": domain, "record": record, "check": {"status": "pass" if values else "fail", "values": values, "label": "Mail host", "detail": "Mail hostname resolves" if values else "Mail hostname does not resolve"}}
        result = self._check_domain(domain)
        check = result["checks"][record]
        return {"domain": domain, "record": record, "check": check}

    @staticmethod
    def _public_ip():
        configured = os.getenv("SE_PUBLIC_IP", "").strip()
        if configured:
            try:
                return str(ipaddress.ip_address(configured))
            except ValueError as error:
                raise ValueError("SE_PUBLIC_IP is not a valid public IP address") from error
        try:
            request = urllib.request.Request("https://api.ipify.org", headers={"User-Agent": "Server-Engine-Control-Panel/0.1"})
            with urllib.request.urlopen(request, timeout=8) as response:
                address = response.read().decode().strip()
            return str(ipaddress.ip_address(address))
        except Exception as error:
            raise ValueError("Unable to detect this server's public IP address") from error

    @staticmethod
    def _zone_records(zone_file, domain):
        records = {}
        if not zone_file:
            return records
        for raw_line in zone_file.splitlines():
            line = raw_line.strip()
            if not line or line.startswith(";") or line.startswith("$") or " IN " not in f" {line} ":
                continue
            match = re.match(r"^(\S+)\s+(?:(\d+)\s+)?IN\s+(A|AAAA|MX|TXT)\s+(.+)$", line, re.I)
            if not match:
                continue
            name, _, record_type, value = match.groups()
            value = value.strip().strip("() ").replace('"', "")
            normalized_name = name.rstrip(".")
            if normalized_name in {"@", domain} or normalized_name == f"{domain}.".rstrip("."):
                normalized_name = "@"
            key = record_type.lower()
            if key == "txt":
                lowered = value.lower()
                if "v=dkim1" in lowered:
                    key = "dkim"
                elif "v=spf1" in lowered:
                    key = "spf"
                elif "v=dmarc1" in lowered:
                    key = "dmarc"
            records[key] = {"type": record_type.upper(), "name": normalized_name, "value": value}
        return records

    def mail_domain_guide(self, domain):
        domain = self._validate_domain(domain)
        from app.services.stalwart_provider import stalwart_provider
        public_ip = self._public_ip()
        mail_hostname = os.getenv("SE_MAIL_HOSTNAME", f"mail.{domain}").strip().rstrip(".")
        stalwart_provider.ensure_domain(domain)
        stalwart_provider.set_default_hostname(mail_hostname)
        data = stalwart_provider.domain_dns_data(domain)
        zone_records = self._zone_records(data.get("domain", {}).get("dnsZoneFile"), domain)
        ip_record_type = "AAAA" if ":" in public_ip else "A"
        records = [
            {"key": "host", "type": ip_record_type, "name": mail_hostname, "value": public_ip},
            {"key": "mx", "type": "MX", "name": "@", "value": f"10 {mail_hostname}."},
            {"key": "spf", "type": "TXT", "name": "@", "value": f"v=spf1 {'ip6:' if ':' in public_ip else 'ip4:'}{public_ip} ~all"},
            {"key": "dkim", **(zone_records.get("dkim") or {"type": "TXT", "name": "<selector>._domainkey", "value": "Stalwart has not generated a DKIM key yet"})},
            {"key": "dmarc", **(zone_records.get("dmarc") or {"type": "TXT", "name": "_dmarc", "value": f"v=DMARC1; p=none; rua=mailto:postmaster@{domain}"})},
        ]
        dkim = next((item for item in data.get("dkim", []) if item.get("stage") == "active"), None)
        if dkim and not zone_records.get("dkim"):
            public_key = dkim.get("publicKey", "")
            public_key = "".join(line.strip() for line in public_key.splitlines() if "BEGIN" not in line and "END" not in line)
            records[3] = {"key": "dkim", "type": "TXT", "name": f"{dkim.get('selector', '<selector>')}._domainkey", "value": f"v=DKIM1; k=rsa; p={public_key}"}
        return {"domain": domain, "mail_hostname": mail_hostname, "public_ip": public_ip, "records": records}

    def create_mail_domain(self, domain):
        domain = self._validate_domain(domain)
        check = self.check_mail_domain(domain)
        if not check["passed"]:
            raise ValueError(check["message"])
        now = _now()
        with self.connection() as db:
            try:
                db.execute("INSERT INTO email_domains(domain,status,created_at,updated_at) VALUES (?,?,?,?)", (domain, "ready", now, now))
            except sqlite3.IntegrityError as error:
                raise ValueError("This mail domain already exists") from error
        return self.connection_row("SELECT domain,status,created_at,updated_at FROM email_domains WHERE domain = ?", (domain,))

    def create_mailbox(self, payload):
        address = self._validate_address(payload.address)
        domain = address.rsplit("@", 1)[1]
        from app.services.stalwart_provider import stalwart_provider
        with self.connection() as db:
            mail_domain = db.execute("SELECT status FROM email_domains WHERE domain = ?", (domain,)).fetchone()
        if not mail_domain or mail_domain["status"] != "ready":
            raise ValueError(f"Verify {domain} under Mail domains before creating a mailbox")
        provider_id = stalwart_provider.create_mailbox(address, payload.password, payload.quota_bytes)
        now = _now()
        mailbox_id = secrets.token_hex(12)
        try:
            with self.connection() as db:
                db.execute("INSERT INTO email_mailboxes (id,address,domain,quota_bytes,status,password_hash,provider_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", (mailbox_id, address, domain, payload.quota_bytes, payload.status, self._password_hash(payload.password), provider_id, now, now))
        except sqlite3.IntegrityError as error:
            try:
                stalwart_provider.delete_mailbox(provider_id)
            except Exception:
                pass
            raise ValueError("That mailbox already exists") from error
        except Exception:
            try:
                stalwart_provider.delete_mailbox(provider_id)
            except Exception:
                pass
            raise
        return self._mailbox(self.connection_row("SELECT id,address,domain,quota_bytes,used_bytes,status,last_activity,created_at,updated_at FROM email_mailboxes WHERE id = ?", (mailbox_id,)))

    def delete_mailbox(self, mailbox_id):
        row = self.connection_row("SELECT provider_id FROM email_mailboxes WHERE id = ?", (mailbox_id,))
        if not row:
            return False
        from app.services.stalwart_provider import stalwart_provider
        if row["provider_id"]:
            stalwart_provider.delete_mailbox(row["provider_id"])
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
        mail_hostname = os.getenv("SE_MAIL_HOSTNAME", f"mail.{domain}").strip().rstrip(".")
        mx_target_matches = any(value.rstrip(".").split()[-1].lower() == mail_hostname.lower() for value in mx["values"] if value.strip())
        host_ipv4 = cls._dns_query(mail_hostname, "A")
        host_ipv6 = cls._dns_query(mail_hostname, "AAAA")
        host_values = host_ipv4["values"] + host_ipv6["values"]
        checks = {
            "host": {"status": "pass" if host_values else "fail", "values": host_values, "label": "Mail host", "detail": "Mail hostname resolves" if host_values else f"{mail_hostname} does not resolve"},
            "mx": {**mx, "status": "pass" if mx_target_matches else "fail", "label": "MX", "detail": f"Points to {mail_hostname}" if mx_target_matches else f"MX must point to {mail_hostname}"},
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
        domains = {item["domain"] for item in domain_service.list()}
        with self.connection() as db:
            domains.update(row["domain"] for row in db.execute("SELECT domain FROM email_domains"))
            domains.update(row["domain"] for row in db.execute("SELECT DISTINCT domain FROM email_mailboxes"))
        domains = sorted(domains)
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
