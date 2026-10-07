# Server Engine Control Panel

Server Engine Control Panel is an open-source control panel for running production websites on your own Linux server, under the Server Engine product family.

It brings websites, domains, databases, mail, backups, services, security, users, plans, logs, and terminal access into one workspace. The goal is simple: a person should be able to deploy and operate a real website without needing to understand every system daemon, package manager, or configuration file underneath it.

> Status: active development. The control-panel UI is ahead of some backend workflows. Treat the development and installer-test environments as safe places to evaluate the project; review every production change before exposing a server to the internet.

## What it includes

- Website and domain management with project-folder browsing, PHP runtime selection, TLS options, rewrites, redirects, proxy settings, maintenance mode, and response logs.
- Service catalog and management UI for Nginx, Apache, PHP-FPM, Node.js, MySQL, PostgreSQL, MariaDB, Redis-compatible stores, FTP, Docker, queues, DNS, security, and deployment tools.
- Multi-version PHP and Node.js runtimes with isolated paths, configuration editors, runtime controls, extensions, and terminal command mapping.
- Database inventory, database users, backups, engine selection, search, and pagination.
- Mail workspace UI for domains, mailboxes, aliases, forwarders, autoresponders, filters, and deliverability controls.
- FTP accounts with scoped root folders and vsftpd service controls.
- Firewall rules, application protection/WAF controls, IP lists, geo controls, traffic views, custom policies, attack map, and reports.
- Backups, cron jobs, activity records, audit logs, server health, Docker resources, and a persistent SSH/local terminal workspace.
- Hosting accounts and reusable plans with resource quotas, feature access, and reseller assignment controls.
- English, Vietnamese, and French language foundations with flag-based language selection.

## Architecture

```text
Browser
  │
  ├── React + Vite frontend
  │     └── web/
  │
  └── FastAPI core API + WebSocket terminal
        └── core/
              ├── SQLite control state
              ├── service catalog and runtime manager
              ├── website, database, firewall, FTP, jobs, and settings APIs
              └── native CLI and systemd integration
```

The panel has two supported operating modes:

1. Docker development/test mode for working on the project.
2. Native Linux installation for a customer server.

Native installation is deliberately separate from the Docker development harness. The native installer installs Server Engine itself; it does not silently install Nginx, Apache, PHP, databases, Docker, or firewall rules on a customer machine.

## Requirements

### Development

- Docker with Compose
- Git
- A modern browser

### Native Linux installation

The installer currently supports:

- Ubuntu 20.04 or newer
- Debian 11 or newer
- RHEL-family distributions version 8 or newer, including Rocky Linux, AlmaLinux, RHEL, Fedora, and Oracle Linux
- CentOS Stream 9 or newer; CentOS Linux and CentOS Stream 8 are not supported because they are end-of-life
- 64-bit `x86_64`, `aarch64`, or `arm64`
- At least 1 GiB RAM for installation and light workloads
- 2 GiB RAM recommended for a production website with PHP, databases, and background services
- At least 2 GiB free disk space for the panel installation
- Python 3.10 or newer
- Node.js and npm are needed only when building the React release from a source checkout; customer installations use the bundled production build and Python runtime

The installer can install missing system dependencies when explicitly requested with `--install-system-deps`. The customer release runs the compiled `web/dist` frontend through the Python `web/server.py` runtime; it does not run Vite development mode or ship the React source tree.

When the installer is executed remotely, it automatically installs the operating-system dependencies needed to run the downloaded bundle. A custom release artifact can be selected with `--release-url` or the `SE_RELEASE_URL` environment variable.

Build a release bundle for publishing to GitHub Releases:

```bash
./scripts/build-release.sh 0.1.0
```

This creates `server-engine-release.tar.gz` containing the backend, compiled `web/dist`, production web server, CLI, and service units.

## Start the development environment

The development Compose file mounts the source tree into live-reloading containers.

```bash
docker compose -f docker-compose.dev.yml up
```

Open:

- Panel: http://localhost:5173
- API: http://localhost:18000
- API documentation: http://localhost:18000/docs
- Health check: http://localhost:18000/api/v1/health

The development administrator credentials are defined in `docker-compose.dev.yml`:

```text
Username: admin
Password: change-me-now
```

Change these values before using the environment beyond local development.

Email provisioning uses Stalwart's local management service. Server Engine
creates and stores a private service credential under Stalwart's protected
service directory; no Stalwart login or external Stalwart account is required.
The optional environment variables below override that local credential when
integrating an already-managed Stalwart installation:

