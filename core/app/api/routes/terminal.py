import asyncio
import json
import os
import pty
import re
import signal
import shutil
import struct
import termios
import tempfile
from contextlib import suppress
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth import SESSION_COOKIE
from app.services.service_runtime import composer_path, ensure_composer_launcher, ensure_php_terminal_launcher, service_root

router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])


def resize(fd: int, cols: int, rows: int):
    cols = max(40, min(int(cols), 400))
    rows = max(10, min(int(rows), 200))
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    termios_ioctl = getattr(termios, "TIOCSWINSZ", 0x5414)
    import fcntl
    fcntl.ioctl(fd, termios_ioctl, winsize)


def local_runtime_environment() -> dict[str, str]:
    """Expose installed isolated runtimes to the local management shell."""
    environment = os.environ.copy()
    tool_paths = []
    composer = composer_path()
    ensure_composer_launcher()
    composer = composer_path()
    if composer.exists() and (service_root("composer") / ".terminal-enabled").exists():
        tool_paths.append(composer.parent)
    versions_root = service_root("php") / "versions"
    if not versions_root.exists():
        if tool_paths:
            environment["PATH"] = ":".join(str(path) for path in tool_paths + [Path(item) for item in environment.get("PATH", "").split(":") if item])
        return environment
        return environment

    versions = sorted(
        (item for item in versions_root.iterdir() if item.is_dir() and (item / ".terminal-enabled").exists()),
        reverse=True,
    )
    bin_paths = []
    library_paths = []
    for version_root in versions:
        ensure_php_terminal_launcher(version_root.name)
        for relative in ("usr/bin", "bin"):
            path = version_root / relative
            if path.exists():
                bin_paths.append(path)
        for relative in (
            "lib",
            "usr/lib",
            "lib/aarch64-linux-gnu",
            "usr/lib/aarch64-linux-gnu",
            "lib/x86_64-linux-gnu",
            "usr/lib/x86_64-linux-gnu",
        ):
            path = version_root / relative
            if path.exists():
                library_paths.append(path)
    if bin_paths or tool_paths:
        environment["PATH"] = ":".join(str(path) for path in tool_paths + bin_paths + [Path(item) for item in environment.get("PATH", "").split(":") if item])
    if library_paths:
        environment["LD_LIBRARY_PATH"] = ":".join(str(path) for path in library_paths + [Path(item) for item in environment.get("LD_LIBRARY_PATH", "").split(":") if item])
    return environment


