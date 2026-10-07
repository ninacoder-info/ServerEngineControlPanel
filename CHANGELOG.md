# Server Engine changelog

Release notes for the Server Engine control panel and control-plane runtime.

## Unreleased

- Added a dedicated OpenSSL compatibility-runtime modal with isolated runtime
  overview, EOL guidance, source-version refresh, build queueing, and installed
  runtime details.
- Fixed PHP runtime information pages so the version is read from the URL when
  the dashboard pathname renderer does not provide a React Router parameter.
- Fixed Node.js runtime status styling so installed runtimes use the success
  color instead of the stopped warning color.
- Added category subjects to log entries, including `Nginx · error.log` and
  versioned PHP log labels, while removing the duplicate header from the log
  content pane.
- Tightened the Logs and Terminal controls in the global status bar.
- Fixed cancelled package jobs leaving the serialized operation queue blocked by
  tracking and terminating their full apt/download process groups.

## v0.1.34

- Fixed PHP 5.6 ICU linking through libtool by using absolute isolated ICU
  libraries, including `libicuio`, and disabling `--as-needed` around the
  compatibility libraries.
- Preserve failed PHP source-build workspaces so the generated Makefile and
  final linker command can be inspected without repeating the full build.
- Terminate tracked PHP compiler processes immediately when a job is cancelled
  so the next serialized operation can start instead of remaining queued.
- Disable the stale Server Engine Sury source on unsupported Ubuntu 23.10
  hosts before APT metadata refresh, without changing unrelated APT sources.

## v0.1.33

- Fixed PHP 5.6 ICU linking when generated multiline Makefile variables
  dropped the isolated ICU libraries from the PHP-FPM link command.
- Appended ICU 57 libraries with explicit Make `+=` assignments for the FPM,
  global, and intl extension link targets.

## v0.1.32

- Fixed PHP 5.6 source linking against the isolated ICU 57 compatibility
  runtime.
- Explicitly links `libicui18n`, `libicuuc`, and `libicudata` so intl IDN and
  SpoofChecker symbols resolve during the PHP-FPM build.
- Verifies the required isolated ICU libraries before starting the PHP build.

## v0.1.31

- Fixed repeated Application Shield connector preparation when a runtime
  library symlink already exists.
- Made shared ModSecurity runtime-library staging safely refresh existing
  files and symlinks without failing with `File exists`.

## v0.1.30

- Fixed Nginx Application Shield attachment so the managed ModSecurity module
  remains loaded while the connector is being validated.
- Prevented Nginx normalization from removing `load_module` during an active
  Shield attach transaction.
- Made release-note lookup prefer the GitHub release body and avoid showing an
  unrelated `Unreleased` changelog section when a tagged changelog is absent.

## v0.1.29

- Fixed Nginx settings so the saved HTTP port is read back by the panel.
- Applied the Nginx HTTP port to generated website server blocks instead of
  inserting an invalid `listen` directive into the global configuration.
- Migrated legacy per-site Nginx log paths into `/server-engine/logs/nginx`.
- Fixed Nginx configuration validation during Application Shield attachment.
- Persisted ModSecurity connector runtime libraries, including GeoIP, so
  prebuilt and source-built Nginx connectors can load successfully.
- Removed placeholder Nginx modal values and displayed live configuration
  values for performance and security settings.

## v0.1.27

- Fixed release-note rendering so Markdown bullets display as bullets instead of malformed numbered list items.
- Fixed PowerDNS startup by removing unsupported SOA and incompatible DNSSEC
  algorithm directives from isolated runtime configuration.
- Added a PowerDNS stopped-state card to Domains & DNS with direct service
  configuration access and socket-driven status updates.
- Fixed the PowerDNS configuration modal to display live start and stop status.
- Kept the global job status bar behind modal overlays.
- Updated the dashboard greeting to “Good day” with the standard accent style.
- Fixed the panel updater capability boundary so updates can be started from
  the control panel without a manual sudo command.
- Grant only the isolated PowerDNS binary permission to bind its required DNS
  port 53 without broadening the control-plane port privileges.
- Run the Docker development control plane as root, matching the native
  control-plane service, while keeping managed service workers on `serverengine`.
- Include `CAP_SETFCAP` in the generated core service so isolated PowerDNS can
  receive its port-53 capability automatically after install or update.
- Added a root-owned, whitelisted build-dependency helper for controlled source
  build preparation.
- Run the native control-plane service as root for installation and service
  management while retaining `serverengine` for managed service workers.
- Fixed the PHP source-version catalog so the compile selector validates PHP
  archives instead of accidentally showing MongoDB release versions.
- Fixed PHP source builds for older releases by using version-compatible GD
  configure flags and staging multiarch libcurl headers in the isolated build
  workspace.

## v0.1.14

- Keep the services inventory available when an isolated runtime has unsafe
  ownership or permissions instead of returning an API error.
- Repair ownership and executable access for the isolated Certbot runtime
  during installation or update without touching host certificate files.

## v0.1.13

- Update the Services inventory from the shared socket when a new service is
  installed, including PowerDNS, without requiring a page reload.
- Include the installed service version in socket status events.

## v0.1.12

- Added `sudo serverengine update` for installer-backed SSH updates.
- The SSH command uses the same isolated updater as the panel update button.

## v0.1.11

- Run panel updates in a separate systemd service scope so stopping the
  existing core and web services cannot terminate the updater mid-install.

## v0.1.10

- Grant the core service only `CAP_NET_ADMIN` so the unprivileged
  `serverengine` user can manage the nftables firewall namespace.

## v0.1.9

- Added a one-time panel update check against the configured GitHub release.
- Added a compact update indicator beside the panel version.
- Added a release-notes confirmation modal before updating.
- Panel updates use the existing installer and preserve Server Engine state,
  websites, services, logs, and backups.
- Fixed prebuilt service staging so a service root cannot delete its own
  temporary extraction directory.
- Fixed ownership of `/opt/server-engine/services` for the `serverengine`
  runtime user.
- Added a protected GitHub token field under Security & access for private
  release checks and panel updates.
- Rendered release notes as Markdown and fetches the matching changelog section
  from the tagged GitHub release.
- Published release notes from the matching changelog section automatically.

## v0.1.8

- Treat Certbot as an installed command-line runtime instead of a daemon.

## v0.1.7

- Include the Server Engine icon in production release assets.

## v0.1.6

- Remove one-time bootstrap credentials after the first successful startup.
