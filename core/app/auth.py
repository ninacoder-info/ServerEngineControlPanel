import hashlib
import hmac
import os
import pwd
import secrets
import sqlite3
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, Request, Response, status

SESSION_COOKIE = "se_session"
PBKDF2_ROUNDS = 310_000
BUILTIN_PANEL_ROLES = (
    ("administrator", "Administrator", "Full panel access.", ["*"]),
    ("operator", "Operator", "Manage routine services and operations.", ["services", "jobs", "logs"]),
    ("website_manager", "Website manager", "Manage websites, domains, and files.", ["websites", "domains", "files"]),
    ("database_manager", "Database manager", "Manage databases and credentials.", ["databases", "backups"]),
    ("mail_manager", "Mail manager", "Manage mailboxes and mail routing.", ["mail", "domains"]),
    ("security_auditor", "Security auditor", "Review security controls and logs.", ["logs", "firewall", "malware"]),
    ("viewer", "Viewer", "Read-only panel access.", []),
)


class AuthStore:
    def __init__(self, path: str, bootstrap_user: str, bootstrap_password: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.bootstrap_user = bootstrap_user
        self.bootstrap_password = bootstrap_password
        self._setup()

    def connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _setup(self):
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    display_name TEXT NOT NULL DEFAULT '',
                    email TEXT NOT NULL DEFAULT '',
                    role TEXT NOT NULL DEFAULT 'administrator',
                    status TEXT NOT NULL DEFAULT 'active',
                    mfa_required INTEGER NOT NULL DEFAULT 0,
                    last_login_at TEXT,
                    last_login_ip TEXT
                );
                CREATE TABLE IF NOT EXISTS hosting_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
                    account_name TEXT NOT NULL,
                    primary_domain TEXT NOT NULL,
                    home_path TEXT NOT NULL UNIQUE,
                    package_id TEXT NOT NULL DEFAULT 'starter',
                    disk_quota_mb INTEGER NOT NULL DEFAULT 10240,
                    bandwidth_quota_mb INTEGER NOT NULL DEFAULT 102400,
                    websites_quota INTEGER NOT NULL DEFAULT 1,
                    databases_quota INTEGER NOT NULL DEFAULT 2,
                    mailboxes_quota INTEGER NOT NULL DEFAULT 5,
                    ftp_quota INTEGER NOT NULL DEFAULT 2,
                    cron_quota INTEGER NOT NULL DEFAULT 5,
                    feature_flags TEXT NOT NULL DEFAULT '{}',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS hosting_plans (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    disk_quota_mb INTEGER NOT NULL DEFAULT 10240,
                    bandwidth_quota_mb INTEGER NOT NULL DEFAULT 102400,
                    websites_quota INTEGER NOT NULL DEFAULT 1,
                    databases_quota INTEGER NOT NULL DEFAULT 2,
                    mailboxes_quota INTEGER NOT NULL DEFAULT 5,
                    ftp_quota INTEGER NOT NULL DEFAULT 2,
                    cron_quota INTEGER NOT NULL DEFAULT 5,
                    php_version TEXT NOT NULL DEFAULT 'latest',
                    webserver TEXT NOT NULL DEFAULT 'nginx',
                    database_engine TEXT NOT NULL DEFAULT 'mysql',
                    features TEXT NOT NULL DEFAULT '[]',
                    system_plan INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS panel_roles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    permissions TEXT NOT NULL DEFAULT '[]',
                    system_role INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS login_attempts (
                    attempt_key TEXT PRIMARY KEY,
                    failed_attempts INTEGER NOT NULL DEFAULT 0,
                    last_failed_at TEXT NOT NULL,
                    locked_until TEXT
                );
                CREATE TABLE IF NOT EXISTS passkeys (
                    credential_id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    public_key TEXT NOT NULL,
                    sign_count INTEGER NOT NULL DEFAULT 0,
                    transports TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS webauthn_challenges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    purpose TEXT NOT NULL,
                    challenge TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS api_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    name TEXT NOT NULL,
                    token_hash TEXT NOT NULL UNIQUE,
                    token_prefix TEXT NOT NULL,
                    scopes TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    expires_at TEXT,
                    last_used_at TEXT,
                    created_ip TEXT,
                    last_used_ip TEXT,
                    user_agent TEXT,
                    platform TEXT NOT NULL DEFAULT 'web',
                    device_name TEXT,
                    revoked_at TEXT
                );
                CREATE TABLE IF NOT EXISTS api_pairings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    code_hash TEXT NOT NULL UNIQUE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    used_at TEXT
                );
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor_user_id INTEGER,
                    actor TEXT NOT NULL,
                    target TEXT NOT NULL DEFAULT '',
                    detail TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'info',
                    metadata TEXT NOT NULL DEFAULT '{}',
                    source_ip TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_audit_events_category ON audit_events(category, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_audit_events_status ON audit_events(status, created_at DESC);
            """)
            user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()}
            user_migrations = {
                "display_name": "TEXT NOT NULL DEFAULT ''",
                "email": "TEXT NOT NULL DEFAULT ''",
                "role": "TEXT NOT NULL DEFAULT 'administrator'",
                "status": "TEXT NOT NULL DEFAULT 'active'",
                "mfa_required": "INTEGER NOT NULL DEFAULT 0",
                "last_login_at": "TEXT",
                "last_login_ip": "TEXT",
            }
            for name, definition in user_migrations.items():
                if name not in user_columns:
                    db.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
            token_columns = {row["name"] for row in db.execute("PRAGMA table_info(api_tokens)").fetchall()}
            token_migrations = {
                "created_ip": "TEXT",
                "last_used_ip": "TEXT",
                "user_agent": "TEXT",
                "platform": "TEXT NOT NULL DEFAULT 'web'",
                "device_name": "TEXT",
                "revoked_at": "TEXT",
            }
            for name, definition in token_migrations.items():
                if name not in token_columns:
                    db.execute(f"ALTER TABLE api_tokens ADD COLUMN {name} {definition}")
            account_columns = {row["name"] for row in db.execute("PRAGMA table_info(hosting_accounts)").fetchall()}
            account_migrations = {
                "databases_quota": "INTEGER NOT NULL DEFAULT 2",
                "mailboxes_quota": "INTEGER NOT NULL DEFAULT 5",
                "ftp_quota": "INTEGER NOT NULL DEFAULT 2",
                "cron_quota": "INTEGER NOT NULL DEFAULT 5",
            }
            for name, definition in account_migrations.items():
                if name not in account_columns:
                    db.execute(f"ALTER TABLE hosting_accounts ADD COLUMN {name} {definition}")
            if db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None:
                db.execute("INSERT INTO users(username, password_hash, created_at, display_name, role) VALUES (?, ?, ?, ?, ?)", (self.bootstrap_user, hash_password(self.bootstrap_password), now().isoformat(), self.bootstrap_user, "administrator"))
            else:
                db.execute("UPDATE users SET role = 'administrator' WHERE username = ? AND (role IS NULL OR role = '')", (self.bootstrap_user,))
            for role_id, name, description, permissions in BUILTIN_PANEL_ROLES:
                db.execute(
                    "INSERT OR IGNORE INTO panel_roles(id, name, description, permissions, system_role, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                    (role_id, name, description, json.dumps(permissions), now().isoformat()),
                )
            if db.execute("SELECT 1 FROM hosting_plans LIMIT 1").fetchone() is None:
                created = now().isoformat()
                db.executemany(
                    """INSERT INTO hosting_plans(
                        id, name, description, disk_quota_mb, bandwidth_quota_mb,
                        websites_quota, databases_quota, mailboxes_quota, ftp_quota,
                        cron_quota, php_version, webserver, database_engine, features,
                        system_plan, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?, ?)""",
                    [
                        ("starter", "Starter", "For one small website or landing page.", 10240, 102400, 1, 2, 5, 2, 5, "latest", "nginx", "mysql", json.dumps(["ssl", "dns", "backups", "git"]), created, created),
                        ("business", "Business", "Balanced resources for client websites and stores.", 51200, 512000, 10, 10, 25, 10, 20, "latest", "nginx", "mysql", json.dumps(["ssl", "dns", "mail", "backups", "git"]), created, created),
                        ("agency", "Agency", "A larger allocation for multiple managed websites.", 204800, 2097152, 50, 50, 100, 50, 100, "latest", "nginx", "mysql", json.dumps(["ssl", "dns", "mail", "backups", "git", "shell"]), created, created),
                    ],
                )
            db.execute("UPDATE panel_roles SET system_role = CASE WHEN id = 'administrator' THEN 1 ELSE 0 END")

    def authenticate(self, username: str, password: str) -> int | None:
        with self.connection() as db:
            row = db.execute("SELECT id, password_hash, status FROM users WHERE username = ?", (username,)).fetchone()
            if row and row["status"] != "active":
                return None
        return int(row["id"]) if row and verify_password(password, row["password_hash"]) else None

    def login_is_locked(self, attempt_key: str) -> bool:
        current = now()
        with self.connection() as db:
            row = db.execute("SELECT locked_until FROM login_attempts WHERE attempt_key = ?", (attempt_key,)).fetchone()
            if not row or not row["locked_until"]:
                return False
            if datetime.fromisoformat(row["locked_until"]) > current:
                return True
            db.execute("DELETE FROM login_attempts WHERE attempt_key = ?", (attempt_key,))
        return False

    def record_login_failure(self, attempt_key: str, maximum_attempts: int, lockout_minutes: int) -> bool:
        current = now()
        with self.connection() as db:
            row = db.execute("SELECT failed_attempts FROM login_attempts WHERE attempt_key = ?", (attempt_key,)).fetchone()
            failed_attempts = (int(row["failed_attempts"]) if row else 0) + 1
            locked_until = current + timedelta(minutes=lockout_minutes) if failed_attempts >= maximum_attempts else None
            db.execute(
                "INSERT INTO login_attempts(attempt_key, failed_attempts, last_failed_at, locked_until) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(attempt_key) DO UPDATE SET failed_attempts = excluded.failed_attempts, last_failed_at = excluded.last_failed_at, locked_until = excluded.locked_until",
                (attempt_key, failed_attempts, current.isoformat(), locked_until.isoformat() if locked_until else None),
            )
        return locked_until is not None

    def clear_login_failures(self, attempt_key: str) -> None:
        with self.connection() as db:
            db.execute("DELETE FROM login_attempts WHERE attempt_key = ?", (attempt_key,))

    def clear_login_attempts(self, username: str | None = None, client_ip: str | None = None, clear_all: bool = False) -> int:
        """Clear selected brute-force records for an operator recovery action."""
        if not clear_all and not username and not client_ip:
            return 0
        with self.connection() as db:
            if clear_all:
                cursor = db.execute("DELETE FROM login_attempts")
            else:
                clauses = []
                values = []
                if username:
                    normalized = username.strip().lower()
                    clauses.extend(["attempt_key LIKE ?", "attempt_key LIKE ?"])
                    values.extend([f"user|{normalized}|%", f"{normalized}|%"])
                if client_ip:
                    clauses.extend(["attempt_key = ?", "attempt_key LIKE ?"])
                    values.extend([f"ip|{client_ip}", f"%|{client_ip}"])
                cursor = db.execute(f"DELETE FROM login_attempts WHERE {' OR '.join(clauses)}", values)
        return cursor.rowcount

    def create_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(40)
        expires = now() + timedelta(days=7)
        with self.connection() as db:
            db.execute("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash(token), user_id, expires.isoformat()))
        return token

    def record_login(self, user_id: int, client_ip: str | None = None):
        with self.connection() as db:
            db.execute(
                "UPDATE users SET last_login_at = ?, last_login_ip = ? WHERE id = ?",
                (now().isoformat(), client_ip, user_id),
            )

    def create_session_for_user(self, user_id: int) -> str:
        return self.create_session(user_id)

    def user_by_id(self, user_id: int):
        with self.connection() as db:
            row = db.execute("SELECT id, username, display_name, email, role, status, mfa_required, created_at, last_login_at, last_login_ip FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def user_for_session(self, token: str | None):
        if not token:
            return None
        with self.connection() as db:
            row = db.execute("SELECT users.id, users.username, users.display_name, users.email, users.role, users.status, users.mfa_required FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'", (token_hash(token), now().isoformat())).fetchone()
        return dict(row) if row else None

    def list_users(self):
        with self.connection() as db:
            rows = db.execute("SELECT id, username, display_name, email, role, status, mfa_required, created_at, last_login_at, last_login_ip FROM users ORDER BY username COLLATE NOCASE").fetchall()
        return [dict(row) for row in rows]

    def create_user(self, username: str, password: str, display_name: str = "", email: str = "", role: str = "viewer"):
        created = now().isoformat()
        with self.connection() as db:
            cursor = db.execute("INSERT INTO users(username, password_hash, created_at, display_name, email, role) VALUES (?, ?, ?, ?, ?, ?)", (username, hash_password(password), created, display_name or username, email, role))
            user_id = cursor.lastrowid
        return self.user_by_id(user_id)

    def reset_password(self, username: str, password: str) -> bool:
        """Replace a user's password and revoke existing browser sessions."""
        with self.connection() as db:
            row = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
            if row is None:
                return False
            db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
            db.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        return True

    def list_roles(self):
        with self.connection() as db:
            rows = db.execute("SELECT panel_roles.id, panel_roles.name, panel_roles.description, panel_roles.permissions, panel_roles.system_role, panel_roles.created_at, COUNT(users.id) AS assigned_count FROM panel_roles LEFT JOIN users ON users.role = panel_roles.id GROUP BY panel_roles.id ORDER BY system_role DESC, name COLLATE NOCASE").fetchall()
        result = []
        for row in rows:
            role = dict(row)
            try:
                role["permissions"] = json.loads(role["permissions"] or "[]")
            except json.JSONDecodeError:
                role["permissions"] = []
            role["system_role"] = bool(role["system_role"])
            result.append(role)
        return result

    def create_role(self, role_id: str, name: str, description: str, permissions: list[str]):
        with self.connection() as db:
            db.execute(
                "INSERT INTO panel_roles(id, name, description, permissions, system_role, created_at) VALUES (?, ?, ?, ?, 0, ?)",
                (role_id, name, description, json.dumps(permissions), now().isoformat()),
            )
        return next(role for role in self.list_roles() if role["id"] == role_id)

    def update_role(self, role_id: str, name: str, description: str, permissions: list[str]):
        with self.connection() as db:
            role = db.execute("SELECT system_role FROM panel_roles WHERE id = ?", (role_id,)).fetchone()
            if not role or role["system_role"]:
                return None
            db.execute("UPDATE panel_roles SET name = ?, description = ?, permissions = ? WHERE id = ?", (name, description, json.dumps(permissions), role_id))
        return next(role for role in self.list_roles() if role["id"] == role_id)

    def delete_role(self, role_id: str, replacement_role: str | None = None) -> bool:
        with self.connection() as db:
            role = db.execute("SELECT system_role FROM panel_roles WHERE id = ?", (role_id,)).fetchone()
            if not role or role["system_role"]:
                return False
            assigned = db.execute("SELECT COUNT(*) AS count FROM users WHERE role = ?", (role_id,)).fetchone()["count"]
            if assigned and not replacement_role:
                return False
            if assigned:
                target = db.execute("SELECT id FROM panel_roles WHERE id = ?", (replacement_role,)).fetchone()
                if not target or replacement_role == role_id:
                    return False
                db.execute("UPDATE users SET role = ? WHERE role = ?", (replacement_role, role_id))
            db.execute("DELETE FROM panel_roles WHERE id = ?", (role_id,))
            return True

    def record_activity(self, category: str, action: str, actor: str, target: str = "", detail: str = "", status: str = "info", metadata: dict | None = None, actor_user_id: int | None = None, source_ip: str | None = None):
        event_id = f"audit-{secrets.token_urlsafe(18)}"
        timestamp = now().isoformat()
        with self.connection() as db:
            db.execute(
                "INSERT INTO audit_events(id, category, action, actor_user_id, actor, target, detail, status, metadata, source_ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (event_id, category, action, actor_user_id, actor, target, detail, status, json.dumps(metadata or {}, sort_keys=True), source_ip, timestamp),
            )
        return {"id": event_id, "category": category, "type": action, "actor": actor, "target": target, "detail": detail, "time": timestamp, "status": status, "metadata": metadata or {}}

    def list_activity(self, since: str | None = None):
        with self.connection() as db:
            if since:
                rows = db.execute("SELECT id, category, action AS type, actor, target, detail, created_at AS time, status, metadata, source_ip FROM audit_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT 1000", (since,)).fetchall()
            else:
                rows = db.execute("SELECT id, category, action AS type, actor, target, detail, created_at AS time, status, metadata, source_ip FROM audit_events ORDER BY created_at DESC LIMIT 1000").fetchall()
        result = []
        for row in rows:
            event = dict(row)
            try:
                event["metadata"] = json.loads(event["metadata"] or "{}")
            except json.JSONDecodeError:
                event["metadata"] = {}
            if event.get("source_ip"):
                event["metadata"].setdefault("Source IP", event["source_ip"])
            event.pop("source_ip", None)
            result.append(event)
        return result

    def list_hosting_accounts(self):
        with self.connection() as db:
            rows = db.execute(
                """
                SELECT a.id, a.user_id, a.account_name, a.primary_domain,
                       a.home_path, a.package_id, a.disk_quota_mb,
                       a.bandwidth_quota_mb, a.websites_quota, a.databases_quota,
                       a.mailboxes_quota, a.ftp_quota, a.cron_quota, a.feature_flags,
                       a.status, a.created_at, u.username, u.email,
                       u.last_login_at
                FROM hosting_accounts a
                JOIN users u ON u.id = a.user_id
                ORDER BY a.account_name COLLATE NOCASE
                """
            ).fetchall()
        accounts = []
        for row in rows:
            account = dict(row)
            try:
                account["feature_flags"] = json.loads(account["feature_flags"] or "{}")
            except json.JSONDecodeError:
                account["feature_flags"] = {}
            accounts.append(account)
        return accounts

    def list_hosting_plans(self):
        with self.connection() as db:
            rows = db.execute(
                """SELECT p.*, COUNT(a.id) AS assigned_count
                   FROM hosting_plans p
                   LEFT JOIN hosting_accounts a ON a.package_id = p.id
                   GROUP BY p.id
                   ORDER BY p.system_plan DESC, p.name COLLATE NOCASE"""
            ).fetchall()
        plans = []
        for row in rows:
            plan = dict(row)
            try:
                plan["features"] = json.loads(plan["features"] or "[]")
            except json.JSONDecodeError:
                plan["features"] = []
            plan["system_plan"] = bool(plan["system_plan"])
            plans.append(plan)
        return plans

    def create_hosting_plan(self, plan: dict):
        timestamp = now().isoformat()
        with self.connection() as db:
            db.execute(
                """INSERT INTO hosting_plans(
                    id, name, description, disk_quota_mb, bandwidth_quota_mb,
                    websites_quota, databases_quota, mailboxes_quota, ftp_quota,
                    cron_quota, php_version, webserver, database_engine, features,
                    system_plan, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)""",
                (plan["id"], plan["name"], plan["description"], plan["disk_quota_mb"], plan["bandwidth_quota_mb"], plan["websites_quota"], plan["databases_quota"], plan["mailboxes_quota"], plan["ftp_quota"], plan["cron_quota"], plan["php_version"], plan["webserver"], plan["database_engine"], json.dumps(plan["features"], sort_keys=True), plan["status"], timestamp, timestamp),
            )
        return next(item for item in self.list_hosting_plans() if item["id"] == plan["id"])

    def update_hosting_plan(self, plan_id: str, plan: dict):
        timestamp = now().isoformat()
        with self.connection() as db:
            existing = db.execute("SELECT system_plan FROM hosting_plans WHERE id = ?", (plan_id,)).fetchone()
            if not existing:
                return None
            db.execute(
                """UPDATE hosting_plans SET name = ?, description = ?, disk_quota_mb = ?,
                    bandwidth_quota_mb = ?, websites_quota = ?, databases_quota = ?,
                    mailboxes_quota = ?, ftp_quota = ?, cron_quota = ?, php_version = ?,
                    webserver = ?, database_engine = ?, features = ?, status = ?, updated_at = ?
                    WHERE id = ?""",
                (plan["name"], plan["description"], plan["disk_quota_mb"], plan["bandwidth_quota_mb"], plan["websites_quota"], plan["databases_quota"], plan["mailboxes_quota"], plan["ftp_quota"], plan["cron_quota"], plan["php_version"], plan["webserver"], plan["database_engine"], json.dumps(plan["features"], sort_keys=True), plan["status"], timestamp, plan_id),
            )
        return next(item for item in self.list_hosting_plans() if item["id"] == plan_id)

    def delete_hosting_plan(self, plan_id: str, replacement_plan: str | None = None):
        with self.connection() as db:
            plan = db.execute("SELECT system_plan FROM hosting_plans WHERE id = ?", (plan_id,)).fetchone()
            if not plan or plan["system_plan"]:
                return False, 0
            assigned = db.execute("SELECT COUNT(*) AS count FROM hosting_accounts WHERE package_id = ?", (plan_id,)).fetchone()["count"]
            if assigned and not replacement_plan:
                return False, assigned
            if assigned:
                replacement = db.execute("SELECT id FROM hosting_plans WHERE id = ? AND id != ?", (replacement_plan, plan_id)).fetchone()
                if not replacement:
                    return False, assigned
                db.execute("UPDATE hosting_accounts SET package_id = ? WHERE package_id = ?", (replacement_plan, plan_id))
            db.execute("DELETE FROM hosting_plans WHERE id = ?", (plan_id,))
            return True, assigned

    def create_hosting_account(
        self,
        username: str,
        password: str,
        account_name: str,
        primary_domain: str,
        email: str = "",
        package_id: str = "starter",
        disk_quota_mb: int = 10240,
        bandwidth_quota_mb: int = 102400,
        websites_quota: int = 1,
        databases_quota: int = 2,
        mailboxes_quota: int = 5,
        ftp_quota: int = 2,
        cron_quota: int = 5,
        feature_flags: dict | None = None,
    ):
        created = now().isoformat()
        home_path = f"/server-engine/www/{username}"
        home = Path(home_path)
        home.mkdir(parents=True, exist_ok=False)
        try:
            owner = pwd.getpwnam("serverengine")
            if os.geteuid() == 0:
                os.chown(home, owner.pw_uid, owner.pw_gid)
            home.chmod(0o750)
        except Exception:
            home.rmdir()
            raise
        with self.connection() as db:
            try:
                user_cursor = db.execute(
                    "INSERT INTO users(username, password_hash, created_at, display_name, email, role) VALUES (?, ?, ?, ?, ?, ?)",
                    (username, hash_password(password), created, account_name or username, email, "hosting_account"),
                )
                user_id = user_cursor.lastrowid
                account_cursor = db.execute(
                    """
                    INSERT INTO hosting_accounts(
                        user_id, account_name, primary_domain, home_path, package_id,
                        disk_quota_mb, bandwidth_quota_mb, websites_quota,
                        databases_quota, mailboxes_quota, ftp_quota, cron_quota,
                        feature_flags, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id, account_name, primary_domain, home_path, package_id,
                        disk_quota_mb, bandwidth_quota, websites_quota,
                        databases_quota, mailboxes_quota, ftp_quota, cron_quota,
                        json.dumps(feature_flags or {}, sort_keys=True), created,
                    ),
                )
                account_id = account_cursor.lastrowid
            except Exception:
                home.rmdir()
                raise
        return next(account for account in self.list_hosting_accounts() if account["id"] == account_id)

    def delete_session(self, token: str | None):
        if token:
            with self.connection() as db:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))

    def create_api_token(self, user_id: int, name: str, scopes: list[str], expires_days: int | None, *, device_name: str | None = None, platform: str = "web", created_ip: str | None = None, user_agent: str | None = None):
        token = f"se_{secrets.token_urlsafe(36)}"
        created = now()
        expires = created + timedelta(days=expires_days) if expires_days else None
        with self.connection() as db:
            cursor = db.execute(
                "INSERT INTO api_tokens(user_id, name, token_hash, token_prefix, scopes, created_at, expires_at, created_ip, user_agent, platform, device_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, name, token_hash(token), token[:12], json.dumps(scopes), created.isoformat(), expires.isoformat() if expires else None, created_ip, user_agent, platform, device_name or name),
            )
            token_id = cursor.lastrowid
        return {"id": token_id, "name": name, "token": token, "scopes": scopes, "created_at": created.isoformat(), "expires_at": expires.isoformat() if expires else None}

    def api_tokens_for_user(self, user_id: int):
        with self.connection() as db:
            rows = db.execute("SELECT id, name, token_prefix, scopes, created_at, expires_at, last_used_at, created_ip, last_used_ip, user_agent, platform, device_name, revoked_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        return [{**dict(row), "scopes": json.loads(row["scopes"] or "[]"), "status": "revoked" if row["revoked_at"] else "active"} for row in rows]

    def revoke_api_token(self, user_id: int, token_id: int) -> bool:
        with self.connection() as db:
            result = db.execute("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL", (now().isoformat(), token_id, user_id))
        return result.rowcount > 0

    def user_for_api_token(self, token: str | None, request: Request | None = None):
        if not token:
            return None
        with self.connection() as db:
            row = db.execute(
                "SELECT users.id, users.username, users.display_name, users.email, users.role, users.status, api_tokens.id AS token_id, api_tokens.last_used_at FROM api_tokens JOIN users ON users.id = api_tokens.user_id WHERE api_tokens.token_hash = ? AND api_tokens.revoked_at IS NULL AND users.status = 'active' AND (api_tokens.expires_at IS NULL OR api_tokens.expires_at > ?)",
                (token_hash(token), now().isoformat()),
            ).fetchone()
            if not row:
                return None
            current = now()
            previous = datetime.fromisoformat(row["last_used_at"]) if row["last_used_at"] else None
            if not previous or (current - previous).total_seconds() >= 60:
                db.execute("UPDATE api_tokens SET last_used_at = ?, last_used_ip = ? WHERE id = ?", (current.isoformat(), request.client.host if request and request.client else None, row["token_id"]))
        return {"id": row["id"], "username": row["username"], "display_name": row["display_name"], "email": row["email"], "role": row["role"], "status": row["status"]}

    def create_pairing(self, user_id: int):
        code = secrets.token_urlsafe(18)
        created = now()
        expires = created + timedelta(minutes=5)
        with self.connection() as db:
            cursor = db.execute("INSERT INTO api_pairings(user_id, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)", (user_id, token_hash(code), created.isoformat(), expires.isoformat()))
        return {"id": cursor.lastrowid, "code": code, "expires_at": expires.isoformat()}

    def exchange_pairing(self, code: str, device_name: str, platform: str = "ios"):
        with self.connection() as db:
            row = db.execute("SELECT id, user_id FROM api_pairings WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?", (token_hash(code), now().isoformat())).fetchone()
            if not row:
                return None
            db.execute("UPDATE api_pairings SET used_at = ? WHERE id = ?", (now().isoformat(), row["id"]))
        return self.create_api_token(row["user_id"], device_name or "Mobile device", ["read:*", "write:websites", "write:services"], 90, device_name=device_name, platform=platform)

    def save_challenge(self, purpose: str, challenge: str, user_id: int | None = None):
        expires = now() + timedelta(minutes=2)
        with self.connection() as db:
            db.execute("DELETE FROM webauthn_challenges WHERE expires_at <= ? OR purpose = ?", (now().isoformat(), purpose))
            db.execute(
                "INSERT INTO webauthn_challenges(user_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?)",
                (user_id, purpose, challenge, expires.isoformat()),
            )

    def consume_challenge(self, purpose: str):
        with self.connection() as db:
            row = db.execute(
                "SELECT id, user_id, challenge FROM webauthn_challenges WHERE purpose = ? AND expires_at > ? ORDER BY id DESC LIMIT 1",
                (purpose, now().isoformat()),
            ).fetchone()
            if row:
                db.execute("DELETE FROM webauthn_challenges WHERE id = ?", (row["id"],))
        return dict(row) if row else None

    def save_passkey(self, credential_id: str, user_id: int, public_key: str, sign_count: int, transports: list[str]):
        with self.connection() as db:
            db.execute(
                "INSERT OR REPLACE INTO passkeys(credential_id, user_id, public_key, sign_count, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (credential_id, user_id, public_key, sign_count, json.dumps(transports), now().isoformat()),
            )

    def passkeys_for_user(self, user_id: int):
        with self.connection() as db:
            rows = db.execute("SELECT credential_id, created_at, transports FROM passkeys WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        return [{**dict(row), "transports": json.loads(row["transports"] or "[]")} for row in rows]

    def passkey(self, credential_id: str):
        with self.connection() as db:
            row = db.execute("SELECT * FROM passkeys WHERE credential_id = ?", (credential_id,)).fetchone()
        return dict(row) if row else None

    def update_passkey_counter(self, credential_id: str, sign_count: int):
        with self.connection() as db:
            db.execute("UPDATE passkeys SET sign_count = ? WHERE credential_id = ?", (sign_count, credential_id))


def now():
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def require_user(request: Request):
    user = request.app.state.auth.user_for_session(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def set_session(response: Response, token: str):
    response.set_cookie(SESSION_COOKIE, token, httponly=True, samesite="lax", secure=False, max_age=604800, path="/")
