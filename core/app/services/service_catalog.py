import json
import urllib.request

from app.models.service import ServiceDefinition, ServiceVersion


def v(version: str, channel: str):
    return ServiceVersion(version=version, channel=channel)


PHP_EXTENSIONS = [
    {"id": "redis", "name": "Redis", "description": "Redis client for PHP applications."},
    {"id": "opcache", "name": "OPcache", "description": "Bytecode cache for faster PHP execution."},
    {"id": "curl", "name": "cURL", "description": "HTTP and HTTPS client support."},
    {"id": "mbstring", "name": "Multibyte string", "description": "UTF-8 and multibyte string handling."},
    {"id": "mysql", "name": "MySQL", "description": "PDO and MySQLi database drivers."},
    {"id": "pgsql", "name": "PostgreSQL", "description": "PostgreSQL database drivers."},
    {"id": "xml", "name": "XML", "description": "XML, DOM, SimpleXML, and XSL support."},
    {"id": "gd", "name": "GD", "description": "Raster image processing support."},
    {"id": "zip", "name": "Zip", "description": "ZIP archive support."},
    {"id": "intl", "name": "Internationalization", "description": "Locale and Unicode support."},
    {"id": "bcmath", "name": "BCMath", "description": "Arbitrary precision mathematics."},
    {"id": "fileinfo", "name": "Fileinfo", "description": "File type detection used by Composer, Laravel, and WordPress."},
    {"id": "soap", "name": "SOAP", "description": "SOAP web-service client support."},
]


