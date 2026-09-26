# Server Engine

Server Engine is a self-hosted server control plane inspired by the operational model of hosting panels. It has a Python API, a React/Tailwind/Lucide web console, and a future privileged host agent for installing and managing services.

## Important deployment distinction

Docker is for local development and disposable tests. It represents a customer server during development.

The customer installer is native Linux. It does not install Docker, Nginx, Apache, PHP, MySQL, databases, or firewall rules yet.

```text
Developer machine                    Customer Linux server
-----------------                    ---------------------
docker-compose.dev.yml               ./install.sh
hot reload                           native Python + Node
test containers                       systemd services
```

## Requirements

For development:

- Docker Desktop or Docker Engine
- Docker Compose

For native installation:

- 64-bit Linux
- Ubuntu 20.04+, Debian 11+, or RHEL-family 8+
- Python 3.10+
- Node.js 20.19+
- npm
- systemd
- root access

## Fast development workflow

Start the bind-mounted development stack:

```bash
docker compose -f docker-compose.dev.yml up
```

Open:

```text
Web panel: http://localhost:5173
API docs:  http://localhost:18000/docs
```

Development login:

```text
Username: admin
Password: change-me-now
```

Edit files directly:

- React frontend: `web/src/`
- Python backend: `core/app/`

Vite reloads frontend changes. Uvicorn reloads backend changes. No image rebuild is needed for source edits.

Stop development:

```bash
docker compose -f docker-compose.dev.yml down
```

The equivalent command wrapper is:

```bash
./bin/serverengine start dev
./bin/serverengine restart dev
./bin/serverengine logs dev
./bin/serverengine status dev
./bin/serverengine stop dev
./bin/serverengine watch dev
```

## Test the native installer in Docker

This runs the real native `install.sh` inside a disposable Debian-based container. It does not modify the host and does not start systemd services.

Build the test image once:

```bash
docker compose -f docker-compose.test.yml build installer-test
```

Run the installer test:

```bash
docker compose -f docker-compose.test.yml run --rm installer-test
```

The repository is mounted into the test container, so current source changes are used immediately. pip and npm caches are stored in Docker volumes.

Expected final output:

```text
SERVER ENGINE INSTALLED SUCCESSFULLY
native installer test passed
```

## Run the installed panel in Docker

This runs the installer and keeps the panel/API alive with published ports:

```bash
docker compose -f docker-compose.test.yml up --build -d panel-live
```

Open:

```text
Panel:  http://localhost:18888
API:    http://localhost:18000/docs
Health: http://localhost:18000/api/v1/health
```

Login:

```text
Username: admin
Password: change-me-now
```

View logs:

```bash
docker compose -f docker-compose.test.yml logs -f panel-live
```

Apply current code by recreating only the panel container:

```bash
./bin/serverengine update panel
```

To apply changes automatically while using the installer-backed panel:

```bash
./bin/serverengine watch panel
```

For daily development, `watch dev` is faster because Vite and Uvicorn hot-reload source changes without rerunning installation.

Restart without rerunning installation:

```bash
./bin/serverengine restart panel
```

Stop the live panel:

```bash
./bin/serverengine stop panel
```

## Native customer installation

From a Linux checkout of this repository:

```bash
sudo ./install.sh --install-system-deps
```

The installer:

1. validates Linux, architecture, distribution, disk, memory, and ports;
2. detects apt, dnf, or yum;
3. installs system dependencies only when explicitly requested;
4. creates a versioned release under `/opt/server-engine/releases/`;
5. creates a Python virtual environment;
6. builds the React panel;
7. creates the `serverengine` service account;
8. activates `/opt/server-engine/current`;
9. registers and starts systemd services;
10. verifies API and web health.

Useful options:

```bash
sudo ./install.sh --help
sudo ./install.sh --install-system-deps --web-port 8888 --api-port 8000
sudo ./install.sh --no-service --yes
```

Native paths:

```text
Application: /opt/server-engine/current
Releases:   /opt/server-engine/releases/
State:      /var/lib/server-engine/
Logs:       /var/log/server-engine/
Backups:    /var/backups/server-engine/
```

Native services:

```bash
systemctl status server-engine-core server-engine-web
journalctl -u server-engine-core -u server-engine-web -f
systemctl restart server-engine-core server-engine-web
```

The native installer also provides the shorter `se` command for SSH administration:

```bash
se panel status
se panel restart
se mysql restart
se nginx logs --lines 100
se php status
se php restart --version 8.3
```

PHP-FPM commands require `--version` for start, stop, restart, and logs because each installed PHP version has its own process, socket, and configuration. The `se` command is installed at `/usr/local/bin/se` and is available after a native installation or update.

The installer also installs:

```bash
/usr/local/bin/serverengine
```

Native shortcuts:

```bash
serverengine native-status
serverengine native-restart
```

If no admin password is provided, the API generates one during first startup. Find it with:

```bash
journalctl -u server-engine-core --no-pager | grep 'bootstrap password'
```

## Authentication and theme

The panel requires authentication. Sessions use an HttpOnly cookie and are stored server-side in SQLite.

Development authentication is configured in `docker-compose.dev.yml` and `docker-compose.test.yml`. Production credential bootstrap will be moved into the native installer’s first-run setup flow.

Use the sun/moon control in the upper-right corner to change between light and dark themes. The choice is saved in browser local storage.

## Current API endpoints

Public health endpoint:

```text
GET /api/v1/health
```

Authentication:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

Protected foundation endpoints:

```text
GET /api/v1/servers
GET /api/v1/jobs
GET /api/v1/capabilities
```

## Project structure

```text
core/
  app/
    api/routes/       HTTP route modules
    models/           request, response, and domain models
    services/         business actions
    auth.py           authentication persistence helpers
    main.py           application wiring only

web/
  src/
    app/              application composition
    components/       shared UI components
    features/         feature-specific pages/components
    hooks/            frontend state hooks
    lib/              API/client helpers

deploy/               systemd units
docker/               Docker test assets
docs/                 architecture and installer design
bin/serverengine      development/native lifecycle wrapper
install.sh            native customer-server installer
```

## Service manager direction

Nginx, MySQL/MariaDB, PHP, PostgreSQL, and other services will be installed through durable background jobs, not directly from HTTP handlers.

The planned boundary is:

```text
serverengine       web panel + Python API
serverengine-agent privileged allowlisted service manager
```

See [docs/SERVICE_MANAGER.md](docs/SERVICE_MANAGER.md) for provider manifests, version selection, previews, background jobs, logs, retries, and rollback requirements.

## Troubleshooting

Check development services:

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f
```

Check live installer test:

```bash
docker compose -f docker-compose.test.yml ps
docker compose -f docker-compose.test.yml logs -f panel-live
```

If ports are already occupied, stop the other environment before starting another one. The dev stack uses ports `5173` and `18000`; the live panel uses `18888` and `18000`.

If Docker reports orphan containers, it is usually only a warning from another Compose file using the same project directory. Inspect with:

```bash
docker ps
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.test.yml ps
```

Do not run the native installer on macOS. Use Docker for local testing and run the native installer on a disposable Linux VM before using it on a customer server.
