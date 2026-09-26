from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.dependencies import require_user
from app.auth import SESSION_COOKIE, set_session
from app.models.auth import LoginRequest

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response):
    token = request.app.state.auth_service.login(payload.username, payload.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_session(response, token)
    return {"username": payload.username}


@router.get("/me")
def me(user=Depends(require_user)):
    return user


@router.post("/logout")
def logout(request: Request, response: Response, user=Depends(require_user)):
    request.app.state.auth_service.logout(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
