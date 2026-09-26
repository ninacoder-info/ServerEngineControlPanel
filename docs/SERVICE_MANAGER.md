# Service manager design

## User experience

After the base panel installation, the user opens **Services** and sees providers such as:

- Nginx
- Apache
- MariaDB/MySQL-compatible database
- PostgreSQL
- PHP-FPM
- Redis
- Node.js runtime

Each provider exposes only versions that are supported for the detected operating system and architecture. The user selects a version, reviews an operation summary, confirms it, and receives a job ID.

Example flow:

```text
Services → Nginx → Version 1.26 → Install
         → preview packages/repositories/ports/conflicts
         → confirm
         → background job created
         → live log + progress + final result
```

The browser is never the process owner. Closing the browser, losing SSH, or losing the network connection does not cancel a job.

## Runtime boundary

```text
serverengine user
  ├── web panel
  └── Python control API

serverengine-agent service
  └── narrowly allowlisted privileged operations
      ├── package repositories and package installation
      ├── service lifecycle
      ├── configuration validation and atomic writes
      ├── firewall/TLS operations after explicit confirmation
      └── filesystem operations under approved roots
```

The API must never run `apt`, `yum`, `dnf`, `systemctl`, or a user-provided shell command. The agent must receive typed commands such as `nginx.install(version="1.26")`, not command strings.

## Durable jobs

Jobs need persistent storage, not an in-memory task:

```text
job
  id, type, provider, requested_version
  status: queued | running | succeeded | failed | cancelled
  actor, server, idempotency_key
  created_at, started_at, finished_at
  exit_code, error_code, result_json

job_event
  id, job_id, sequence, timestamp
  level, phase, message, redacted_output
```

The agent claims queued jobs, writes heartbeats, appends numbered log events, and records the final result. A watchdog marks stale jobs as interrupted and permits safe retry according to the provider policy.

## API shape

```text
GET  /api/v1/providers
GET  /api/v1/providers/{provider}/versions
POST /api/v1/jobs/service-install
GET  /api/v1/jobs/{job_id}
GET  /api/v1/jobs/{job_id}/events
POST /api/v1/jobs/{job_id}/cancel
POST /api/v1/jobs/{job_id}/retry
```

`POST /service-install` returns `202 Accepted` with a job ID. The request must include provider, version, and an idempotency key. The API returns a preview before confirmation for repository changes, port changes, conflicts, removals, and data migrations.

## Version handling

The UI must not offer arbitrary text versions. The provider manifest returns:

- supported OS IDs/versions and CPU architectures;
- available versions and package names;
- repository key/fingerprint and source URL;
- dependencies and conflicts;
- service name and expected ports;
- config validation command;
- restart/reload behavior;
- rollback and data migration policy.

Package sources must be pinned and verified. The agent should use the operating system package manager where possible, preserve repository files before changes, and never silently replace an existing service.

## Background execution

The native installer will register both the panel services and the agent service with systemd. The agent starts on boot and resumes/reconciles jobs after restart. A job log is persisted under the state directory and exposed through the API; systemd journal output is diagnostic rather than the only source of truth.

The Docker Compose environment will run a simulated agent for integration tests. It must not be used as the production installation path.

## Safety rules

- Never install a service without a preview and explicit confirmation for destructive or conflicting changes.
- Never overwrite an existing Nginx/MySQL installation without detecting ownership and asking for a migration decision.
- Validate the selected version against a signed provider manifest.
- Use an operation lock per provider so two database installs cannot run concurrently.
- Capture package-manager output, but redact passwords, tokens, connection strings, and private keys.
- Make install, configure, start, stop, restart, remove, and rollback separate typed operations.
- Keep database installation separate from database data initialization.
- A failed job must preserve diagnostics and report exactly which phase failed.
