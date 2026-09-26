# Server Engine Web Server — aaPanel-like Control Plane Roadmap

## Product direction

Build a self-hosted server management platform with a browser control panel and a versioned API that can later power iOS/Android clients. The product should manage websites, domains, TLS, databases, users, services, firewall rules, backups, logs, and server health through auditable jobs.

The goal is to provide aaPanel-like outcomes while keeping the design modular, observable, secure by default, and maintainable. The platform must not execute arbitrary shell commands from web requests.

## What the aaPanel installer does

The installer at <https://www.aapanel.com/script/install_panel_en.sh> is a bootstrap script, not the complete panel implementation. Its observed flow is:

1. Require root, reject macOS/32-bit systems, validate supported Linux distributions, hostname, disk space, and existing web/database processes.
2. Select `apt-get` or `yum`, install system packages and Python dependencies, and create swap when memory is low.
3. Use `/www` as the data root, including panel files, website roots, logs, site/database backups, and a panel-managed Python environment.
4. Download and extract the panel archive and a panel web-server binary, then verify the web-server archive with SHA-256.
5. Create a `www` service user, set restrictive permissions, install `/etc/init.d/bt`, register/enable the service, and expose a `bt` command.
6. Generate or accept the panel port, admin URL path, username, and password; store port/path/password state on disk.
7. Configure a firewall for SSH, HTTP(S), FTP, passive FTP, and the panel port.
8. Create or obtain TLS material, start/restart the panel, perform a local health check, and print access details.
9. Send installation-count and failure telemetry to aaPanel endpoints; this project should make telemetry opt-in, documented, and disabled by default.

The script also contains migration/cleanup behavior, package removal, service recovery retries, and compatibility logic. Those are implementation details to study, not a reason to copy its root-level behavior into an API process.

### Reference-derived design decisions

The attached installer was reviewed as a technical reference only. It confirms that the aaPanel panel runtime is Python (`pyenv/bin/python` and `BT-Panel`), while its bundled panel web-server binary is a separate native executable. The script does not establish that the panel is Node-based, and it does not need to install Nginx as the panel UI before the panel starts. Web-server/database/runtime packages are managed as separate services later.

This project therefore uses a different, original Docker-first design: FastAPI is the control-plane runtime, an unprivileged Node process serves the built React console, and optional managed services will be added as isolated provider containers. The installer never executes a remote vendor script, modifies host firewall/systemd state, or downloads proprietary panel archives.

## Proposed architecture

```text
Browser / Mobile app / CLI
          |
     HTTPS API gateway
          |
  Auth, RBAC, audit, job API
          |
     Durable job queue
          |
 Privileged host agent (small allowlist)
          |
 Linux services, files, firewall, certificates
```

### Components

- **Control plane API**: authentication, users, roles, servers, resources, jobs, audit events, API versioning, OpenAPI documentation.
- **Web console**: dashboard, server health, site/domain management, databases, certificates, files, logs, backups, firewall, task history, and settings.
- **Host agent**: a local daemon running with only the privileges required for approved operations. It validates typed commands, applies changes transactionally where possible, emits progress, and never accepts arbitrary command strings.
- **Job runner**: queues long-running operations such as package installation, site deployment, certificate issuance, backup/restore, and service reload. Jobs need idempotency keys, cancellation, timeouts, logs, retries, and result artifacts.
- **State store**: PostgreSQL for control-plane state; encrypted secret storage for credentials and certificates; object storage or local content-addressed storage for backups/artifacts.
- **Realtime channel**: Server-Sent Events first; WebSocket support only where it materially improves terminal/log UX. Mobile clients can poll the same job API.

## Scope by phase

### Phase 0 — Foundation and threat model

- Choose the initial stack and deployment model: single-node first, with the API and agent separable from day one.
- Write threat model and trust boundaries: panel compromise, malicious tenant, SSRF, path traversal, command injection, credential theft, CSRF, replay, and unsafe rollback.
- Define support matrix for distributions, architectures, init systems, and container/VM environments.
- Establish repository conventions, CI, dependency scanning, signed releases, structured logs, and database migrations.
- Define data retention, telemetry policy, backup encryption policy, and upgrade/rollback policy.

### Phase 1 — Secure control-plane MVP

- Local administrator bootstrap with forced password rotation and recovery procedure.
- Session authentication plus short-lived API access tokens and refresh-token rotation.
- RBAC: owner, administrator, operator, read-only auditor; resource-level authorization hooks.
- Server registration using one-time enrollment token and mutual TLS or signed agent credentials.
- Server dashboard: CPU, memory, disk, load, uptime, OS, agent version, and service status.
- Job model, audit log, activity stream, health checks, and OpenAPI v1.
- Web console shell with responsive layout and mobile-friendly API contracts.

### Phase 2 — Website and TLS management

- Create/list/update/delete sites with validated document roots under an approved base directory.
- Domain and virtual-host configuration using templates, config validation, atomic writes, and reload-only-after-success.
- Nginx or Caddy integration first; keep the provider interface open for Apache later.
- DNS-independent certificate flow: ACME HTTP-01 and DNS-01 provider interface, renewal jobs, certificate inventory, and expiry alerts.
- Site logs, access/error log streaming, quotas, enable/disable, and safe config rollback.