```bash
export SE_STALWART_TOKEN="your-stalwart-api-token"
# or:
export SE_STALWART_USER="admin"
export SE_STALWART_PASSWORD="your-stalwart-password"
docker compose -f docker-compose.dev.yml up -d --force-recreate core-dev
```

The panel queues mailbox changes over HTTP and receives completion and failure
events through the shared jobs WebSocket.

Stop the development stack:

```bash
docker compose -f docker-compose.dev.yml down
```

To test the public installer in an AMD64 Ubuntu container, stop the current
development stack and start the AMD64 target with the replacement GitHub token
exported only for that command:

```bash
docker compose -f docker-compose.dev.yml down
SE_GITHUB_TOKEN="github_pat_REPLACEMENT_TOKEN" \
  docker compose -f docker-compose.dev.yml -f docker-compose.amd64.yml \
  --profile installer run --rm installer-amd64
```

The repository wrapper provides the same workflow:

```bash
./bin/serverengine start dev
./bin/serverengine status dev
./bin/serverengine logs dev
./bin/serverengine restart dev
./bin/serverengine stop dev
```

## Build the production-style containers

This Compose file builds the Python API image and the static Node web runtime. It is useful for image validation and local deployment testing.

```bash
docker compose up --build
```

Open:

- Web panel: http://localhost:8080
- API: http://localhost:2510

The native installer test environment is separate from this stack:

```bash
docker compose -f docker-compose.test.yml build installer-test
docker compose -f docker-compose.test.yml run --rm installer-test
```

## Native installation

The public installer downloads a prebuilt release bundle. It does not need a source checkout and does not compile React on the customer server.

One-line installation:

```bash
curl -fsSL https://secp.ninacoder.top/install.sh -o install.sh
bash install.sh --yes
```

The same command with `wget`:

```bash
wget -qO install.sh https://secp.ninacoder.top/install.sh
bash install.sh --yes
```

For a private GitHub release during testing, provide the token only through
the current shell environment. It is never stored in the installer:

```bash
export SE_GITHUB_TOKEN="github_pat_your_token_here"
bash install.sh --install-system-deps --yes
unset SE_GITHUB_TOKEN
```

### Build and publish a GitHub release

The local build script only creates the archive. To build and upload it
automatically, install and authenticate the GitHub CLI once:

```bash
./scripts/publish-release.sh ninacoder-info/ServerEngineControlPanel
```

The publish script installs/authenticates the GitHub CLI when needed, detects
the latest release, increments the patch version automatically, creates the
new tag, and uploads `server-engine-release.tar.gz`. The first release is
`v0.1.0`.

For local source or development installation, run the installer as root from the repository:

```bash
sudo ./install.sh --install-system-deps
```

For a non-interactive installation:

```bash
sudo ./install.sh --install-system-deps --yes
```

Useful options:

```bash
sudo ./install.sh \
  --prefix /opt/server-engine \
  --state-dir /var/lib/server-engine \
  --web-port 2309 \
  --api-port 2510 \
  --api-host 127.0.0.1 \
  --install-system-deps \
  --yes
```

The installer creates versioned releases and a `current` link under the installation prefix. Persistent control state is stored separately from release files so upgrades do not discard panel data.

Default locations:

```text
Panel files:       /opt/server-engine
Persistent state:  /var/lib/server-engine
Web root:          /server-engine/www
Panel logs:        /var/log/server-engine
Install log:       /var/log/server-engine-install.log
Backups:           /var/backups/server-engine
```

The installer creates and manages these systemd units when service mode is enabled:

```text
server-engine-core.service
server-engine-web.service
```

After installation, open the configured web port and complete the initial account setup. Keep the API bound to loopback unless it is intentionally protected by a trusted reverse proxy and firewall policy.

## CLI

The native installation provides the `se` command at `/usr/local/bin/se`.

Panel control:

```bash
sudo se panel start
sudo se panel stop
sudo se panel restart
se panel status
se panel logs --lines 200
```

Managed service control:

```bash
sudo se nginx restart
sudo se mysql status
sudo se mysql logs --lines 200
sudo se php restart --version 8.3
se php status
se php logs --version 8.3 --lines 200
```

The generic form is also available:

```bash
sudo se service nginx restart
sudo se service php restart --version 8.3
```

Development wrapper commands remain separate from the native CLI:

