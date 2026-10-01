# Versioned service behavior

This is the reusable design for services that can have multiple installed
versions. Apache is the reference implementation.

## Goals

- Keep every installed version in its own directory.
- Allow a new version to be installed without overwriting another version.
- Track one active/default version for Server Engine to run.
- Run only one version of a single service at a time.
- Stop the current version before installing or reinstalling another version.
- Make the active version visible in the UI and API.
- Make integrations, connectors, logs, configuration, and startup use the
  active version automatically.

## Directory layout

Use a service root with a `versions` directory:

```text
/opt/server-engine/services/<service>/
├── versions/
│   ├── <version-a>/
│   └── <version-b>/
└── .serverengine-active-version
```

Each version directory owns its complete runtime:

```text
<version>/
├── bin/
├── conf/
├── include/
├── lib/
├── logs/
├── modules/
└── run/
```

The active-version file contains only the selected version, for example:

```text
2.4.68
```

Existing single-directory installations must remain readable as a legacy
fallback until the user installs a version into the new layout.

## Required markers

Every version should write:

```text
<version>/.serverengine-version
<version>/.serverengine-install-method
```

The install-method marker contains one of:

```text
prebuilt
source
```

The active version is stored only at the service root:

```text
<service>/.serverengine-active-version
```

## Runtime resolution

The runtime resolver must support both forms:

```python
service_root("apache")          # active version, or legacy root
service_root("apache", version) # exact version directory
```

All service operations must use the resolver rather than constructing paths
manually. This includes:

- binary lookup;
- configuration files;
- PID and socket files;
- logs;
- runtime libraries;
- startup jobs;
- service actions;
- connector or Application Shield detection;
- website integration.

## Install and reinstall lifecycle

The install job must follow this order:

1. Resolve and validate the requested version and installation method.
2. Detect the currently active version.
3. Stop the active managed process.
4. Force-kill it if it does not exit cleanly.
5. Remove only stale PID/runtime state belonging to that service.
6. Download or stage the requested release.
7. Install/build into `versions/<requested-version>`.
8. Write the version and installation-method markers.
9. Set `.serverengine-active-version` to the newly installed version.
10. Validate the new configuration and binary.
11. Leave the service stopped; the user explicitly starts it afterward.

An installation failure must not change the active-version marker. If the
requested version already exists, the job is a reinstall of that version and
must still stop the active process before replacing its directory.

## Start, stop, and restart

Service actions without an explicit version operate on the active version.
An explicit version is allowed only for inspection or maintenance unless the
service-specific UI intentionally supports parallel runtimes.

For single-process services such as Apache, Nginx, MySQL, and MariaDB:

- `start` starts the active version;
- `stop` stops the active version;
- `restart` restarts the active version;
- changing the default while a version is running must be rejected or require
  stopping it first.

This prevents two versions from competing for the same ports, PID file, or
socket.

## Version API contract

The service should expose an installed-version response containing:

```json
{
  "active_version": "2.4.68",
  "versions": [
    {
      "version": "2.4.68",
      "path": "/opt/server-engine/services/apache/versions/2.4.68",
      "install_method": "source",
      "active": true,
      "status": "stopped"
    }
  ]
}
```

The UI should show:

- version;
- installation method;
- runtime path;
- active/default state;
- running/stopped state;
- install another version;
- make default.

## Application Shield and connectors

Connector detection must always resolve the active service root. When a new
version becomes active:

1. Do not reuse the previous version's connector.
2. Detect the new binary and its build method.
3. Use a matching prebuilt connector only when its ABI matches the service.
4. Otherwise compile the connector against the new version's headers/APXS.
5. Validate the configuration before attaching it.

For Apache and Nginx, never attach a distro module compiled for a different
server ABI to a custom source build.

### Temporary Caddy connector policy

Application Shield currently requires every provider runtime to use the
**Prebuilt package** method. Source-built Nginx, Apache, OpenLiteSpeed, and
Caddy must stop with a clear message asking the operator to install the
prebuilt runtime. This is a temporary activation policy only: it does not
remove or bypass the existing source connector implementations for Nginx and
Apache, which remain the reference work to return to later.

## Checklist for adding another versioned service

- Add `service_root(service, version)` support.
- Add an active-version marker.
- Add version and install-method markers.
- Enumerate installed versions in the API.
- Make the current service endpoint resolve the active version.
- Install into a version-specific directory.
- Stop and force-stop the active process before install/reinstall.
- Keep the service stopped after installation.
- Add a version-management tab to the service modal.
- Show installation method and runtime path.
- Prevent default switching while the service is running.
- Make logs, configuration, startup, and integrations active-version aware.
- Test install, reinstall, switch, start, stop, restart, and failed install.
