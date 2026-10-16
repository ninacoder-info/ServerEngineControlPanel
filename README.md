# Server Engine Control Panel

Server Engine is a self-hosted Linux control panel for deploying and operating websites, runtimes, databases, and server services from one web interface.

## Features

- **Websites and applications:** manage domains, project files, PHP runtimes, Node.js projects, reverse proxies, TLS, redirects, and maintenance pages.
- **Services and runtimes:** install and manage supported server services, multiple PHP and Node.js versions, runtime settings, and service logs.
- **Databases:** manage database engines, databases, users, and backups.
- **Files and terminal:** browse server files, upload and edit files, and use an authenticated terminal session.
- **Security:** configure firewall rules, application protection, access controls, and security policies.
- **Operations:** review system health, jobs, logs, scheduled tasks, backups, and audit activity.
- **Hosting management:** manage hosting accounts, plans, and resource limits.

## Install on Linux

The native installer downloads and installs the latest prebuilt release; no compilation is required on the server.

### Requirements

- Ubuntu 20.04+, Debian 11+, RHEL-family 8+, or CentOS Stream 9+
- 64-bit `x86_64`, `aarch64`, or `arm64`
- At least 1 GiB RAM and 2 GiB free disk space; 2 GiB RAM or more is recommended for production workloads
- A DNS name and HTTPS reverse proxy for secure remote access; local access can use the server address

Download and run the installer:

```bash
curl -fsSL https://secp.ninacoder.top/install.sh -o install.sh
sudo bash install.sh --yes
```

The installer requests elevated privileges if needed, installs the panel, and configures its systemd services. It does **not** silently install or configure website services such as Nginx, PHP, or a database engine; manage those from the panel when needed.

By default, the panel web service uses port `2309`. The API binds to `127.0.0.1:2510` and is proxied through the panel. Keep the API on loopback unless you have a specific secured deployment that requires otherwise.

Custom ports and paths are available:

```bash
sudo bash install.sh \
  --web-port 2309 \
  --api-port 2510 \
  --api-host 127.0.0.1 \
  --prefix /opt/server-engine \
  --state-dir /var/lib/server-engine \
  --yes
```

After installation, open the panel address and complete the initial account setup. If the panel is on a public server, put it behind HTTPS using a trusted reverse proxy, allow public access only to the intended HTTPS entry point, and restrict SSH and terminal access to trusted administrators.

## Deploy and operate

The installer configures these services:

```text
server-engine-web.service
server-engine-core.service
```

Check status and logs over SSH:

```bash
se panel status
se panel logs --lines 200
sudo journalctl -u server-engine-core.service -f
```

The API health endpoint is available locally on the server:

```bash
curl http://127.0.0.1:2510/api/v1/health
```

### Update to the latest release

Run the installer again to download and install the latest release while preserving the panel's persistent state:

```bash
curl -fsSL https://secp.ninacoder.top/install.sh -o install.sh
sudo bash install.sh --yes
```

Check for a published update without installing it:

```bash
se panel check-update
```

### Panel commands

```bash
se panel start
se panel stop
se panel restart
se panel status
se panel logs --lines 200
```

The `se` CLI also provides commands for supported managed services. For example:

```bash
sudo se nginx status
sudo se nginx restart
sudo se php status
sudo se php restart --version 8.3
```

## Data and recovery

The default installation keeps application releases separate from persistent state so panel updates do not replace the saved control data.

```text
Panel releases:  /opt/server-engine
Persistent data: /var/lib/server-engine
Website files:   /server-engine/www
Panel logs:      /server-engine/logs
Install log:     /server-engine/logs/installer.log
Backups:         /server-engine/backups
```

Back up persistent panel data and service configuration regularly, and verify that backups can be restored. Installer diagnostics are recorded in `/server-engine/logs/installer.log`.

## Security notes

- Use HTTPS for remote panel access and a strong administrator password.
- Keep the API bound to loopback and do not expose it directly to the public internet.
- Limit SSH and terminal access to trusted administrators.
- Review firewall, authentication, and audit settings before production use.
- Store backups outside the server when possible, and never include private keys or passwords in support requests.

## License

Server Engine Control Panel is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
