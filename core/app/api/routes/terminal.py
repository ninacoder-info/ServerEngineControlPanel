import asyncio
import ipaddress
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
from app.services.job_service import job_store
from app.services.service_runtime import composer_path, ensure_composer_launcher, ensure_php_terminal_launcher, php_cli_path, prepare_mysql_runtime, service_root
from app.services.settings_service import settings_service

router = APIRouter(prefix="/api/v1/terminal", tags=["terminal"])


def _audit_terminal(websocket: WebSocket, user: dict, action: str, target: str, detail: str, status: str = "info"):
    """Record terminal lifecycle events without ever recording shell input.

    Terminal input can contain passwords, API keys, and private data, so only
    the connection kind and safe target are retained in the activity stream.
    """
    event = websocket.app.state.auth_service.store.record_activity(
        "access",
        action,
        user.get("username", "unknown"),
        target,
        detail,
        status,
        metadata={"Terminal kind": target.split(":", 1)[0]},
        actor_user_id=user.get("id"),
        source_ip=websocket.client.host if websocket.client else None,
    )
    job_store.publish({"type": "activity", "event": event})


def resize(fd: int, cols: int, rows: int):
    cols = max(40, min(int(cols), 400))
    rows = max(10, min(int(rows), 200))
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    termios_ioctl = getattr(termios, "TIOCSWINSZ", 0x5414)
    import fcntl
    fcntl.ioctl(fd, termios_ioctl, winsize)


def local_runtime_environment(selected_php_version: str | None = None) -> dict[str, str]:
    """Expose installed runtimes, optionally selecting PHP for this shell only."""
    environment = os.environ.copy()
    tool_paths = []
    mysql_client = service_root("mysql") / "bin/mysql"
    if mysql_client.exists():
        try:
            environment.update(prepare_mysql_runtime(service_root("mysql")))
        except Exception:
            # Keep the terminal available even if optional MySQL libraries cannot
            # be staged; the client will report its own dependency error.
            pass
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
        (item for item in versions_root.iterdir() if item.is_dir() and php_cli_path(item.name).is_file()),
        reverse=True,
    )
    selected_root = next((item for item in versions if item.name == selected_php_version), None) if selected_php_version else None
    if selected_php_version and not selected_root:
        selected_php_version = None
    if selected_root:
        ensure_php_terminal_launcher(selected_root.name)
        selected_php = selected_root / "usr/bin/php"
        if selected_php.exists():
            environment["SE_SELECTED_PHP"] = str(selected_php)
            environment["SE_SELECTED_PHP_VERSION"] = selected_root.name
            environment["PHP_INI_SCAN_DIR"] = str(selected_root / "conf/conf.d")
            environment["SE_TERMINAL_NOTE"] = "selected"
            composer_archive = composer_path().parent.parent / "composer.phar"
            if composer_archive.exists():
                environment["SE_SELECTED_COMPOSER_PHAR"] = str(composer_archive)
            wp_root = service_root("wp-cli") / "versions"
            wp_archives = sorted(wp_root.glob("*/wp-cli.phar"), reverse=True) if wp_root.exists() else []
            if wp_archives:
                environment["SE_SELECTED_WP_CLI_PHAR"] = str(wp_archives[0])
    bin_paths = []
    library_paths = []
    ordered_versions = ([selected_root] if selected_root else []) + [item for item in versions if item is not selected_root]
    for version_root in ordered_versions:
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
    authorization = websocket.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        api_settings = settings_service.read()
        if not api_settings.get("api_enabled", True):
            await websocket.close(code=1008, reason="External API access is disabled")
            return
        if api_settings.get("api_auth_mode") == "session":
            await websocket.close(code=1008, reason="Bearer token access is disabled")
            return
        user = websocket.app.state.auth_service.store.user_for_api_token(
            authorization[7:].strip(), request=websocket
        )
    if not user:
        await websocket.close(code=1008, reason="Authentication required")
        return
    allowed = settings_service.read().get("security_authorized_ips", [])
    if allowed:
        client_ip = websocket.client.host if websocket.client else ""
        try:
            address = ipaddress.ip_address(client_ip)
            permitted = any(
                address in ipaddress.ip_network(entry.strip(), strict=False)
                for entry in allowed
            )
        except ValueError:
            permitted = False
        if not permitted:
            await websocket.close(code=1008, reason="Client IP is not authorized")
            return
    if user.get("role") != "administrator":
        await websocket.close(code=1008, reason="Administrator access required")
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
    php_version = str(connection.get("php_version", "")).strip()
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

    if kind == "remote":
        safe_target = f"remote:{username}@{host}:{max(1, min(port, 65535))}"
        target_detail = f"Opened an authenticated SSH terminal for {username}@{host}."
    elif kind == "docker":
        safe_target = f"docker:{container_id}"
        target_detail = f"Opened an interactive terminal for Docker container {container_id}."
    else:
        safe_target = "local:server-engine"
        target_detail = "Opened an interactive local Server Engine terminal."
    _audit_terminal(websocket, user, "terminal.session.opened", safe_target, target_detail, "success")

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
            runtime_environment = local_runtime_environment(php_version or None)
            # Keep managed paths inside this terminal process. Login profiles
            # can replace PATH, so restore the isolated values after loading
            # them without changing the host OS.
            runtime_environment["SE_MANAGED_PATH"] = runtime_environment.get("PATH", "")
            runtime_environment["SE_MANAGED_LD_LIBRARY_PATH"] = runtime_environment.get("LD_LIBRARY_PATH", "")
            shell = (
                'export PATH="$SE_MANAGED_PATH"; '
                'export LD_LIBRARY_PATH="$SE_MANAGED_LD_LIBRARY_PATH"; '
                'unset SE_MANAGED_PATH SE_MANAGED_LD_LIBRARY_PATH; '
                'if [ -n "${SE_SELECTED_PHP:-}" ]; then '
                '  php() { "$SE_SELECTED_PHP" "$@"; }; export -f php; '
                '  if [ -n "${SE_SELECTED_COMPOSER_PHAR:-}" ]; then '
                '    composer() { "$SE_SELECTED_PHP" "$SE_SELECTED_COMPOSER_PHAR" "$@"; }; export -f composer; '
                '  fi; '
                '  if [ -n "${SE_SELECTED_WP_CLI_PHAR:-}" ]; then '
                '    wp() { "$SE_SELECTED_PHP" "$SE_SELECTED_WP_CLI_PHAR" "$@"; }; export -f wp; '
                '  fi; '
                '  printf "\\r\\n\\033[36mServer Engine terminal: PHP %s selected; php, composer, and wp-cli use this runtime.\\033[0m\\r\\n" "$SE_SELECTED_PHP_VERSION"; '
                'fi; exec bash -i'
            )
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
            # pty.fork() creates a new session for the shell. Signal its full
            # process group so commands started inside the terminal do not
            # survive after the WebSocket closes.
            os.killpg(pid, signal.SIGHUP)
        with suppress(OSError):
            os.close(fd)
        if temporary_key:
            with suppress(OSError):
                os.unlink(temporary_key.name)
        _audit_terminal(
            websocket,
            user,
            "terminal.session.closed",
            safe_target,
            f"Closed terminal session for {safe_target}.",
            "info",
        )
