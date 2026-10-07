from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.api.dependencies import require_user
from app.auth import SESSION_COOKIE, set_session
from app.models.auth import LoginRequest
from app.services.passkey_service import authentication_options, registration_options, verify_authentication, verify_registration
from app.services.job_service import job_store
from app.services.auth_service import LoginLockedError

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _audit(request, action, actor, target, detail, status, user_id=None):
    event = request.app.state.auth_service.store.record_activity("security", action, actor, target, detail, status, actor_user_id=user_id, source_ip=request.client.host if request.client else None)
    job_store.publish({"type": "activity", "event": event})


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response):
    try:
        token = request.app.state.auth_service.login(payload.username, payload.password, request.client.host if request.client else None)
    except LoginLockedError as error:
        _audit(request, "login.locked", payload.username, payload.username, "Panel login blocked by brute-force protection.", "error")
        return JSONResponse(status_code=429, headers={"Retry-After": str(error.retry_after)}, content={"message": "Too Many Requests", "errors": {"username": [str(error)]}})
    if token is None:
        _audit(request, "login.failed", payload.username, payload.username, "Panel login failed.", "error")
        return JSONResponse(status_code=401, content={"message": "Unauthorized", "errors": {"username": ["These credentials do not match our records."]}})
    user = request.app.state.auth_service.store.user_for_session(token)
    _audit(request, "login", user["username"] if user else payload.username, payload.username, "Panel login succeeded.", "success", user["id"] if user else None)
    set_session(response, token)
    return {"username": payload.username}


@router.post("/mobile-login")
def mobile_login(payload: LoginRequest, request: Request):
    try:
        session_token = request.app.state.auth_service.login(payload.username, payload.password, request.client.host if request.client else None)
    except LoginLockedError as error:
        _audit(request, "mobile-login.locked", payload.username, payload.username, "Mobile login blocked by brute-force protection.", "error")
        return JSONResponse(status_code=429, headers={"Retry-After": str(error.retry_after)}, content={"message": "Too Many Requests", "errors": {"username": [str(error)]}})
    if session_token is None:
        _audit(request, "mobile-login.failed", payload.username, payload.username, "Mobile login failed.", "error")
        return JSONResponse(status_code=401, content={"message": "Unauthorized", "errors": {"username": ["These credentials do not match our records."]}})

    user = request.app.state.auth_service.store.user_for_session(session_token)
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    _audit(request, "mobile-login", user["username"], user["username"], "Mobile login succeeded.", "success", user["id"])

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
    _audit(request, "logout", user["username"], user["username"], "Panel session ended.", "success", user["id"])
    return {"ok": True}


@router.get("/passkey/status")
def passkey_status(user=Depends(require_user)):
    return {"enabled": True}


@router.post("/passkey/register/options")
def passkey_register_options(request: Request, user=Depends(require_user)):
    return registration_options(request, request.app.state.auth_service.store, user)


@router.post("/passkey/register/verify")
def passkey_register_verify(payload: dict, request: Request, user=Depends(require_user)):
    result = verify_registration(request, request.app.state.auth_service.store, user, payload.get("credential", payload))
    _audit(request, "passkey.registered", user["username"], user["username"], "A new passkey was registered for the panel account.", "success", user["id"])
    return result


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
    _audit(request, "passkey.login", user["username"], user["username"], "Panel login succeeded with a passkey.", "success", user["id"])
    return user
