from app.auth import AuthStore


class AuthService:
    def __init__(self, store: AuthStore):
        self.store = store

    def login(self, username: str, password: str) -> str | None:
        user_id = self.store.authenticate(username, password)
        return self.store.create_session(user_id) if user_id is not None else None

    def current_user(self, token: str | None):
        return self.store.user_for_session(token)

    def logout(self, token: str | None):
        self.store.delete_session(token)
