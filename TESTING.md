# Docker testing

Docker is only a disposable development/test environment that imitates a customer server. It is not part of the customer installation flow.

## Live development in Docker

For normal development, use the bind-mounted development stack:

```bash
docker compose -f docker-compose.dev.yml up
```

The project command wrapper provides shorter lifecycle commands:

```bash
./bin/serverengine start dev
./bin/serverengine restart dev
./bin/serverengine logs dev
./bin/serverengine status dev
./bin/serverengine watch dev
```

For the installer-backed live panel:

```bash
./bin/serverengine start panel
./bin/serverengine update panel
./bin/serverengine restart panel
./bin/serverengine logs panel
```

For automatic panel-container updates when working against the installer-backed environment:

```bash
./bin/serverengine watch panel
```

Keep that command running in one terminal. It watches the source and recreates only `panel-live` after relevant changes. For normal frontend/backend development, prefer `watch dev`; Vite and Uvicorn reload without rebuilding the installer container.

`update panel` recreates only the panel container and runs the current installer code. It does not bring down unrelated services.

Open the web control at:

```text
http://localhost:5173
```

Development login:

```text
Username: admin
Password: change-me-now
```

The live panel stores authentication state in the persistent `installer-live-state` Docker volume, so panel recreation preserves users and sessions.

The panel now requires a session cookie. Use the sun/moon button in the top-right corner to switch themes; the preference is saved in browser local storage.

Edit files directly under `web/src` or `core/app`. Vite hot-reloads the React panel and Uvicorn reloads the Python API without rebuilding Docker images. The API is available at `http://localhost:18000/docs`.

Stop development services with:

```bash
docker compose -f docker-compose.dev.yml down
```

Run locally with:

```bash
docker compose up --build
```

The native customer-server installer is `./install.sh`. It expects Linux, Python 3.12, Node.js, npm, and systemd; it does not install Docker, Nginx, Apache, PHP, databases, or firewall rules yet.

## Test the native installer in Docker

This runs the installer in a disposable Debian-based container and does not modify the host:

```bash
docker compose -f docker-compose.test.yml run --rm installer-test
```

To keep the installed panel running and access it from your Mac:

```bash
docker compose -f docker-compose.test.yml up --build panel-live
```

Open:

```text
Panel: http://localhost:18888
API:   http://localhost:18000/docs
```

Stop it with `Ctrl+C`, or in another terminal:

```bash
docker compose -f docker-compose.test.yml down
```

### Fast rerun using the existing image

Build the test image once:

```bash
docker compose -f docker-compose.test.yml build installer-test
```

Then run the current local installer repeatedly without rebuilding:

```bash
docker compose -f docker-compose.test.yml run --rm installer-test
```

The Compose test mounts the current repository into `/src`, so edits to `install.sh` are executed immediately.
It also keeps pip and npm caches in Docker volumes, so repeated runs do not redownload dependencies.

Equivalent direct Docker command:

```bash
docker run --rm \
  --entrypoint /bin/bash \
  -v "$PWD:/src" \
  -w /src \
  server-engine-installer-test \
  -lc 'chmod +x ./install.sh && ./install.sh --no-service --yes --prefix /opt/server-engine-test --state-dir /var/lib/server-engine-test --web-port 18888 --api-port 18000'
```

A successful run visibly prints the installer banner and ends with:

```text
native installer test passed
```

This test uses `--no-service` because ordinary containers do not run systemd. It still validates the installer stages and release layout. Test systemd registration separately inside a disposable VM or a systemd-enabled test image.
