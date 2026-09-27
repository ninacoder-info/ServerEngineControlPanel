from fastapi import APIRouter, Depends, status

from app.api.dependencies import require_user
from app.models.firewall import FirewallRulePatch, FirewallRuleRequest
from app.services.firewall_service import firewall_service

router = APIRouter(prefix="/api/v1/firewall", tags=["firewall"])


@router.get("")
def overview(user=Depends(require_user)):
    return firewall_service.overview()


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
