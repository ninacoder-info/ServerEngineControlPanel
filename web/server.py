"""Production web runtime for the compiled Server Engine panel.

The release contains the compiled React app, so customer servers only need
Python. HTTP and WebSocket API traffic are proxied to the loopback core API.
"""

import asyncio
import os
from pathlib import Path

import httpx
import websockets
from starlette.applications import Starlette
from starlette.responses import FileResponse, Response
from starlette.routing import Route, WebSocketRoute
from starlette.websockets import WebSocket


WEB_DIST = Path(os.environ["SE_WEB_DIST"]).resolve()
API_URL = os.getenv("API_URL", "http://127.0.0.1:2510").rstrip("/")
API_WS_URL = API_URL.replace("https://", "wss://").replace("http://", "ws://")


def _forward_headers(headers):
    excluded = {
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
        "upgrade",
        "sec-websocket-key",
        "sec-websocket-version",
        "sec-websocket-extensions",
        "sec-websocket-protocol",
    }
    return {key: value for key, value in headers.items() if key.lower() not in excluded}


async def api_proxy(request):
    body = await request.body()
    target = f"{API_URL}{request.url.path}"
    if request.url.query:
        target = f"{target}?{request.url.query}"
    async with httpx.AsyncClient(follow_redirects=False, timeout=None) as client:
        upstream = await client.request(
            request.method,
            target,
            headers=_forward_headers(request.headers),
            content=body,
        )
    response_headers = {
        key: value
        for key, value in upstream.headers.items()
        if key.lower() not in {"connection", "keep-alive", "transfer-encoding"}
    }
    return Response(
        upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
    )


async def websocket_proxy(websocket: WebSocket):
    await websocket.accept()
    target = f"{API_WS_URL}{websocket.url.path}"
    if websocket.url.query:
        target = f"{target}?{websocket.url.query}"
    headers = _forward_headers(websocket.headers)
    try:
        async with websockets.connect(target, additional_headers=headers, max_size=None) as upstream:
            async def browser_to_core():
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        return
                    if message.get("text") is not None:
                        await upstream.send(message["text"])
                    elif message.get("bytes") is not None:
                        await upstream.send(message["bytes"])

            async def core_to_browser():
                async for message in upstream:
                    if isinstance(message, bytes):
                        await websocket.send_bytes(message)
                    else:
                        await websocket.send_text(message)

            tasks = [asyncio.create_task(browser_to_core()), asyncio.create_task(core_to_browser())]
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                task.exception() if not task.cancelled() else None
    except Exception as exc:
        if websocket.client_state.name != "DISCONNECTED":
            await websocket.close(code=1011, reason=str(exc)[:120])


async def frontend(request):
    requested = (WEB_DIST / request.path_params.get("path", "")).resolve()
    if requested.is_file() and WEB_DIST in requested.parents:
        return FileResponse(requested)
    return FileResponse(WEB_DIST / "index.html")


app = Starlette(
    routes=[
        WebSocketRoute("/api/{path:path}", websocket_proxy),
        Route("/api/{path:path}", api_proxy, methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]),
        Route("/{path:path}", frontend, methods=["GET", "HEAD"]),
    ]
)
