from fastapi import APIRouter, Depends

from app.api.dependencies import require_user
from app.models.projects import NodeProjectActionRequest, NodeProjectCreateRequest, ProxyRouteCreateRequest
import uuid
from app.services.job_service import job_store
from app.services.project_service import project_service

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


@router.get("/node")
def list_node_projects(user=Depends(require_user)):
    return project_service.list_node()


@router.post("/node", status_code=201)
def create_node_project(payload: NodeProjectCreateRequest, user=Depends(require_user)):
    project = project_service.create_node(payload)
    job = job_store.enqueue_node_project_setup(f"node-project-setup-{uuid.uuid4().hex}", project)
    return {"project": project, "job": job}


@router.get("/node/{project_id}/configuration")
def node_project_configuration(project_id: str, user=Depends(require_user)):
    return project_service.configuration("node", project_id)


@router.post("/node/{project_id}/actions", status_code=202)
def node_project_action(project_id: str, payload: NodeProjectActionRequest, user=Depends(require_user)):
    project = project_service.get_node(project_id)
    return job_store.enqueue_node_project_action(f"node-project-{payload.action}-{uuid.uuid4().hex}", project, payload.action)


@router.get("/proxy")
def list_proxy_routes(user=Depends(require_user)):
    return project_service.list_proxy()


@router.post("/proxy", status_code=201)
def create_proxy_route(payload: ProxyRouteCreateRequest, user=Depends(require_user)):
    route = project_service.create_proxy(payload)
    job = job_store.enqueue_action(f"provider-reload-proxy-{route.id}-{uuid.uuid4().hex[:8]}", route.server_type, "restart")
    return {"route": route, "job": job}


@router.get("/proxy/{route_id}/configuration")
def proxy_route_configuration(route_id: str, user=Depends(require_user)):
    return project_service.configuration("proxy", route_id)
