from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.dependencies import require_user
from app.auth import SESSION_COOKIE, set_session
from app.models.auth import LoginRequest
from app.services.passkey_service import authentication_options, registration_options, verify_authentication, verify_registration

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response):
    token = request.app.state.auth_service.login(payload.username, payload.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_session(response, token)
    return {"username": payload.username}


@router.post("/mobile-login")
def mobile_login(payload: LoginRequest, request: Request):
    session_token = request.app.state.auth_service.login(payload.username, payload.password)
    if session_token is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    user = request.app.state.auth_service.store.user_for_session(session_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    platform = request.headers.get("x-server-engine-platform", "ios")
    if platform not in {"ios", "android", "web"}:
        platform = "ios"
    device_name = request.headers.get("x-server-engine-device-name", "Mobile device")[:120]
    token = request.app.state.auth_service.store.create_api_token(
        user["id"],
        f"Server Engine Mobile — {device_name}",
        ["read:*", "write:websites", "write:services"],
        90,
        device_name=device_name,
        platform=platform,
        created_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    request.app.state.auth_service.logout(session_token)
    return {**token, "username": user["username"]}


@router.get("/me")
def me(user=Depends(require_user)):
    return user


@router.post("/logout")
def logout(request: Request, response: Response, user=Depends(require_user)):
    request.app.state.auth_service.logout(request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/passkey/status")
def passkey_status(user=Depends(require_user)):
    return {"enabled": True}


@router.post("/passkey/register/options")
def passkey_register_options(request: Request, user=Depends(require_user)):
    return registration_options(request, request.app.state.auth_service.store, user)


@router.post("/passkey/register/verify")
def passkey_register_verify(payload: dict, request: Request, user=Depends(require_user)):
    return verify_registration(request, request.app.state.auth_service.store, user, payload.get("credential", payload))


@router.post("/passkey/login/options")
def passkey_login_options(request: Request):
    return authentication_options(request, request.app.state.auth_service.store)


@router.post("/passkey/login/verify")
def passkey_login_verify(payload: dict, request: Request, response: Response):
    store = request.app.state.auth_service.store
    user_id = verify_authentication(request, store, payload.get("credential", payload))
    token = store.create_session_for_user(user_id)
    set_session(response, token)
    user = store.user_by_id(user_id)
    return user
