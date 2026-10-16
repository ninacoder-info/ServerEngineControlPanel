import base64
import json
import os
from pathlib import Path

import httpx


class StalwartProviderError(RuntimeError):
    pass


class StalwartProvider:
    """Small management-API client for the managed Stalwart instance."""

    def __init__(self):
        self.base_url = os.getenv("SE_STALWART_URL", "http://127.0.0.1:8080").rstrip("/")
        self.token = os.getenv("SE_STALWART_TOKEN", "").strip()
        self.username = os.getenv("SE_STALWART_USER", "").strip()
        self.password = os.getenv("SE_STALWART_PASSWORD", "")
        self.verify_tls = os.getenv("SE_STALWART_VERIFY_TLS", "true").lower() not in {"0", "false", "no"}

    def _headers(self) -> dict[str, str]:
        # The managed credential file is the canonical credential shared with
        # the Stalwart process through STALWART_RECOVERY_ADMIN. Read it for
        # every request so a newly provisioned or repaired installation does
        # not keep stale credentials captured when the control plane imported
        # this module.
        token = os.getenv("SE_STALWART_TOKEN", "").strip()
        configured_username = os.getenv("SE_STALWART_USER", "").strip()
        configured_password = os.getenv("SE_STALWART_PASSWORD", "")
        if token:
            return {"Authorization": f"Bearer {token}"}
        if configured_username and configured_password:
            value = base64.b64encode(
                f"{configured_username}:{configured_password}".encode()
            ).decode()
            return {"Authorization": f"Basic {value}"}

        username = ""
        password = ""
        credentials_path = os.getenv("SE_STALWART_CREDENTIALS_FILE", "/opt/server-engine/services/stalwart/conf/serverengine-credentials.json")
        try:
            credentials = json.loads(Path(credentials_path).read_text())
            username = str(credentials.get("username", "")).strip()
            password = str(credentials.get("password", ""))
        except (OSError, ValueError, TypeError):
            username = os.getenv("SE_STALWART_USER", "").strip()
            password = os.getenv("SE_STALWART_PASSWORD", "")
        if not username or not password:
            username = os.getenv("SE_STALWART_USER", "").strip()
            password = os.getenv("SE_STALWART_PASSWORD", "")
        if username and password:
            value = base64.b64encode(f"{username}:{password}".encode()).decode()
            return {"Authorization": f"Basic {value}"}
        raise StalwartProviderError(
            "Stalwart management credentials are not configured. Set SE_STALWART_TOKEN "
            "or SE_STALWART_USER and SE_STALWART_PASSWORD before provisioning mailboxes."
        )

    def _call(self, method: str, arguments: dict) -> dict:
        payload = {
            "using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
            "methodCalls": [[method, arguments, "server-engine"]],
        }
        try:
            response = httpx.post(
                f"{self.base_url}/jmap",
                headers={**self._headers(), "content-type": "application/json"},
                json=payload,
                timeout=30,
                verify=self.verify_tls,
            )
            response.raise_for_status()
            body = response.json()
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 401:
                raise StalwartProviderError(
                    "Stalwart rejected the configured management credentials (HTTP 401). "
                    "Restart Stalwart from its Runtime tab to reapply the managed recovery credential, "
                    "or configure SE_STALWART_TOKEN / SE_STALWART_USER and SE_STALWART_PASSWORD."
                ) from error
            raise StalwartProviderError(
                f"Stalwart management API unavailable: {error}"
            ) from error
        except httpx.HTTPError as error:
            raise StalwartProviderError(f"Stalwart management API unavailable: {error}") from error
        except ValueError as error:
            raise StalwartProviderError("Stalwart returned an invalid management response.") from error

        responses = body.get("methodResponses") or []
        if not responses:
            raise StalwartProviderError("Stalwart returned no management response.")
        response_method, result, _ = responses[0]
        if response_method.endswith("/error") or "type" in result and result.get("type") == "invalidArguments":
            detail = result.get("description") or result.get("detail") or result.get("type") or "operation rejected"
            raise StalwartProviderError(f"Stalwart rejected {method}: {detail}")
        return result

    def _domain_id(self, domain: str) -> str:
        result = self._call("x:Domain/query", {"filter": {"name": domain}, "limit": 1})
        ids = result.get("ids") or []
        if ids:
            return ids[0]
        result = self._call("x:Domain/set", {"create": {"new-domain": {
            "name": domain,
            "aliases": {},
            "certificateManagement": {"@type": "Manual"},
            "dkimManagement": {"@type": "Automatic"},
            "dnsManagement": {"@type": "Manual"},
            "subAddressing": {"@type": "Enabled"},
        }}})
        created = result.get("created", {}).get("new-domain")
        if not created or not created.get("id"):
            raise StalwartProviderError(f"Stalwart did not return an ID for domain {domain}.")
        return created["id"]

    def ensure_domain(self, domain: str) -> str:
        """Create the hosted domain when absent and return its Stalwart ID."""
        return self._domain_id(domain)

    def domain_dns_data(self, domain: str) -> dict:
        """Return Stalwart's generated DNS zone and DKIM signatures for a domain."""
        domain_id = self._domain_id(domain)
        result = self._call("x:Domain/get", {"ids": [domain_id]})
        domains = result.get("list") or []
        if not domains:
            raise StalwartProviderError(f"Stalwart did not return DNS data for {domain}.")
        dkim_query = self._call("x:DkimSignature/query", {"filter": {"domainId": domain_id}})
        dkim_ids = dkim_query.get("ids") or []
        signatures = []
        if dkim_ids:
            dkim_result = self._call("x:DkimSignature/get", {"ids": dkim_ids})
            signatures = dkim_result.get("list") or []
        return {"domain": domains[0], "dkim": signatures}

    def set_default_hostname(self, hostname: str) -> None:
        self._call("x:SystemSettings/set", {"update": {"singleton": {"defaultHostname": hostname}}})

    def create_mailbox(self, address: str, password: str, quota_bytes: int) -> str:
        local, domain = address.split("@", 1)
        domain_id = self._domain_id(domain)
        result = self._call("x:Account/set", {"create": {"new-account": {
            "@type": "User",
            "name": local,
            "domainId": domain_id,
            "credentials": [{"@type": "Password", "secret": password}],
            "memberGroupIds": {},
            "roles": {"@type": "User"},
            "permissions": {"@type": "Inherit"},
            "quotas": {"maxDiskQuota": quota_bytes},
            "aliases": [],
            "encryptionAtRest": {"@type": "Disabled"},
        }}})
        created = result.get("created", {}).get("new-account")
        if not created or not created.get("id"):
            raise StalwartProviderError(f"Stalwart did not return an ID for {address}.")
        return created["id"]

    def delete_mailbox(self, provider_id: str):
        self._call("x:Account/set", {"destroy": [provider_id]})


stalwart_provider = StalwartProvider()
