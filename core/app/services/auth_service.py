from app.auth import AuthStore


class AuthService:
    def __init__(self, store: AuthStore):
        self.store = store

    def login(self, username: str, password: str, client_ip: str | None = None) -> str | None:
        user_id = self.store.authenticate(username, password)
        if user_id is not None:
            self.store.record_login(user_id, client_ip)
        return self.store.create_session(user_id) if user_id is not None else None

    def current_user(self, token: str | None):
        return self.store.user_for_session(token)

    def logout(self, token: str | None):
        self.store.delete_session(token)