CATALOG = [
    ServiceDefinition(id="nginx", name="Nginx", category="Web servers", description="High-performance HTTP reverse proxy and web server.", vendor="F5 / Nginx", license="BSD-2-Clause", default_port=80, versions=[v("1.30", "stable"), v("1.28", "stable"), v("1.26", "stable"), v("1.24", "stable"), v("1.22", "security"), v("1.20", "security"), v("1.18", "security")]),
    ServiceDefinition(id="apache", name="Apache HTTP Server", category="Web servers", description="Extensible web server with virtual hosts, modules, and .htaccess support.", vendor="Apache Software Foundation", license="Apache-2.0", default_port=80, versions=[v("2.4.68", "stable"), v("2.4.62", "stable"), v("2.4.58", "stable"), v("2.4.57", "security"), v("2.4.54", "security"), v("2.4.52", "security"), v("2.4.48", "security")]),
    ServiceDefinition(id="openlitespeed", name="OpenLiteSpeed", category="Web servers", description="Event-driven web server with built-in caching and HTTP/3 support.", vendor="LiteSpeed Technologies", license="GPL-3.0", default_port=80, versions=[v("1.8", "stable"), v("1.7", "stable"), v("1.6", "security"), v("1.5", "security")]),
    ServiceDefinition(id="litespeed", name="LiteSpeed Enterprise", category="Web servers", description="Commercial Apache-compatible web server with high-performance caching.", vendor="LiteSpeed Technologies", license="Commercial", default_port=80, versions=[v("6.3", "stable"), v("6.2", "stable"), v("6.1", "security"), v("6.0", "security")]),
    ServiceDefinition(id="caddy", name="Caddy", category="Web servers", description="Modern web server with automatic HTTPS and simple configuration.", vendor="Caddy", license="Apache-2.0", default_port=80, versions=[v("2.10", "stable"), v("2.9", "stable"), v("2.8", "stable"), v("2.7", "security")]),
    ServiceDefinition(id="haproxy", name="HAProxy", category="Web servers", description="Reliable TCP and HTTP load balancer and reverse proxy.", vendor="HAProxy Technologies", license="GPL-2.0", default_port=80, versions=[v("3.2", "stable"), v("3.1", "stable"), v("3.0", "stable"), v("2.9", "security"), v("2.8", "security")]),
    ServiceDefinition(id="php", name="PHP-FPM", category="Application runtimes", description="Isolated PHP runtimes and FastCGI process pools; multiple versions can run together.", vendor="PHP Foundation", license="PHP-3.01", default_port=9000, versions=[v("8.5", "stable"), v("8.4", "stable"), v("8.3", "stable"), v("8.2", "security"), v("8.1", "security"), v("8.0", "security"), v("7.4", "security"), v("7.3", "security"), v("7.2", "security"), v("7.1", "security"), v("7.0", "security"), v("5.6", "security")]),
    ServiceDefinition(id="nodejs", name="Node.js", category="Application runtimes", description="JavaScript runtime for server-side applications and tooling. Multiple major versions can coexist for separate projects.", vendor="OpenJS Foundation", license="MIT", versions=[v("26", "mainline"), v("25", "legacy"), v("24", "lts"), v("23", "legacy"), v("22", "lts"), v("21", "legacy"), v("20", "legacy"), v("19", "legacy"), v("18", "legacy"), v("17", "legacy"), v("16", "legacy"), v("15", "legacy"), v("14", "legacy"), v("13", "legacy"), v("12", "legacy")]),
    ServiceDefinition(id="python", name="Python", category="Application runtimes", description="Python runtime for WSGI/ASGI applications and automation.", vendor="Python Software Foundation", license="PSF-2.0", versions=[v("3.13", "stable"), v("3.12", "stable"), v("3.11", "stable"), v("3.10", "security"), v("3.9", "security"), v("3.8", "security")]),
    ServiceDefinition(id="ruby", name="Ruby", category="Application runtimes", description="Ruby runtime for Rails and Rack applications.", vendor="Ruby Community", license="Ruby/BSD", versions=[v("3.4", "stable"), v("3.3", "stable"), v("3.2", "stable"), v("3.1", "security"), v("3.0", "security"), v("2.7", "security")]),
    ServiceDefinition(id="mariadb", name="MariaDB", category="Databases", description="MySQL-compatible relational database server.", vendor="MariaDB Foundation", license="GPL-2.0", default_port=3306, versions=[v("11.8", "lts"), v("11.4", "lts"), v("10.11", "lts"), v("10.6", "security"), v("10.5", "security"), v("10.4", "security"), v("10.3", "security")]),
    ServiceDefinition(id="mysql", name="MySQL", category="Databases", description="Relational database server for web applications.", vendor="Oracle", license="GPL-2.0 / Commercial", default_port=3306, versions=[v("9.7", "lts"), v("9.6", "mainline"), v("9.5", "mainline"), v("9.4", "mainline"), v("9.3", "mainline"), v("9.2", "mainline"), v("9.1", "mainline"), v("9.0", "mainline"), v("8.4", "lts"), v("8.0", "stable"), v("5.7", "security")]),
    ServiceDefinition(id="postgresql", name="PostgreSQL", category="Databases", description="Advanced open-source relational database server.", vendor="PostgreSQL Global Development Group", license="PostgreSQL License", default_port=5432, versions=[v("18", "stable"), v("17", "stable"), v("16", "stable"), v("15", "stable"), v("14", "security"), v("13", "security"), v("12", "security"), v("11", "security")]),
    ServiceDefinition(id="redis", name="Redis", category="Databases & cache", description="In-memory data store for cache, queues, and realtime features.", vendor="Redis", license="RSALv2/SSPLv1", default_port=6379, versions=[v("8", "stable"), v("7", "stable"), v("6", "security"), v("5", "security")]),
    ServiceDefinition(id="valkey", name="Valkey", category="Databases & cache", description="Linux Foundation-backed Redis-compatible in-memory data store.", vendor="Linux Foundation", license="BSD-3-Clause", default_port=6379, versions=[v("9", "stable"), v("8", "stable"), v("7", "security")]),
    ServiceDefinition(id="memcached", name="Memcached", category="Databases & cache", description="Simple distributed memory caching system.", vendor="Memcached", license="BSD-3-Clause", default_port=11211, versions=[v("1.6", "stable"), v("1.5", "security")]),
    ServiceDefinition(id="certbot", name="Certbot", category="Security & operations", description="Automatic TLS certificate issuance and renewal client.", vendor="EFF", license="Apache-2.0", versions=[v("latest", "stable"), v("2.11", "stable"), v("2.10", "security"), v("1.32", "security")]),
    ServiceDefinition(id="vsftpd", name="vsftpd", category="Security & operations", description="Lightweight FTP/FTPS server for legacy deployment workflows.", vendor="vsftpd", license="GPL-2.0", default_port=21, versions=[v("3.0.5", "stable"), v("3.0.3", "security"), v("3.0.2", "security")]),
    ServiceDefinition(id="fail2ban", name="Fail2ban", category="Security & operations", description="Log-based intrusion prevention and temporary bans.", vendor="Fail2ban", license="GPL-2.0", versions=[v("1.1", "stable"), v("1.0", "stable"), v("0.11", "security"), v("0.10", "security")]),
]


