# Server Engine changelog

Release notes for the Server Engine control panel and control-plane runtime.

## Unreleased

## v0.1.60

- Added the full file-manager workspace with SimpleBar scrolling, resizable
  navigation, cut and paste actions, secure downloads, context menus, and a
  CodeMirror editor toolbar.
- Added live service indicators for Server, Nginx, Application Shield, Logs,
  and Terminal, including socket-driven status updates and runtime-aware
  terminal sessions.
- Added nftables configuration, firewall disabled-state handling, reusable IP
  validation, and improved Application Shield traffic and audit reporting.
- Improved website and reverse-proxy management with maintenance mode,
  redirects, canonical domains, TLS status and expiry details, log controls,
  proxy routing, and isolated ACME challenge paths.
- Added CMS deployment improvements for Laravel, WordPress, and Drupal,
  including runtime selection, dependency provisioning, validation, database
  setup, administrator credentials, and rollback on failure.
- Added PHP, Node.js, MySQL, phpMyAdmin, Supervisor, and service configuration
  improvements with live status updates and reusable configuration modal
  behavior.
- Added appearance settings, sidebar collapse mode, shared tooltips, compact
  log controls, cached service catalogs, and improved panel update handling.
- Fixed isolated runtime libraries, Composer and Certbot execution, Nginx
  configuration validation, PHP session paths, missing service assets, and
  failed deployment cleanup.

## v0.1.59

- Added Windows-style Cut and Paste file operations, including multi-item
  moves, overwrite confirmation, and an empty-space context menu for New
  folder and Paste.
- Made Drupal deployment match WordPress CMS deployment with required MySQL,
  administrator credentials, site title, site description, and automatic
  isolated Drush installation and site setup.
- Added automatic Composer and WP-CLI installation during application
  deployment when the selected PHP runtime requires them.
- Restricted custom website project folders to safe subdirectories under the
  managed website root and rolled back failed application deployments cleanly.
- Added isolated Drupal and CMS database validation on both the frontend and
  backend.

- Added a terminal PHP runtime menu that opens or focuses a dedicated tab for
  each installed PHP version and scopes `php`, Composer, and WP-CLI to the
  selected runtime for that terminal session.
- Added Clang and libclang build dependencies for Stalwart source builds and
  automatic `LIBCLANG_PATH` detection for RocksDB bindgen compilation.

## v0.1.58

- Isolated reverse-proxy ACME HTTP-01 challenges under
  `/server-engine/proxies/<domain>` instead of the shared website root.
- Automatically creates proxy challenge directories and regenerates and
  validates the active Nginx configuration before certificate issuance.
- Fixed HTTPS redirect state so disabling HTTPS also removes stale forced-
  redirect directives from generated proxy configuration.
- Keep the proxy edit modal open after saving an existing proxy.

## v0.1.57

- Added ACME certificate issuance for reverse proxies, including aliases,
  HTTP-01 challenge routing, queued job progress, and automatic status refresh.
- Fixed isolated Certbot detection by invoking its Python package directly when
  the generated launcher metadata is incomplete.
- Fixed Docker development Certbot setup to rebuild stale persisted virtual
  environments when their compiled dependencies do not match the container
  architecture.

## v0.1.56

- Added the PHP runtime selector and session-aware terminal tabs, including
  per-runtime command mapping and terminal close/kill controls.
- Added live Server, Nginx, Shield, Logs, and Terminal status indicators to the
  panel status bar.
- Improved reverse-proxy management with provider metadata, reusable IP tags,
  domain-only creation, canonical redirects, maintenance controls, and proxy
  log settings matching website log controls.
- Added proxy and website log configuration with graceful reload behavior and
  clearer log storage details.
- Fixed proxy configuration validation, provider log-directory creation, and
  missing Nginx connector/runtime handling.

- Fixed authenticated GitHub release downloads to fall back to the direct
  latest-release URL when the API does not expose the asset metadata.

## v0.1.55

- Fixed the Application Shield Nginx connector flow after installing a new
  Nginx version, allowing the matching connector to be attached again.
- Added working open, edit, and remove actions for Node.js projects and
  reverse-proxy routes while keeping PHP and Terminal controls exclusive to
  websites.
- Fixed the Websites page so project and proxy registries load immediately on
  first render instead of only after opening a modal.
- Added independent project/proxy loading so unrelated supporting-request
  failures cannot hide existing routes.
- Added the Application Shield reports and detection-category chart updates,
  including readable long detection labels.
- Added the missing ApexCharts dependencies to the web package and refreshed
  the Docker development frontend dependency installation.

## v0.1.54

- Added SQLite indexing for Application Shield audit events, with fast reports,
  traffic pagination, country grouping, rule grouping, and activity summaries.
- Defaulted ModSecurity audit logging to `SecAuditLogParts ABFHZ` so request and
  response bodies are not stored in new audit transactions.
