import base64
import json
import os
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from webauthn import (
    base64url_to_bytes,
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import options_to_json
from webauthn.helpers.structs import PublicKeyCredentialDescriptor, UserVerificationRequirement


def encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def decode(value: str) -> bytes:
    return base64url_to_bytes(value)


def relying_party(request: Request) -> tuple[str, str]:
    browser_origin = request.headers.get("origin", "")
    parsed_origin = urlparse(browser_origin) if browser_origin else None
    browser_host = parsed_origin.hostname if parsed_origin else None
    host = os.getenv("SE_WEBAUTHN_RP_ID") or browser_host or request.url.hostname or "localhost"
    origin = os.getenv("SE_WEBAUTHN_ORIGIN") or browser_origin or f"{request.url.scheme}://{request.headers.get('host', host)}"
    return host, origin


def registration_options(request: Request, store, user: dict):
    rp_id, _ = relying_party(request)
    existing = store.passkeys_for_user(user["id"])
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name="Server Engine Control Panel",
        user_id=str(user["id"]).encode(),
        user_name=user["username"],
        exclude_credentials=[PublicKeyCredentialDescriptor(id=decode(item["credential_id"])) for item in existing],
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    payload = json.loads(options_to_json(options))
    store.save_challenge("registration", payload["challenge"], user["id"])
    return payload


def verify_registration(request: Request, store, user: dict, credential: dict):
    challenge = store.consume_challenge("registration")
    if not challenge or challenge["user_id"] != user["id"]:
        raise HTTPException(status_code=400, detail="The passkey registration request expired. Try again.")
    rp_id, origin = relying_party(request)
    try:
        verification = verify_registration_response(
            credential=credential,
            expected_challenge=decode(challenge["challenge"]),
            expected_rp_id=rp_id,
            expected_origin=origin,
            require_user_verification=False,
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"Passkey registration failed: {error}") from error
    credential_id = encode(verification.credential_id)
    public_key = encode(verification.credential_public_key)
    transports = credential.get("response", {}).get("transports", [])
    store.save_passkey(credential_id, user["id"], public_key, verification.sign_count, transports)
    return {"registered": True, "credential_id": credential_id}


def authentication_options(request: Request, store):
    rp_id, _ = relying_party(request)
    options = generate_authentication_options(
        rp_id=rp_id,
        user_verification=UserVerificationRequirement.PREFERRED,
    )
    payload = json.loads(options_to_json(options))
    store.save_challenge("authentication", payload["challenge"])
    return payload


def verify_authentication(request: Request, store, credential: dict):
    challenge = store.consume_challenge("authentication")
    if not challenge:
        raise HTTPException(status_code=400, detail="The passkey sign-in request expired. Try again.")
    credential_id = credential.get("id")
    record = store.passkey(credential_id or "")
    if not record:
        raise HTTPException(status_code=401, detail="This passkey is not registered with this panel.")
    rp_id, origin = relying_party(request)
    try:
        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=decode(challenge["challenge"]),
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=decode(record["public_key"]),
            credential_current_sign_count=record["sign_count"],
            require_user_verification=False,
        )
    except Exception as error:
        raise HTTPException(status_code=401, detail=f"Passkey sign-in failed: {error}") from error
    store.update_passkey_counter(credential_id, verification.new_sign_count)
    return record["user_id"]
