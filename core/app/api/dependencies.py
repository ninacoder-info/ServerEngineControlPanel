from fastapi import HTTPException, Request, status

from app.auth import SESSION_COOKIE


def require_user(request: Request):
    user = request.app.state.auth_service.current_user(request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user
