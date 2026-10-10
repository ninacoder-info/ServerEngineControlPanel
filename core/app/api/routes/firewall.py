from fastapi import APIRouter, Depends, status

from app.api.dependencies import require_user
from app.models.firewall import (
    BlockedAddressPatch,
    BlockedAddressRequest,
    FirewallAliasPatch,
    FirewallAliasRequest,
    FirewallRulePatch,
    FirewallRuleRequest,
    NftablesConfigRequest,
    PortForwardPatch,
    PortForwardRequest,
)
from app.services.firewall_service import firewall_service
from app.services.job_service import job_store

router = APIRouter(prefix="/api/v1/firewall", tags=["firewall"])


@router.get("")
def overview(user=Depends(require_user)):
    return firewall_service.overview()


@router.get("/config")
def nftables_config(user=Depends(require_user)):
    return firewall_service.nftables_config()


@router.put("/config")
def update_nftables_config(payload: NftablesConfigRequest, user=Depends(require_user)):
    result = firewall_service.update_nftables_config(payload)
    job_store.publish({"type": "firewall-updated", "action": "nftables-config-updated", "config": result})
    return result


@router.post("/rules", status_code=status.HTTP_201_CREATED)
def create_rule(payload: FirewallRuleRequest, user=Depends(require_user)):
    return firewall_service.create_rule(payload)


@router.patch("/rules/{rule_id}")
def patch_rule(rule_id: str, payload: FirewallRulePatch, user=Depends(require_user)):
    return firewall_service.patch_rule(rule_id, payload)


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, payload: FirewallRuleRequest, user=Depends(require_user)):
    return firewall_service.update_rule(rule_id, payload)


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, user=Depends(require_user)):
    return firewall_service.delete_rule(rule_id)


@router.post("/reload")
def reload_policy(user=Depends(require_user)):
    return firewall_service.reload()


@router.post("/forwardings", status_code=status.HTTP_201_CREATED)
def create_forwarding(payload: PortForwardRequest, user=Depends(require_user)):
    return firewall_service.create_forwarding(payload)


@router.put("/forwardings/{forwarding_id}")
def update_forwarding(forwarding_id: str, payload: PortForwardRequest, user=Depends(require_user)):
    return firewall_service.update_forwarding(forwarding_id, payload)


@router.patch("/forwardings/{forwarding_id}")
def patch_forwarding(forwarding_id: str, payload: PortForwardPatch, user=Depends(require_user)):
    return firewall_service.patch_forwarding(forwarding_id, payload)


@router.delete("/forwardings/{forwarding_id}")
def delete_forwarding(forwarding_id: str, user=Depends(require_user)):
    return firewall_service.delete_forwarding(forwarding_id)


@router.post("/aliases", status_code=status.HTTP_201_CREATED)
def create_alias(payload: FirewallAliasRequest, user=Depends(require_user)):
    return firewall_service.create_alias(payload)


@router.put("/aliases/{alias_id}")
def update_alias(alias_id: str, payload: FirewallAliasRequest, user=Depends(require_user)):
    return firewall_service.update_alias(alias_id, payload)


@router.patch("/aliases/{alias_id}")
def patch_alias(alias_id: str, payload: FirewallAliasPatch, user=Depends(require_user)):
    return firewall_service.patch_alias(alias_id, payload)


@router.delete("/aliases/{alias_id}")
def delete_alias(alias_id: str, user=Depends(require_user)):
    return firewall_service.delete_alias(alias_id)


@router.post("/blocked-addresses", status_code=status.HTTP_201_CREATED)
def create_blocked_address(payload: BlockedAddressRequest, user=Depends(require_user)):
    return firewall_service.create_blocked_address(payload)


@router.put("/blocked-addresses/{blocked_id}")
def update_blocked_address(blocked_id: str, payload: BlockedAddressRequest, user=Depends(require_user)):
    return firewall_service.update_blocked_address(blocked_id, payload)


@router.patch("/blocked-addresses/{blocked_id}")
def patch_blocked_address(blocked_id: str, payload: BlockedAddressPatch, user=Depends(require_user)):
    return firewall_service.patch_blocked_address(blocked_id, payload)


@router.delete("/blocked-addresses/{blocked_id}")
def delete_blocked_address(blocked_id: str, user=Depends(require_user)):
    return firewall_service.delete_blocked_address(blocked_id)


@router.get("/traffic-activity")
def traffic_activity(user=Depends(require_user)):
    return firewall_service.traffic_activity()