### Phase 3 — Runtime and database services

- Versioned runtime providers for PHP-FPM, Node.js, Python app services, and static sites.
- Database provider interface; start with PostgreSQL and/or MariaDB after the site lifecycle is stable.
- Typed service operations: install, configure, start, stop, restart, reload, status, and remove.
- Package inventory and compatibility checks; never silently replace an existing service.
- Resource limits and per-site isolation strategy (system users, filesystem permissions, and optional containers).

The service-selection, version catalog, durable background jobs, logs, and privileged-agent boundary are specified in [docs/SERVICE_MANAGER.md](docs/SERVICE_MANAGER.md).

### Phase 4 — Operations and security tools

- Backups: schedules, retention, encryption, verification, restore-to-new-target, and disaster-recovery tests.
- Firewall management with a safe default policy, SSH lockout protection, preview/dry-run, and rollback.
- File browser/editor restricted to approved roots; upload size/type limits and malware-scanning hook.
- Metrics, alerts, notifications, log retention, and incident/audit exports.
- Package updates and agent/panel upgrades with signed manifests, health gates, and rollback.

### Phase 5 — Multi-server and mobile clients

- Server groups, labels, per-server policies, fleet health, and fan-out jobs with bounded concurrency.
- Mobile API client/SDK generated from OpenAPI; device registration, push notifications, biometric unlock handled by the client, and revocable device tokens.
- Mobile-first flows: health overview, job approval, service restart, certificate expiry, backup status, and incident acknowledgement.
- Offline-safe read caching; all mutations remain server-authoritative and idempotent.

## Initial API surface

Use `/api/v1` from the start. Every mutating request should return a request/job ID and support an idempotency key.

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET /me`, `GET /roles`, `GET /audit-events`
- `POST /servers/enroll`, `GET /servers`, `GET /servers/{id}`, `GET /servers/{id}/health`
- `GET /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/cancel`, `GET /jobs/{id}/events`
- `GET/POST/PATCH/DELETE /sites`
- `GET/POST/PATCH/DELETE /domains`
- `GET/POST /certificates`, `POST /certificates/{id}/renew`
- `GET/POST /databases`, `GET/POST /backups`, `POST /backups/{id}/restore`
- `GET /services`, `POST /services/{name}/actions`
- `GET/POST/PATCH/DELETE /firewall/rules` with dry-run and confirmation requirements

The API must return stable error codes, RFC 3339 timestamps, correlation IDs, pagination metadata, and capability information so mobile clients can adapt to agent/provider versions.

## Security requirements

- Do not run the panel as root. Only the host agent may hold narrowly scoped privileges.
- Do not accept shell commands, paths, package names, service names, or firewall expressions without schema validation and allowlists.
- Use canonical path resolution and enforce approved roots for all filesystem operations.
- Require CSRF protection for cookie-authenticated browser mutations; use secure, HttpOnly, SameSite cookies.
- Hash passwords with Argon2id; encrypt secrets at rest; redact secrets from logs and job output.
- Require re-authentication or step-up confirmation for firewall, credential, deletion, restore, and upgrade operations.
- Make destructive operations explicit, auditable, previewable, and recoverable where possible.
- Bind agent enrollment to a one-time token, rotate credentials, expire unused enrollments, and support revocation.
- Use TLS by default, validate certificates for control-plane/agent links, and avoid insecure download flags.
- Verify every downloaded artifact with a signed manifest or pinned digest; do not trust an unverified remote script/archive.
- Make telemetry opt-in, show exactly what is sent, and provide an export/delete control.

## First implementation milestone

Deliver a local development slice before installing or managing real services:

1. API with admin auth, users/roles, servers, jobs, audit events, and OpenAPI.
2. Web UI showing server health and job progress.
3. Mock host agent implementing typed `health.read` and `service.status` commands.
4. PostgreSQL migrations and an integration-test harness.
5. Security tests for authorization, path traversal, replay/idempotency, command injection, and secret redaction.

Only after this slice is tested should a real Linux agent implement read-only inspection, followed by reversible service reloads and site creation in a disposable VM.

## Acceptance criteria for a production pilot

- A fresh supported Linux VM can enroll without executing an opaque remote script as root.
- Every privileged action has an authenticated actor, server, job, input schema, result, timestamp, and audit record.
- Failed operations leave no half-written service configuration and can be retried safely.
- The panel remains usable if a job is running or the agent temporarily disconnects.
- A revoked user/device/agent cannot mutate resources.
- Backups can be restored on a clean VM using documented steps.
- Upgrade, rollback, and recovery procedures are tested before broad deployment.

## Decisions to make before coding the agent

- Supported OSes and versions for v1.
- Single-tenant versus multi-tenant authorization model.
- Nginx versus Caddy as the first web-server provider.
- PostgreSQL/MariaDB priority and database isolation model.
- Control plane hosted locally on each server versus a central control plane.
- Packaging format and release channel strategy.
