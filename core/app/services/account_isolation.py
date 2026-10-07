"""Ownership, lifecycle, and quota enforcement for hosting accounts.

Panel administrators intentionally remain server-wide operators. Hosting-account
users receive an account context and every managed resource must be claimed in
this table before it is exposed to them.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class AccountIsolationService:
    RESOURCE_QUOTAS = {
        "website": "websites_quota",
        "database": "databases_quota",
        "mailbox": "mailboxes_quota",
        "ftp": "ftp_quota",
        "cron": "cron_quota",
    }

    def __init__(self) -> None:
        self.path = Path(os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db"))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._setup()

    def connection(self):
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _setup(self) -> None:
        with self.connection() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS resource_ownership (
                    resource_type TEXT NOT NULL,
                    resource_id TEXT NOT NULL,
                    account_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    deleted_at TEXT,
                    PRIMARY KEY(resource_type, resource_id)
                );
                CREATE INDEX IF NOT EXISTS idx_resource_ownership_account
                    ON resource_ownership(account_id, resource_type, deleted_at);
                CREATE TABLE IF NOT EXISTS account_deletion_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    original_path TEXT NOT NULL,
                    snapshot_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    restored_at TEXT
                );
                """
            )

    @staticmethod
    def is_admin(user: dict) -> bool:
        return user.get("role") == "administrator"

    def account_for_user(self, user: dict, *, require_active: bool = True) -> dict | None:
        if self.is_admin(user):
            return None
        with self.connection() as db:
            row = db.execute(
                "SELECT * FROM hosting_accounts WHERE user_id = ?",
                (user.get("id"),),
            ).fetchone()
        if not row:
            raise HTTPException(status_code=403, detail="This user is not assigned to a hosting account")
        account = dict(row)
        if require_active and account["status"] != "active":
            message = "This hosting account is suspended" if account["status"] == "suspended" else "This hosting account is unavailable"
            raise HTTPException(status_code=403, detail=message)
        return account

    def account_id_for_user(self, user: dict) -> int | None:
        account = self.account_for_user(user)
        return int(account["id"]) if account else None

    def usage(self, account_id: int) -> dict:
        with self.connection() as db:
            rows = db.execute(
                "SELECT resource_type, COUNT(*) AS count FROM resource_ownership WHERE account_id = ? AND deleted_at IS NULL GROUP BY resource_type",
                (account_id,),
            ).fetchall()
        return {row["resource_type"]: int(row["count"]) for row in rows}

    @staticmethod
    def disk_usage(account: dict) -> int:
        root = Path(account["home_path"])
        if not root.exists():
            return 0
        total = 0
        for path in root.rglob("*"):
            try:
                if path.is_file() and not path.is_symlink():
                    total += path.stat().st_size
            except OSError:
                continue
        return total

    def assert_disk_quota(self, user: dict, additional_bytes: int = 0) -> None:
        account = self.account_for_user(user)
        if not account:
            return
        used = self.disk_usage(account)
        limit = int(account.get("disk_quota_mb") or 0) * 1024 * 1024
        if used + max(0, additional_bytes) > limit:
            raise HTTPException(status_code=409, detail=f"The disk quota has been reached ({account['disk_quota_mb']} MB).")

    def assert_quota(self, user: dict, resource_type: str, amount: int = 1) -> dict | None:
        account = self.account_for_user(user)
        if not account:
            return None
        column = self.RESOURCE_QUOTAS.get(resource_type)
        if not column:
            return account
        current = self.usage(int(account["id"])).get(resource_type, 0)
        limit = int(account.get(column) or 0)
        if current + amount > limit:
            raise HTTPException(status_code=409, detail=f"The {resource_type} quota has been reached ({limit}).")
        return account

    def claim(self, user: dict, resource_type: str, resource_id: str, *, check_quota: bool = True) -> None:
        account = self.account_for_user(user)
        if not account:
            return
        if check_quota:
            self.assert_quota(user, resource_type)
        with self.connection() as db:
            existing = db.execute(
                "SELECT account_id, deleted_at FROM resource_ownership WHERE resource_type = ? AND resource_id = ?",
                (resource_type, str(resource_id)),
            ).fetchone()
            if existing and existing["deleted_at"] is None and int(existing["account_id"]) != int(account["id"]):
                raise HTTPException(status_code=404, detail="Resource not found")
            if existing:
                db.execute(
                    "UPDATE resource_ownership SET account_id = ?, deleted_at = NULL WHERE resource_type = ? AND resource_id = ?",
                    (account["id"], resource_type, str(resource_id)),
                )
            else:
                db.execute(
                    "INSERT INTO resource_ownership(resource_type, resource_id, account_id, created_at) VALUES (?, ?, ?, ?)",
                    (resource_type, str(resource_id), account["id"], _now()),
                )

    def assert_access(self, user: dict, resource_type: str, resource_id: str) -> None:
        account = self.account_for_user(user)
        if not account:
            return
        with self.connection() as db:
            row = db.execute(
                "SELECT 1 FROM resource_ownership WHERE resource_type = ? AND resource_id = ? AND account_id = ? AND deleted_at IS NULL",
                (resource_type, str(resource_id), account["id"]),
            ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Resource not found")

    def filter_owned(self, user: dict, resource_type: str, resource_ids: list[str]) -> set[str] | None:
        account = self.account_for_user(user)
        if not account:
            return None
        if not resource_ids:
            return set()
        placeholders = ",".join("?" for _ in resource_ids)
        with self.connection() as db:
            rows = db.execute(
                f"SELECT resource_id FROM resource_ownership WHERE resource_type = ? AND account_id = ? AND deleted_at IS NULL AND resource_id IN ({placeholders})",
                [resource_type, account["id"], *[str(value) for value in resource_ids]],
            ).fetchall()
        return {str(row["resource_id"]) for row in rows}

    def release(self, resource_type: str, resource_id: str) -> None:
        with self.connection() as db:
            db.execute(
                "UPDATE resource_ownership SET deleted_at = ? WHERE resource_type = ? AND resource_id = ?",
                (_now(), resource_type, str(resource_id)),
            )

    def set_status(self, account_id: int, status: str) -> dict | None:
        if status not in {"active", "suspended"}:
            raise ValueError("Account status must be active or suspended")
        with self.connection() as db:
            row = db.execute("SELECT * FROM hosting_accounts WHERE id = ?", (account_id,)).fetchone()
            if not row or row["status"] == "deleted":
                return None
            db.execute("UPDATE hosting_accounts SET status = ? WHERE id = ?", (status, account_id))
            row = db.execute("SELECT * FROM hosting_accounts WHERE id = ?", (account_id,)).fetchone()
        return dict(row) if row else None

    def soft_delete(self, account_id: int) -> dict | None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        with self.connection() as db:
            row = db.execute("SELECT * FROM hosting_accounts WHERE id = ?", (account_id,)).fetchone()
            if not row or row["status"] == "deleted":
                return None
            original = Path(row["home_path"])
            snapshot = original.parent / ".deleted" / f"{original.name}-{timestamp}"
            if original.exists():
                snapshot.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(original), str(snapshot))
            db.execute("UPDATE hosting_accounts SET status = 'deleted', home_path = ? WHERE id = ?", (str(snapshot), account_id))
            db.execute("DELETE FROM sessions WHERE user_id = ?", (row["user_id"],))
            db.execute("UPDATE api_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", (_now(), row["user_id"]))
            db.execute(
                "INSERT INTO account_deletion_snapshots(account_id, original_path, snapshot_path, created_at) VALUES (?, ?, ?, ?)",
                (account_id, str(original), str(snapshot), _now()),
            )
            return dict(db.execute("SELECT * FROM hosting_accounts WHERE id = ?", (account_id,)).fetchone())

    def restore(self, account_id: int) -> dict | None:
        with self.connection() as db:
            row = db.execute("SELECT * FROM hosting_accounts WHERE id = ? AND status = 'deleted'", (account_id,)).fetchone()
            snapshot = db.execute("SELECT * FROM account_deletion_snapshots WHERE account_id = ? AND restored_at IS NULL ORDER BY id DESC LIMIT 1", (account_id,)).fetchone()
            if not row or not snapshot:
                return None
            original = Path(snapshot["original_path"])
            archived = Path(snapshot["snapshot_path"])
            if original.exists():
                raise HTTPException(status_code=409, detail="The original account home already exists")
            if archived.exists():
                original.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(archived), str(original))
            db.execute("UPDATE hosting_accounts SET status = 'active', home_path = ? WHERE id = ?", (str(original), account_id))
            db.execute("UPDATE account_deletion_snapshots SET restored_at = ? WHERE id = ?", (_now(), snapshot["id"]))
            return dict(db.execute("SELECT * FROM hosting_accounts WHERE id = ?", (account_id,)).fetchone())


account_isolation = AccountIsolationService()
