"""Persistent credentials for databases created through the control panel."""

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DatabaseCredentialsStore:
    """Recoverable credentials stored in the protected control-plane SQLite DB."""

    def __init__(self, path: str | None = None):
        self.path = Path(path or os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db"))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._setup()

    def _connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _setup(self):
        with self._connection() as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS managed_database_credentials (
                    engine TEXT NOT NULL,
                    database_name TEXT NOT NULL,
                    username TEXT NOT NULL,
                    password TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (engine, database_name)
                )
                """
            )
        try:
            self.path.chmod(0o600)
        except OSError:
            pass

    def save(self, engine: str, database_name: str, username: str, password: str):
        timestamp = _now()
        with self._connection() as db:
            db.execute(
                """
                INSERT INTO managed_database_credentials
                    (engine, database_name, username, password, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(engine, database_name) DO UPDATE SET
                    username = excluded.username,
                    password = excluded.password,
                    updated_at = excluded.updated_at
                """,
                (engine, database_name, username, password, timestamp, timestamp),
            )

    def public_for(self, engine: str, database_name: str) -> dict | None:
        with self._connection() as db:
            row = db.execute(
                "SELECT username, updated_at FROM managed_database_credentials WHERE engine = ? AND database_name = ?",
                (engine, database_name),
            ).fetchone()
        if not row:
            return None
        return {"username": row["username"], "credentials_saved_at": row["updated_at"]}

    def secret_for(self, engine: str, database_name: str) -> dict | None:
        with self._connection() as db:
            row = db.execute(
                "SELECT username, password, updated_at FROM managed_database_credentials WHERE engine = ? AND database_name = ?",
                (engine, database_name),
            ).fetchone()
        return dict(row) if row else None


database_credentials = DatabaseCredentialsStore()
