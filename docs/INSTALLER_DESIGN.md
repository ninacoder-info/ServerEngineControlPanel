# Native installer design

The attached aaPanel installer was used as an operational reference only. This document records the behaviors we are intentionally reproducing in original code, without copying its implementation, branding, URLs, panel files, or telemetry.

## Reference behaviors learned

The reference installer has several distinct layers:

1. **Preflight**: root check, operating-system and architecture detection, unsupported-version rejection, disk check, existing service detection, and interactive force confirmation.
2. **Package layer**: apt/yum/dnf selection, package installation, package-by-package verification, source recovery paths, and special handling for older distributions.
3. **Runtime layer**: a private Python runtime, dependency verification, architecture-specific fallback, OpenSSL compatibility, and environment activation.
4. **Artifact layer**: retrying downloads, alternate nodes, archive-size checks, extraction checks, executable permissions, and cleanup.
5. **State layer**: panel paths, ports, admin path, credentials, data directories, backups, and migration of existing state.
6. **Service layer**: init/systemd registration, daemon reload, enable/start/restart, process checks, local HTTP checks, and retries.
7. **Security/operations**: TLS material, firewall rules, service user, restrictive permissions, logs, signal handling, diagnostics, and recovery messaging.

## Our deliberate differences

- The customer installer is native Linux; Docker is only a local/test harness.
- The control plane is our own FastAPI application and the UI is our own React application.
- The panel does not install Nginx, Apache, PHP, databases, FTP, or firewall rules during the base install.
- Optional services will be provider modules with explicit preview/confirmation and rollback.
- No opaque remote shell script is piped into a shell.
- No vendor telemetry is sent by default.
- Releases are staged under `PREFIX/releases/<release-id>` and activated through `PREFIX/current`.
- Existing releases are preserved under `/var/backups/server-engine` before replacement.
- The installer creates a dedicated `serverengine` service account and uses systemd health checks.

## Current base-install contract

The base installer requires Linux, 64-bit x86_64/aarch64/arm64, Ubuntu 20.04+, Debian 11+, or RHEL-family 8+. It requires Python 3.10+, Node.js 20.19+, npm, systemd, and `flock`. It can install missing OS packages only when `--install-system-deps` is explicitly supplied.

It performs these stages:

1. Parse ports and installation paths.
2. Acquire an installer lock and write a 0600 log.
3. Validate OS, architecture, memory, disk, and port availability.
4. Detect apt/dnf/yum without changing repository files.
5. Optionally install only base build/runtime dependencies.
6. Create a versioned release and isolated Python virtual environment.
7. Install the core package and build the web bundle locally.
8. Create runtime launchers and persistent state.
9. Preserve the previous release and atomically activate the new release.
10. Register/restart systemd units and verify API/UI health.

## Next hardening before production

- Ship signed release archives instead of requiring a source checkout and npm build on the customer server.
- Add SHA-256/signature verification for every release artifact.
- Add a true rollback command that atomically restores the previous release and restarts services.
- Add distro-specific integration tests for Ubuntu, Debian, Rocky, Alma, and aarch64.
- Add package-manager transaction logs and rollback policy.
- Add systemd sandboxing (`ProtectSystem`, `PrivateTmp`, capability bounding) after the privileged host-agent boundary is implemented.
- Add TLS provisioning and firewall changes as separate explicit commands.
- Add unattended-upgrade and repair commands with dry-run mode.