# These capabilities belong in the Services catalog, but are managed through
# a feature page or an external provider rather than extracted as an isolated
# Debian package by the generic installer.
CATALOG.extend([
    ServiceDefinition(id="modsecurity", name="ModSecurity WAF", category="Security & traffic", description="Web application firewall with OWASP Core Rule Set protection for websites.", vendor="OWASP / SpiderLabs", license="Apache-2.0", versions=[v("3", "stable")], mode="service", installable=True, management_path="/firewall", management_label="Open WAF controls"),
    ServiceDefinition(id="ddos-protection", name="DDoS protection", category="Security & traffic", description="Origin rate limits, connection controls, and upstream protection integrations for volumetric and application attacks.", vendor="Server Engine / provider", license="Managed capability", versions=[v("managed", "stable")], mode="integration", installable=False, management_path="/firewall", management_label="Open traffic protection"),
    ServiceDefinition(id="cloudflare", name="Cloudflare edge protection", category="Security & traffic", description="Connect DNS, proxying, WAF, rate limiting, bot controls, and edge DDoS mitigation to a website.", vendor="Cloudflare", license="External integration", versions=[v("API", "stable")], mode="integration", installable=False, management_path="/domains", management_label="Open DNS integrations"),
    ServiceDefinition(id="malware-scanner", name="Website malware scanner", category="Security & traffic", description="Scheduled webroot scans, PHP webshell detection, quarantine, and file integrity alerts.", vendor="Server Engine", license="Managed capability", versions=[v("managed", "stable")], mode="feature", installable=False, management_path="/health", management_label="Open security scans"),
    ServiceDefinition(id="supervisor", name="Supervisor", category="Process managers", description="Keep Laravel workers, queue consumers, Python processes, and custom daemons running.", vendor="Supervisor", license="BSD-3-Clause", versions=[v("4.3", "stable"), v("4.2", "security")], mode="service", installable=True, management_path="/services", management_label="Open process managers"),
    ServiceDefinition(id="pm2", name="PM2", category="Process managers", description="Production Node.js process management, clustering, startup, and log handling.", vendor="PM2", license="AGPL-3.0", versions=[v("7.0.4", "stable"), v("6.0.14", "security"), v("5.4.3", "legacy")], mode="service", installable=True, management_path="/services", management_label="Open process managers"),
    ServiceDefinition(id="postfix", name="Postfix", category="Mail services", description="Outbound and inbound SMTP transport for managed domains and application mail.", vendor="Postfix", license="IPL-1.0", versions=[v("3.10", "stable"), v("3.8", "security")], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="dovecot", name="Dovecot", category="Mail services", description="IMAP, POP3, LMTP, mailbox storage, and secure mail delivery sessions.", vendor="Dovecot", license="MIT/LGPL-2.1", versions=[v("2.4", "stable"), v("2.3", "security")], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="rspamd", name="Rspamd", category="Mail services", description="Spam filtering, DKIM signing, reputation checks, and mail policy automation.", vendor="Rspamd", license="Apache-2.0", versions=[v("3.11", "stable"), v("3.8", "security")], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="stalwart", name="Stalwart Mail Server", category="Mail services", description="Modern all-in-one mail and collaboration server with SMTP, IMAP, JMAP, spam filtering, calendars, contacts, and API-managed domains.", vendor="Stalwart Labs", license="AGPL-3.0 / Enterprise", default_port=25, versions=[v("0.16", "stable")], mode="service", installable=True, management_path="/email", management_label="Open mail controls"),
    ServiceDefinition(id="powerdns", name="PowerDNS Authoritative", category="DNS services", description="Authoritative DNS for hosted zones with API-managed records, DNSSEC, nameserver templates, and automation.", vendor="PowerDNS", license="GPL-2.0", default_port=53, versions=[v("5", "stable"), v("4.9", "security")], mode="service", installable=True),
    ServiceDefinition(id="bind9", name="BIND 9", category="DNS services", description="Authoritative and recursive DNS service for self-hosted zones.", vendor="ISC", license="MPL-2.0", versions=[v("9.20", "stable"), v("9.18", "security")], mode="service", installable=True, management_path="/domains", management_label="Open DNS controls"),
    ServiceDefinition(id="unbound", name="Unbound", category="DNS services", description="Validating recursive DNS resolver with caching and DNSSEC support.", vendor="NLnet Labs", license="BSD-3-Clause", versions=[v("1.24", "stable"), v("1.19", "security")], mode="service", installable=True, management_path="/domains", management_label="Open DNS controls"),
    ServiceDefinition(id="clamav", name="ClamAV", category="Security & operations", description="Scheduled malware scanning for website files, uploads, mail, and backups.", vendor="ClamAV", license="GPL-2.0", versions=[v("1.5", "stable"), v("1.4", "security")], mode="service", installable=True, management_path="/health", management_label="Open security scans"),
    ServiceDefinition(id="auditd", name="Linux audit", category="Security & operations", description="Kernel audit events for privileged actions, file changes, authentication, and policy review.", vendor="Linux Audit", license="GPL-2.0", versions=[v("managed", "stable")], mode="service", installable=True, management_path="/logs", management_label="Open audit logs"),
    ServiceDefinition(id="lynis", name="Lynis hardening audit", category="Security & operations", description="Security audit and hardening recommendations for the host and its services.", vendor="CISOfy", license="GPL-3.0", versions=[v("3", "stable")], mode="service", installable=True, management_path="/health", management_label="Open health checks"),
    ServiceDefinition(id="logrotate", name="Logrotate", category="Monitoring & operations", description="Retention, compression, and rotation policies for website and service logs.", vendor="Linux", license="GPL-2.0", versions=[v("managed", "stable")], mode="service", installable=True, management_path="/logs", management_label="Open log controls"),
    ServiceDefinition(id="node-exporter", name="Prometheus Node Exporter", category="Monitoring & operations", description="Host metrics for CPU, memory, disk, network, filesystems, and alerting integrations.", vendor="Prometheus", license="Apache-2.0", versions=[v("1.10", "stable"), v("1.9", "security")], mode="service", installable=True, management_path="/health", management_label="Open monitoring"),
    ServiceDefinition(id="rabbitmq", name="RabbitMQ", category="Queues & messaging", description="Reliable queues and messaging for workers, event processing, and distributed applications.", vendor="Broadcom", license="MPL-2.0", versions=[v("4.2", "stable"), v("4.1", "security"), v("3.13", "security")], mode="service", installable=True, management_path="/services", management_label="Open queue managers"),
    ServiceDefinition(id="mongodb", name="MongoDB", category="Databases", description="Document database for flexible application data and event-oriented workloads.", vendor="MongoDB", license="SSPL-1.0", versions=[v("8.2", "stable"), v("8.0", "stable"), v("7.0", "security")], mode="service", installable=True, management_path="/databases", management_label="Open database manager"),
    ServiceDefinition(id="sqlserver", name="Microsoft SQL Server", category="Databases", description="Microsoft relational database engine managed in an isolated Docker container on supported Linux hosts.", vendor="Microsoft", license="Commercial", versions=[v("2025", "stable"), v("2022", "security")], mode="integration", installable=False, management_path="/databases", management_label="Open database manager"),
    ServiceDefinition(id="opensearch", name="OpenSearch", category="Databases & search", description="Search and analytics engine for application search, logs, and dashboards.", vendor="OpenSearch", license="Apache-2.0", versions=[v("3", "stable"), v("2", "security")], mode="service", installable=True, management_path="/services", management_label="Open search services"),
    ServiceDefinition(id="docker", name="Docker Engine", category="Deployment tools", description="Container runtime and Compose projects for isolated application deployments.", vendor="Docker", license="Apache-2.0 / Commercial", versions=[v("latest", "stable")], mode="service", installable=True, management_path="/services", management_label="Open container tools"),
    ServiceDefinition(id="git", name="Git", category="Deployment tools", description="Repository checkout, deployment hooks, rollback, and application source management.", vendor="Git", license="GPL-2.0", versions=[v("2.52", "stable"), v("2.47", "security")], mode="service", installable=True, management_path="/websites", management_label="Open deployment tools"),
    ServiceDefinition(id="composer", name="Composer", category="Deployment tools", description="Isolated PHP dependency manager, ready for Laravel and WordPress projects.", vendor="Composer", license="MIT", versions=[v("2.8", "stable"), v("2.7", "security")]),
    ServiceDefinition(id="wp-cli", name="WP-CLI", category="Deployment tools", description="WordPress installation, updates, database tasks, cache control, and scripted maintenance.", vendor="WordPress", license="MIT", versions=[v("2.12", "stable"), v("2.11", "security")], mode="service", installable=True, management_path="/websites", management_label="Open website tools"),
    ServiceDefinition(id="imagemagick", name="ImageMagick", category="Deployment tools", description="Image conversion and optimization for WordPress, Laravel, and media workflows.", vendor="ImageMagick", license="Apache-2.0", versions=[v("7", "stable"), v("6", "security")], mode="service", installable=True, management_path="/services", management_label="Open runtime tools"),
    ServiceDefinition(id="ffmpeg", name="FFmpeg", category="Deployment tools", description="Audio and video processing for media applications and background jobs.", vendor="FFmpeg", license="LGPL-2.1/GPL-2.0", versions=[v("8", "stable"), v("7", "security")], mode="service", installable=True, management_path="/services", management_label="Open runtime tools"),
])


