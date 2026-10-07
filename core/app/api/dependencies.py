import ipaddress

from fastapi import HTTPException, Request, status

from app.auth import SESSION_COOKIE
from app.services.settings_service import settings_service
from app.services.account_isolation import account_isolation


def require_user(request: Request):
    user = request.app.state.auth_service.current_user(request.cookies.get(SESSION_COOKIE))
    authorization = request.headers.get("authorization", "")
    bearer = authorization.lower().startswith("bearer ")
    api_settings = settings_service.read()
    if bearer:
        if not api_settings.get("api_enabled", True):
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="External API access is disabled")
        if api_settings.get("api_auth_mode") == "session":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token access is disabled")
        user = request.app.state.auth_service.store.user_for_api_token(authorization[7:].strip(), request=request)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    # A hosting-account session is valid only while its account is active.
    # Administrators do not have an account scope and retain server-wide access.
    account_isolation.account_for_user(user)
    if user.get("role") == "hosting_account":
        allowed_prefixes = (
            "/api/v1/auth",
            "/api/v1/api-access",
            "/api/v1/websites",
            "/api/v1/domains",
            "/api/v1/databases",
            "/api/v1/email",
            "/api/v1/backups",
            "/api/v1/file-manager",
            "/api/v1/ftp",
            "/api/v1/cron",
        )
        if not request.url.path.startswith(allowed_prefixes):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This resource is reserved for server administrators")
    allowed = api_settings.get("security_authorized_ips", [])
    if allowed:
        client_ip = request.client.host if request.client else ""
        try:
            address = ipaddress.ip_address(client_ip)
            permitted = any(
                address in ipaddress.ip_network(entry.strip(), strict=False)
                for entry in allowed
            )
        except ValueError:
            permitted = False
        if not permitted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This client IP is not authorized to access the control panel",
            )
    return user


def require_administrator(request: Request):
    user = require_user(request)
    if user.get("role") != "administrator":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return user