@router.websocket("/ws")
async def terminal_socket(websocket: WebSocket):
    session = websocket.cookies.get(SESSION_COOKIE)
    user = websocket.app.state.auth_service.current_user(session)
    if not user:
        await websocket.close(code=1008, reason="Authentication required")
        return

    await websocket.accept()
    try:
        first_message = await websocket.receive_text()
    except WebSocketDisconnect:
        return
    try:
        connection = json.loads(first_message)
    except json.JSONDecodeError:
        connection = {"type": "connect", "kind": "local"}
    if connection.get("type") != "connect":
        connection = {"type": "connect", "kind": "local"}
    kind = connection.get("kind", "local")
    host = str(connection.get("host", ""))
    container_id = str(connection.get("container_id", ""))
    username = str(connection.get("username", ""))
    port = int(connection.get("port", 22))
    key_path = str(connection.get("key_path", ""))
    private_key = str(connection.get("private_key", ""))
    auth_method = str(connection.get("auth_method", "key"))
    password = str(connection.get("password", ""))
    if kind == "remote" and (not host or not username):
        await websocket.send_text("\r\n\x1b[31mRemote connection requires a host and username.\x1b[0m\r\n")
        await websocket.close(code=1008, reason="Invalid remote connection")
        return
    if kind == "docker" and not container_id:
        await websocket.send_text("\r\n\x1b[31mDocker terminal requires a container.\x1b[0m\r\n")
        await websocket.close(code=1008, reason="Invalid Docker container")
        return
    if kind == "docker" and not shutil.which("docker"):
        await websocket.send_text("\r\n\x1b[31mDocker is not available to Server Engine.\x1b[0m\r\n")
        await websocket.close(code=1011, reason="Docker unavailable")
        return
    if kind == "remote" and auth_method not in {"key", "password"}:
        await websocket.send_text("\r\n\x1b[31mChoose SSH key or password authentication.\x1b[0m\r\n")
        await websocket.close(code=1008, reason="Invalid authentication method")
        return
    if kind == "remote" and not shutil.which("ssh"):
        await websocket.send_text("\r\n\x1b[31mSSH client is not installed in the Server Engine container. Restart the core container after updating Docker dependencies.\x1b[0m\r\n")
        await websocket.close(code=1011, reason="SSH client unavailable")
        return

    temporary_key = None
    if kind == "remote" and private_key.strip():
        temporary_key = tempfile.NamedTemporaryFile(mode="w", prefix="server-engine-key-", delete=False)
        temporary_key.write(private_key)
        temporary_key.close()
        os.chmod(temporary_key.name, 0o600)
        key_path = temporary_key.name

    pid, fd = pty.fork()
    if pid == 0:
        os.environ.setdefault("TERM", "xterm-256color")
        os.environ.setdefault("COLORTERM", "truecolor")
        if kind == "remote":
            command = ["ssh", "-tt", "-o", "StrictHostKeyChecking=accept-new", "-p", str(max(1, min(port, 65535)))]
            if auth_method == "key" and key_path:
                command.extend(["-i", key_path])
            command.append(f"{username}@{host}")
            os.execvp("ssh", command)
        elif kind == "docker":
            # Allocate a real interactive TTY and start a shell with a normal
            # prompt. Without -t, docker exec treats the child as a pipe and
            # many images omit PS1, leaving users with no user/path context.
            shell_script = (
                "if [ -x /bin/bash ]; then "
                "export PS1='\\u@\\h:\\w\\$ '; "
                "exec /bin/bash --noprofile --norc -i; "
                "else "
                "export PS1='\\u@\\h:\\w\\$ '; "
                "exec /bin/sh -i; "
                "fi"
            )
            os.execvp(
                "docker",
                [
                    "docker",
                    "exec",
                    "-it",
                    "-u",
                    "0:0",
                    container_id,
                    "/bin/sh",
                    "-lc",
                    shell_script,
                ],
            )
        else:
            os.chdir("/")
            runtime_environment = local_runtime_environment()
            # Keep managed paths inside this terminal process. Login profiles
            # can replace PATH, so restore the isolated values after loading
            # them without changing the host OS.
            runtime_environment["SE_MANAGED_PATH"] = runtime_environment.get("PATH", "")
            runtime_environment["SE_MANAGED_LD_LIBRARY_PATH"] = runtime_environment.get("LD_LIBRARY_PATH", "")
            shell = 'export PATH="$SE_MANAGED_PATH"; export LD_LIBRARY_PATH="$SE_MANAGED_LD_LIBRARY_PATH"; unset SE_MANAGED_PATH SE_MANAGED_LD_LIBRARY_PATH; exec bash -i'
            os.execvpe("/bin/bash", ["bash", "-lc", shell], runtime_environment)

    os.set_blocking(fd, False)
    resize(fd, 120, 32)
    loop = asyncio.get_running_loop()
    output_queue = asyncio.Queue()

    def on_pty_readable():
        try:
            data = os.read(fd, 65536)
            if not data:
                loop.remove_reader(fd)
            output_queue.put_nowait(data)
        except BlockingIOError:
            return
        except OSError:
            loop.remove_reader(fd)
            output_queue.put_nowait(b"")

    password_sent = False
    password_prompt_buffer = ""

    async def pump_output():
        nonlocal password_sent, password_prompt_buffer
        while True:
            try:
                data = await output_queue.get()
                if data:
                    text = data.decode("utf-8", errors="replace")
                    if kind == "remote" and auth_method == "password" and password and not password_sent:
                        password_prompt_buffer = (password_prompt_buffer + text)[-512:]
                        if re.search(r"password:\s*$", password_prompt_buffer, re.IGNORECASE):
                            os.write(fd, (password + "\n").encode("utf-8"))
                            password_sent = True
                    await websocket.send_text(text)
                else:
                    break
            except (OSError, EOFError, WebSocketDisconnect):
                break

    loop.add_reader(fd, on_pty_readable)
    output_task = asyncio.create_task(pump_output())
    try:
        while True:
            message = await websocket.receive_text()
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                payload = {"type": "input", "data": message}
            payload_type = payload.get("type")
            if payload_type == "input":
                os.write(fd, payload.get("data", "").encode("utf-8"))
            elif payload_type == "resize":
                resize(fd, payload.get("cols", 120), payload.get("rows", 32))
    except (WebSocketDisconnect, OSError):
        pass
    finally:
        loop.remove_reader(fd)
        output_task.cancel()
        with suppress(ProcessLookupError):
            os.kill(pid, signal.SIGHUP)
        with suppress(OSError):
            os.close(fd)
        if temporary_key:
            with suppress(OSError):
                os.unlink(temporary_key.name)
