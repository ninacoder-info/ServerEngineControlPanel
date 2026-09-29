import hashlib
import hmac
import secrets
import sqlite3
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, Request, Response, status

SESSION_COOKIE = "se_session"
PBKDF2_ROUNDS = 310_000


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
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    expires_at TEXT NOT NULL
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
            """)
            columns = {row["name"] for row in db.execute("PRAGMA table_info(api_tokens)").fetchall()}
            migrations = {
                "created_ip": "TEXT",
                "last_used_ip": "TEXT",
                "user_agent": "TEXT",
                "platform": "TEXT NOT NULL DEFAULT 'web'",
                "device_name": "TEXT",
                "revoked_at": "TEXT",
            }
            for name, definition in migrations.items():
                if name not in columns:
                    db.execute(f"ALTER TABLE api_tokens ADD COLUMN {name} {definition}")
            if db.execute("SELECT 1 FROM users LIMIT 1").fetchone() is None:
                db.execute("INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)", (self.bootstrap_user, hash_password(self.bootstrap_password), now().isoformat()))

    def authenticate(self, username: str, password: str) -> int | None:
        with self.connection() as db:
            row = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
        return int(row["id"]) if row and verify_password(password, row["password_hash"]) else None

    def create_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(40)
        expires = now() + timedelta(days=7)
        with self.connection() as db:
            db.execute("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash(token), user_id, expires.isoformat()))
        return token

    def create_session_for_user(self, user_id: int) -> str:
        return self.create_session(user_id)

    def user_by_id(self, user_id: int):
        with self.connection() as db:
            row = db.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def user_for_session(self, token: str | None):
        if not token:
            return None
        with self.connection() as db:
            row = db.execute("SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?", (token_hash(token), now().isoformat())).fetchone()
        return dict(row) if row else None

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
                "SELECT users.id, users.username, api_tokens.id AS token_id, api_tokens.last_used_at FROM api_tokens JOIN users ON users.id = api_tokens.user_id WHERE api_tokens.token_hash = ? AND api_tokens.revoked_at IS NULL AND (api_tokens.expires_at IS NULL OR api_tokens.expires_at > ?)",
                (token_hash(token), now().isoformat()),
            ).fetchone()
            if not row:
                return None
            current = now()
            previous = datetime.fromisoformat(row["last_used_at"]) if row["last_used_at"] else None
            if not previous or (current - previous).total_seconds() >= 60:
                db.execute("UPDATE api_tokens SET last_used_at = ?, last_used_ip = ? WHERE id = ?", (current.isoformat(), request.client.host if request and request.client else None, row["token_id"]))
        return {"id": row["id"], "username": row["username"]}

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