```bash
./bin/serverengine start dev
./bin/serverengine logs dev
./bin/serverengine native-status
```

See [docs/CLI.md](docs/CLI.md) for the complete command reference.

## Service isolation and runtime paths

Server Engine keeps managed runtime files under its service root instead of changing the host installation unexpectedly.

Typical paths include:

```text
/opt/server-engine/services/nginx/
/opt/server-engine/services/mysql/
/opt/server-engine/services/php/versions/8.3/
/opt/server-engine/services/nodejs/versions/22/
/opt/server-engine/services/composer/
```

When a runtime is enabled for terminal access, Server Engine creates a managed command mapping for new local terminal sessions. It does not overwrite a user’s existing host runtime unless the user explicitly enables that mapping.

Use the executable path supplied by the panel when running an isolated binary directly. For example:

```bash
/opt/server-engine/services/php/versions/8.3/usr/bin/php8.3 -v
```

The panel is responsible for creating the runtime configuration, required baseline extensions, logs, sockets, and service-specific directories during installation. Service-specific configuration should be edited from that service’s own manager rather than copied between unrelated services.

## Project layout

```text
core/                       FastAPI application and native CLI
  app/api/routes/            HTTP and WebSocket routes
  app/models/                Pydantic/domain models
  app/services/              Service, website, firewall, job, and runtime logic
  app/cli.py                 `se` command implementation
web/                        React/Vite control-panel frontend
  src/components/            Shared UI components
  src/features/              Page-level product areas
  src/locales/               Translation catalogs
  src/assets/flags/          Language flag SVG assets
docs/                       Focused operator and design documentation
deploy/                     systemd unit files
docker/                     Installer and panel test helpers
bin/                        Development environment wrapper commands
install.sh                  Native Linux installer
```

## API and authentication

The API is built with FastAPI and exposes versioned routes under `/api/v1`. Browser requests use the authenticated session cookie. The terminal uses an authenticated WebSocket connection and supports both the local Server Engine container and saved external SSH connections.

## Hosting account isolation

Hosting-account users are scoped to one active hosting account. Server Engine
stores ownership for websites, domains, databases, mailboxes, FTP accounts,
cron jobs, and backups, and rejects access to resources owned by another
account. Their file-manager root is the account home directory, and terminal
access remains administrator-only.

Plan quotas are copied onto the account and enforced at create/write time for
websites, databases, mailboxes, FTP accounts, cron jobs, and account disk
usage. Administrators can suspend or activate an account from Hosting
accounts. Deleting an account is a recoverable archive operation: its home is
moved into the protected `.deleted` area, sessions and API tokens are revoked,
and the account can be restored from the same page.

The API health endpoint is intentionally lightweight:

```bash
curl http://127.0.0.1:2510/api/v1/health
```

Before exposing a panel publicly:

- Set a strong administrator password.
- Put the web panel behind HTTPS.
- Keep the API on loopback unless external access is required.
- Restrict SSH and terminal access to trusted administrator accounts.
- Review firewall, MFA, session, and audit settings.
- Back up the control database and service configuration.
- Do not paste private keys or production secrets into issue reports.

## Testing and validation

Run the frontend build inside the project container:

```bash
docker compose build web
```

Run the backend image build:

```bash
docker compose build core
```

For the broader repository test workflow, see [TESTING.md](TESTING.md).

The project currently uses UI-first development for several management areas. A visible control may represent the intended workflow while its production backend integration is still being implemented. Always verify the resulting service state with the panel logs, service logs, and the `se` CLI before relying on it in production.

## Documentation

- [CLI reference](docs/CLI.md)
- [Service manager design](docs/SERVICE_MANAGER.md)
- [Installer design](docs/INSTALLER_DESIGN.md)
- [Testing guide](TESTING.md)
- [AGPLv3 license](LICENSE)

## Contributing

1. Create a focused branch.
2. Keep UI changes in the relevant feature folder and shared behavior in `web/src/components` or `web/src/lib`.
3. Keep service behavior in the FastAPI service layer instead of embedding operational logic in JSX.
4. Run `git diff --check`.
5. Build the affected Docker image before opening a pull request.
6. Document new CLI commands, service paths, environment variables, and security implications.

Avoid adding a new one-off CSS class when a native Tailwind utility or reusable component is appropriate. Reuse shared controls such as `Button`, `Toast`, `ActionDialog`, `SaveButton`, and the translation hook.

## License

Server Engine Control Panel is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
