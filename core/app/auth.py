import hashlib
import hmac
import secrets
import sqlite3
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
            """)
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