def get_service(service_id: str) -> ServiceDefinition | None:
    return next((service for service in CATALOG if service.id == service_id), None)


def refresh_service_versions(service_id: str) -> tuple[ServiceDefinition, str, str]:
    """Refresh a provider-backed version list while retaining a safe fallback."""
    definition = get_service(service_id)
    if definition is None:
        raise ValueError("Service is not in the provider catalog")
    if service_id != "pm2":
        return definition, "catalog", "This service currently uses the built-in compatibility catalog."
    try:
        request = urllib.request.Request(
            "https://registry.npmjs.org/pm2",
            headers={"Accept": "application/json", "User-Agent": "Server-Engine-Control-Panel"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            metadata = json.loads(response.read().decode("utf-8"))
        versions = metadata.get("versions", {})
        latest = metadata.get("dist-tags", {}).get("latest")
        ordered = []
        if latest in versions:
            ordered.append(latest)
        ordered.extend(version for version in reversed(list(versions)) if version != latest)
        selected = []
        for version in ordered:
            if version.startswith("0.") or "-" in version:
                continue
            major = int(version.split(".", 1)[0])
            channel = "stable" if version == latest else "security" if major >= max(1, int(str(latest).split(".", 1)[0]) - 1) else "legacy"
            selected.append(v(version, channel))
            if len(selected) == 12:
                break
        if selected:
            definition.versions = selected
            return definition, "npm", f"Fetched {len(selected)} PM2 releases from the official npm registry."
    except Exception:
        pass
    return definition, "catalog", "The provider could not be reached. The saved compatibility list is still available."
