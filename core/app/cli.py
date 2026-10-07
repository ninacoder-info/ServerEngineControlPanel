"""Native Server Engine command line interface."""

import argparse
import getpass
import os
import subprocess
import sys
from pathlib import Path

from app.auth import AuthStore
from app.services.job_service import job_store
from app.services.service_runtime import php_fpm_paths, service_root


SUPPORTED_SERVICES = {"nginx", "mysql", "php"}


def _systemctl(*args: str) -> int:
    return subprocess.run(["systemctl", *args], check=False).returncode


def _panel(args: argparse.Namespace) -> int:
    units = ("server-engine-core.service", "server-engine-web.service")
    if args.action == "users":
        if os.geteuid() != 0:
            print("Listing panel users must be run as root (use sudo).", file=sys.stderr)
            return 1
        db_path = Path(os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db"))
        if not db_path.is_file():
            print(f"Panel database not found: {db_path}", file=sys.stderr)
            return 1
        store = AuthStore(str(db_path), os.getenv("SE_ADMIN_USER", "admin"), os.getenv("SE_ADMIN_PASSWORD") or "")
        for user in store.list_users():
            print(f"{user['username']}\t{user['role']}\t{user['status']}")
        return 0
    if args.action == "unlock-login":
        if os.geteuid() != 0:
            print("Unlocking login protection must be run as root (use sudo).", file=sys.stderr)
            return 1
        if not args.user and not args.ip and not args.all:
            print("Choose --user, --ip, or --all.", file=sys.stderr)
            return 2
        db_path = Path(os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db"))
        if not db_path.is_file():
            print(f"Panel database not found: {db_path}", file=sys.stderr)
            return 1
        store = AuthStore(str(db_path), os.getenv("SE_ADMIN_USER", "admin"), os.getenv("SE_ADMIN_PASSWORD") or "")
        cleared = store.clear_login_attempts(args.user, args.ip, args.all)
        target = "all login records" if args.all else (f"user {args.user}" if args.user else f"IP {args.ip}")
        print(f"Cleared {cleared} brute-force record(s) for {target}.")
        return 0
    if args.action == "reset-password":
        if os.geteuid() != 0:
            print("Password reset must be run as root (use sudo).", file=sys.stderr)
            return 1
        username = (args.user or "").strip()
        if not username:
            print("Password reset requires --user, for example: se panel reset-password --user admin", file=sys.stderr)
            return 2
        password = getpass.getpass("New panel password: ")
        confirmation = getpass.getpass("Confirm new panel password: ")
        if len(password) < 8:
            print("Password must contain at least 8 characters.", file=sys.stderr)
            return 2
        if password != confirmation:
            print("Passwords do not match.", file=sys.stderr)
            return 2
        db_path = Path(os.getenv("SE_DB_PATH", "/var/lib/server-engine/control.db"))
        if not db_path.is_file():
            print(f"Panel database not found: {db_path}", file=sys.stderr)
            return 1
        store = AuthStore(
            str(db_path),
            os.getenv("SE_ADMIN_USER", "admin"),
            os.getenv("SE_ADMIN_PASSWORD") or "",
        )
        if not store.reset_password(username, password):
            print(f"Panel user not found: {username}", file=sys.stderr)
            return 1
        store.record_activity(
            "security",
            "panel.password_reset",
            "ssh-root",
            username,
            "Panel password reset from the Server Engine CLI.",
            "success",
        )
        print(f"Panel password reset for {username}. Existing sessions were revoked.")
        return 0
    if args.action == "status":
        return _systemctl("status", *units, "--no-pager")
    if args.action == "logs":
        return _systemctl("status", *units, "--no-pager", "-n", str(args.lines))
    return _systemctl(args.action, *units)


def _php_status(version: str) -> bool:
    paths = php_fpm_paths(version)
    if not paths["pid"].exists():
        return False
    try:
        pid = int(paths["pid"].read_text().strip())
        os.kill(pid, 0)
    except (OSError, ValueError):
        return False
    return paths["socket"].exists()


def _service_status(service: str, version: str | None) -> int:
    if service == "php":
        if not version:
            versions_root = service_root("php") / "versions"
            versions = sorted(item.name for item in versions_root.iterdir() if item.is_dir()) if versions_root.exists() else []
            if not versions:
                print("No PHP-FPM versions are installed.")
                return 1
            for installed_version in versions:
                print(f"PHP-FPM {installed_version}: {'running' if _php_status(installed_version) else 'stopped'}")
            return 0
        print(f"PHP-FPM {version}: {'running' if _php_status(version) else 'stopped'}")
        return 0

    from app.api.routes.services import _process_running

    print(f"{service}: {'running' if _process_running(service) else 'stopped'}")
    return 0


def _service_logs(service: str, version: str | None, lines: int) -> int:
    if service == "php":
        if not version:
            print("PHP logs require --version, for example: se php logs --version 8.3")
            return 2
        path = php_fpm_paths(version)["error_log"]
    else:
        path = service_root(service) / "logs/error.log"
    if not path.exists():
        print(f"No log file found at {path}")
        return 1
    for line in path.read_text(errors="replace").splitlines()[-lines:]:
        print(line)
    return 0


def _service(args: argparse.Namespace) -> int:
    service = args.service.removeprefix("php@").lower()
    version = args.version
    if args.service.startswith("php@") and not version:
        version = args.service.split("@", 1)[1]
    if service not in SUPPORTED_SERVICES:
        print(f"Unsupported service: {service}. Supported services: {', '.join(sorted(SUPPORTED_SERVICES))}", file=sys.stderr)
        return 2
    if service == "php" and args.action != "status" and not version:
        print("PHP-FPM commands require --version, for example: se php restart --version 8.3", file=sys.stderr)
        return 2
    if args.action == "status":
        return _service_status(service, version)
    if args.action == "logs":
        return _service_logs(service, version, args.lines)
    if os.geteuid() != 0:
        print("Service commands must be run as root (use sudo).", file=sys.stderr)
        return 1

    job_id = f"cli-{args.action}-{service}-{version or 'default'}"
    job_store.create(job_id, f"{args.action.title()} {service}" + (f" {version}" if version else ""))
    job_store._run_action(job_id, service, args.action, version)
    job = next(item for item in job_store.list() if item.id == job_id)
    print(job.message or f"{service} {args.action} completed")
    if job.log and args.verbose:
        print("\n".join(job.log))
    return 0 if job.status == "succeeded" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="se", description="Manage the Server Engine panel and services")
    subparsers = parser.add_subparsers(dest="command", required=True)

    panel = subparsers.add_parser("panel", help="Control the Server Engine panel")
    panel.add_argument("action", choices=("start", "stop", "restart", "status", "logs", "users", "unlock-login", "reset-password"))
    panel.add_argument("--lines", type=int, default=80)
    panel.add_argument("--user", help="Panel username for reset-password")
    panel.add_argument("--ip", help="Source IP for unlock-login")
    panel.add_argument("--all", action="store_true", help="Clear all login lockout records")
    panel.set_defaults(handler=_panel)

    service = subparsers.add_parser("service", help="Control a managed service")
    service.add_argument("service", help="nginx, mysql, or php")
    service.add_argument("action", choices=("start", "stop", "restart", "status", "logs"))
    service.add_argument("--version", help="PHP-FPM version, for example 8.3")
    service.add_argument("--lines", type=int, default=100)
    service.add_argument("--verbose", action="store_true")
    service.set_defaults(handler=_service)

    # Short form: `se mysql restart`, `se php restart --version 8.3`.
    for service_name in sorted(SUPPORTED_SERVICES):
        command = subparsers.add_parser(service_name, help=f"Control {service_name}")
        command.add_argument("action", choices=("start", "stop", "restart", "status", "logs"))
        command.add_argument("--version", help="PHP-FPM version, for example 8.3")
        command.add_argument("--lines", type=int, default=100)
        command.add_argument("--verbose", action="store_true")
        command.set_defaults(handler=lambda args, name=service_name: _service(argparse.Namespace(**{**vars(args), "service": name})))
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