- Added Application Shield world traffic map with dark/light theme support,
  country hover details, click-to-inspect data, and country flags.
- Included the Application Shield SQLite index in the Logs page size total.
- Added `react-simple-maps`, bundled world map data, and ISO country mapping to
  the production frontend without an external map API key.

- Removed stale Application Shield Nginx module references when the exact
  connector is missing, allowing Nginx to start after an incomplete install.
- Prevented Application Shield from writing an Nginx include without a
  matching version-compatible connector module.
- Marked Shield as ready to attach again when Nginx was replaced and its old
  connector is no longer available; re-attachment now removes the old module
  load before installing the matching connector.
- Added normal list actions to Node.js projects and reverse-proxy routes:
  open, edit, and remove, while keeping PHP and Terminal controls exclusive to
  PHP websites.
- Made project and proxy list loading independent so a failed supporting
  request cannot hide existing proxy routes.

- Allow readable project and reverse-proxy names such as `Server Engine
  Panel`; names still reject unsafe characters.
- Added a Server button beside Terminal in the global status bar with an
  authenticated server-information modal showing the hostname, OS, kernel,
  architecture, uptime, CPU/load, disk capacity, Python, and Server Engine
  version. The modal loads on demand and supports explicit refresh.
- Fixed serialized jobs showing “Queued behind another operation” even when
  the operation started immediately.
- Fixed maintenance responses to declare UTF-8 and render sanitized formatted
  HTML, added a maintenance badge to the website list, and added a full
  formatted message editor with preview, headings, alignment, lists, links,
  quotes, code blocks, undo, redo, and clear formatting.
- Added CSS certificate-expiry tooltips and warning/error colors to the website
  list for TLS certificates expiring within 30 days or already expired.
- Corrected website TLS status so an enabled HTTPS setting without an issued
  certificate is shown as pending instead of healthy.
- Replaced website access restrictions with validated removable IP tags and
  support for safe IPv4 wildcard input such as `230.*.*.*`.
- Added a default Nginx PHP `try_files $uri =404` guard so nonexistent PHP
  probes are rejected by Nginx before reaching PHP-FPM.
- Fixed an internal error when saving access-log or error-log settings for a
  website with a custom Nginx configuration.
- Applied website access-log and error-log switches to custom Nginx server
  configurations without replacing the rest of the user-managed file.
- Prevented OWASP CRS audit directives from retaining ordinary allowed
  requests; Application Shield now keeps blocked responses and 5xx failures.
- Added hover-only clear and delete actions for individual log files, plus a
  compact log toolbar for tailing, refreshing, copying, downloading, and
  wrapping log output.
- Added a per-website Logs tab with independent access-log and error-log
  controls, generated safely for the active web-server configuration.
- Moved PHP session and OPcache state to `/server-engine/php/<version>` so
  PHP-FPM writes mutable data outside the extracted runtime tree.
- Reduced Application Shield audit growth by retaining only blocked WAF and
  `5xx` transactions instead of logging every allowed rule match or `404` scan.
- Ensured existing PHP runtimes receive the configured `date.timezone` during
  configuration repair, preventing timezone warnings in legacy applications.

## v0.1.40

- Fixed the generated HTTPS fallback server to reuse an available website
  certificate whenever other sites share the `0.0.0.0:443` SSL listener.
- Keep managed service processes alive while the panel update replaces or
  restarts the Server Engine core and web services.

## v0.1.39

- Fixed the generated Nginx default HTTPS server so it does not declare an
  SSL listener without a certificate.
- Renamed Nginx configuration reload jobs and completion messages from
  “Restart nginx” to “Reload nginx” to reflect the graceful reload command.

## v0.1.38

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
- Fixed URL rewrite persistence so valid rules are no longer mistaken for a
  legacy default and erased when the website is loaded.
- Initialized the website rewrite editor with an explicit empty value so rules
  remain stable while switching between tabs.

## v0.1.34

- Fixed PHP 5.6 ICU linking through libtool by using absolute isolated ICU
  libraries, including `libicuio`, and disabling `--as-needed` around the
  compatibility libraries.
- Preserve failed PHP source-build workspaces so the generated Makefile and
  final linker command can be inspected without repeating the full build.
- Terminate tracked PHP compiler processes immediately when a job is cancelled
- Fixed intermittent Nginx stop failures caused by an empty or stale PID file during startup and reload races.
- Made Stalwart management use the managed credential file dynamically so fresh installs and repaired credentials do not retain stale control-plane authentication.

## v0.1.37

- Matched the MySQL configuration modal Version tab to the Nginx version-management layout.
- Added managed MySQL version inventory, default-version switching, install-version access, and install-method badges.
- Made MySQL version roots resolve through the selected active-version marker.

## v0.1.35

- Matched the MySQL configuration modal Version tab to the Nginx version-management layout.
- Added managed MySQL version inventory, default-version switching, install-version access, and install-method badges.
- Made MySQL version roots resolve through the selected active-version marker.
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
