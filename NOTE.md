# Server Engine Control Panel — Quick Notes

## Install on a remote Linux server

SSH into the server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/ninacoder-info/ServerEngineWebServer/main/install.sh \
  -o /tmp/server-engine-install.sh && \
sudo bash /tmp/server-engine-install.sh --yes
```

The installer downloads the prebuilt release bundle automatically. It does not need the source repository and does not build React on the server.

With `wget`:

```bash
wget -qO /tmp/server-engine-install.sh \
  https://raw.githubusercontent.com/ninacoder-info/ServerEngineWebServer/main/install.sh && \
sudo bash /tmp/server-engine-install.sh --yes
```

## Publish or test a release bundle

From the repository root:

```bash
./scripts/build-release.sh 0.1.0
```

This creates:

```text
server-engine-release.tar.gz
```

Upload that archive to a GitHub Release using the asset name `server-engine-release.tar.gz`. The installer downloads the latest release from:

```text
https://github.com/ninacoder-info/ServerEngineWebServer/releases/latest/download/server-engine-release.tar.gz
```

Use a different release archive when testing:

```bash
sudo bash /tmp/server-engine-install.sh \
  --release-url https://example.com/server-engine-release.tar.gz \
  --yes
```

## Install from a source checkout

For development or a local Linux checkout:

```bash
sudo ./install.sh --install-system-deps --yes
```

## Useful commands after installation

```bash
sudo se panel status
sudo se panel restart
sudo se panel logs --lines 200
sudo se service nginx status
sudo se service mysql status
sudo se service php status
```

Default locations:

```text
Panel:       /opt/server-engine
State:       /var/lib/server-engine
Website root:/server-engine/www
Logs:        /var/log/server-engine
Backups:     /var/backups/server-engine
```

## Important

- Use Docker for local macOS development.
- Use the native installer on Ubuntu, Debian, or supported RHEL-family Linux servers.
- The default release URL must have a published GitHub Release asset before remote installation can succeed.
