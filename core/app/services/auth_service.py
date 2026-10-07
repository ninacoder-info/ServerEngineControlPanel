from app.auth import AuthStore
from app.services.settings_service import settings_service


class LoginLockedError(RuntimeError):
    def __init__(self, retry_after: int):
        super().__init__("Too many failed login attempts. Try again later.")
        self.retry_after = retry_after


class AuthService:
    def __init__(self, store: AuthStore):
        self.store = store

    def login(self, username: str, password: str, client_ip: str | None = None) -> str | None:
        security = settings_service.read_security()
        attempt_keys = [f"user|{username.strip().lower()}|{client_ip or 'unknown'}"]
        if client_ip:
            attempt_keys.append(f"ip|{client_ip}")
            # Read the pre-IP-lockout key format so existing lockouts survive
            # the migration without requiring a database reset.
            attempt_keys.append(f"{username.strip().lower()}|{client_ip}")
        brute_force_enabled = security.get("security_brute_force", True)
        if brute_force_enabled and any(self.store.login_is_locked(key) for key in attempt_keys):
            raise LoginLockedError(int(security.get("security_lockout_minutes", 15)) * 60)
        user_id = self.store.authenticate(username, password)
        if user_id is not None:
            if brute_force_enabled:
                for key in attempt_keys:
                    self.store.clear_login_failures(key)
            self.store.record_login(user_id, client_ip)
        elif brute_force_enabled:
            for key in attempt_keys:
                self.store.record_login_failure(key, int(security.get("security_max_failed_attempts", 5)), int(security.get("security_lockout_minutes", 15)))
        return self.store.create_session(user_id) if user_id is not None else None

    def current_user(self, token: str | None):
        return self.store.user_for_session(token)

    def logout(self, token: str | None):
        self.store.delete_session(token)
