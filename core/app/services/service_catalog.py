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
    {"id": "soap", "name": "SOAP", "description": "SOAP web-service client support."},
]


CATALOG = [
    ServiceDefinition(id="nginx", name="Nginx", category="Web servers", description="High-performance HTTP reverse proxy and web server.", vendor="F5 / Nginx", license="BSD-2-Clause", default_port=80, versions=[v("1.30", "stable"), v("1.28", "stable"), v("1.26", "stable"), v("1.24", "stable")]),
    ServiceDefinition(id="apache", name="Apache HTTP Server", category="Web servers", description="Extensible web server with virtual hosts, modules, and .htaccess support.", vendor="Apache Software Foundation", license="Apache-2.0", default_port=80, versions=[v("2.4.68", "stable"), v("2.4.62", "stable"), v("2.4.58", "stable")]),
    ServiceDefinition(id="openlitespeed", name="OpenLiteSpeed", category="Web servers", description="Event-driven web server with built-in caching and HTTP/3 support.", vendor="LiteSpeed Technologies", license="GPL-3.0", default_port=80, versions=[v("1.8", "stable"), v("1.7", "stable")]),
    ServiceDefinition(id="litespeed", name="LiteSpeed Enterprise", category="Web servers", description="Commercial Apache-compatible web server with high-performance caching.", vendor="LiteSpeed Technologies", license="Commercial", default_port=80, versions=[v("6.3", "stable"), v("6.2", "stable")]),
    ServiceDefinition(id="caddy", name="Caddy", category="Web servers", description="Modern web server with automatic HTTPS and simple configuration.", vendor="Caddy", license="Apache-2.0", default_port=80, versions=[v("2.10", "stable"), v("2.9", "stable")]),
    ServiceDefinition(id="haproxy", name="HAProxy", category="Web servers", description="Reliable TCP and HTTP load balancer and reverse proxy.", vendor="HAProxy Technologies", license="GPL-2.0", default_port=80, versions=[v("3.2", "stable"), v("3.1", "stable")]),
    ServiceDefinition(id="php", name="PHP-FPM", category="Application runtimes", description="Isolated PHP runtimes and FastCGI process pools; multiple versions can run together.", vendor="PHP Foundation", license="PHP-3.01", default_port=9000, versions=[v("8.5", "stable"), v("8.4", "stable"), v("8.3", "stable"), v("8.2", "security"), v("8.1", "security"), v("8.0", "security"), v("7.4", "security"), v("7.3", "security"), v("7.2", "security"), v("7.1", "security"), v("7.0", "security"), v("5.6", "security")]),
    ServiceDefinition(id="nodejs", name="Node.js", category="Application runtimes", description="JavaScript runtime for server-side applications and tooling.", vendor="OpenJS Foundation", license="MIT", versions=[v("24", "stable"), v("22", "lts"), v("20", "lts")]),
    ServiceDefinition(id="python", name="Python", category="Application runtimes", description="Python runtime for WSGI/ASGI applications and automation.", vendor="Python Software Foundation", license="PSF-2.0", versions=[v("3.13", "stable"), v("3.12", "stable"), v("3.11", "security")]),
    ServiceDefinition(id="ruby", name="Ruby", category="Application runtimes", description="Ruby runtime for Rails and Rack applications.", vendor="Ruby Community", license="Ruby/BSD", versions=[v("3.4", "stable"), v("3.3", "stable")]),
    ServiceDefinition(id="mariadb", name="MariaDB", category="Databases", description="MySQL-compatible relational database server.", vendor="MariaDB Foundation", license="GPL-2.0", default_port=3306, versions=[v("11.8", "lts"), v("11.4", "lts"), v("10.11", "lts"), v("10.6", "security")]),
    ServiceDefinition(id="mysql", name="MySQL", category="Databases", description="Relational database server for web applications.", vendor="Oracle", license="GPL-2.0 / Commercial", default_port=3306, versions=[v("8.4", "lts"), v("8.0", "stable")]),
    ServiceDefinition(id="postgresql", name="PostgreSQL", category="Databases", description="Advanced open-source relational database server.", vendor="PostgreSQL Global Development Group", license="PostgreSQL License", default_port=5432, versions=[v("18", "stable"), v("17", "stable"), v("16", "stable"), v("15", "stable")]),
    ServiceDefinition(id="redis", name="Redis", category="Databases & cache", description="In-memory data store for cache, queues, and realtime features.", vendor="Redis", license="RSALv2/SSPLv1", default_port=6379, versions=[v("8", "stable"), v("7", "stable")]),
    ServiceDefinition(id="valkey", name="Valkey", category="Databases & cache", description="Linux Foundation-backed Redis-compatible in-memory data store.", vendor="Linux Foundation", license="BSD-3-Clause", default_port=6379, versions=[v("9", "stable"), v("8", "stable")]),
    ServiceDefinition(id="memcached", name="Memcached", category="Databases & cache", description="Simple distributed memory caching system.", vendor="Memcached", license="BSD-3-Clause", default_port=11211, versions=[v("1.6", "stable")]),
    ServiceDefinition(id="certbot", name="Certbot", category="Security & operations", description="Automatic TLS certificate issuance and renewal client.", vendor="EFF", license="Apache-2.0", versions=[v("latest", "stable")]),
    ServiceDefinition(id="vsftpd", name="vsftpd", category="Security & operations", description="Lightweight FTP server for legacy deployment workflows.", vendor="vsftpd", license="GPL-2.0", default_port=21, versions=[v("3.0", "stable")]),
    ServiceDefinition(id="fail2ban", name="Fail2ban", category="Security & operations", description="Log-based intrusion prevention and temporary bans.", vendor="Fail2ban", license="GPL-2.0", versions=[v("1.1", "stable"), v("1.0", "stable")]),
]


def get_service(service_id: str) -> ServiceDefinition | None:
    return next((service for service in CATALOG if service.id == service_id), None)
