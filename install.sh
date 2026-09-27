#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Server Engine native customer-server installer.
# Docker is deliberately not used here; docker-compose.yml is the test harness.

readonly INSTALLER_VERSION="0.1.0"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEFAULT_RELEASE_URL="https://github.com/ninacoder-info/ServerEngineWebServer/releases/latest/download/server-engine-release.tar.gz"
RELEASE_URL="${SE_RELEASE_URL:-$DEFAULT_RELEASE_URL}"
ARTIFACT_DIR=""
ARTIFACT_ARCHIVE=""
PREFIX="/opt/server-engine"
STATE_DIR="/var/lib/server-engine"
LOG_DIR="/var/log/server-engine"
WEB_PORT="8888"
API_PORT="8000"
API_HOST="127.0.0.1"
YES="false"
NO_SERVICE="false"
INSTALL_SYSTEM_DEPS="false"
RUN_USER="serverengine"
RUN_GROUP="serverengine"
WEB_ROOT="/server-engine/www"
CERTBOT_ROOT=""
LOCK_FILE="/run/lock/server-engine-install.lock"
LOG_FILE="/var/log/server-engine-install.log"
BACKUP_ROOT="/var/backups/server-engine"
readonly MIN_RAM_MB="1024"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$$"
RELEASE_DIR=""
OLD_RELEASE=""
PM=""
OS_ID=""
OS_VERSION=""
OS_CODENAME=""
ARCH=""
PYTHON=""
NODE=""

usage() {
  cat <<'EOF'
Server Engine native installer

Usage: sudo ./install.sh [options]

Options:
  --prefix PATH           Installation prefix (default: /opt/server-engine)
  --state-dir PATH        Persistent state directory (default: /var/lib/server-engine)
  --web-port PORT         Panel port (default: 8888)
  --api-port PORT         Loopback API port (default: 8000)
  --api-host HOST         API bind address (default: 127.0.0.1)
  --release-url URL       Prebuilt release bundle URL
  --install-system-deps  Install missing OS packages using apt/dnf/yum
  --no-service            Install and verify files without enabling systemd
  -y, --yes               Do not ask before replacing an existing release
  -h, --help              Show this help

This script installs the panel natively on a Linux customer server.
It does not install Docker, Nginx, Apache, PHP, databases, or firewall rules.
EOF
}

die() { echo "ERROR: $*" >&2; exit 1; }
log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
run() { log "+ $*"; "$@"; }
has() { command -v "$1" >/dev/null 2>&1; }

version_ge() {
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

port_is_free() {
  local port="$1"
  if has ss; then ! ss -H -ltn "sport = :$port" | grep -q .; return; fi
  if has lsof; then ! lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | grep -q .; return; fi
  return 0
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --prefix) PREFIX="${2:?--prefix requires a path}"; shift 2;;
      --state-dir) STATE_DIR="${2:?--state-dir requires a path}"; shift 2;;
      --web-port) WEB_PORT="${2:?--web-port requires a port}"; shift 2;;
      --api-port) API_PORT="${2:?--api-port requires a port}"; shift 2;;
      --api-host) API_HOST="${2:?--api-host requires an address}"; shift 2;;
      --release-url) RELEASE_URL="${2:?--release-url requires a URL}"; shift 2;;
      --install-system-deps) INSTALL_SYSTEM_DEPS="true"; shift;;
      --no-service) NO_SERVICE="true"; shift;;
      -y|--yes) YES="true"; shift;;
      -h|--help) usage; exit 0;;
      *) die "unknown option: $1";;
    esac
  done
  [[ "$WEB_PORT" =~ ^[0-9]+$ ]] && [ "$WEB_PORT" -ge 1024 ] && [ "$WEB_PORT" -le 65535 ] || die "invalid web port"
  [[ "$API_PORT" =~ ^[0-9]+$ ]] && [ "$API_PORT" -ge 1024 ] && [ "$API_PORT" -le 65535 ] || die "invalid API port"
  [ "$WEB_PORT" != "$API_PORT" ] || die "web and API ports must differ"
}

prepare_logging() {
  install -d -m 0755 "$(dirname "$LOG_FILE")"
  touch "$LOG_FILE"; chmod 0600 "$LOG_FILE"
  exec > >(tee -a "$LOG_FILE") 2>&1
  log "Server Engine installer $INSTALLER_VERSION started"
}

rollback() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    log "Installation failed with exit code $code"
    if [ -n "$RELEASE_DIR" ] && [ -d "$RELEASE_DIR" ] && [ ! -L "$PREFIX/current" ]; then
      log "Leaving failed release for diagnosis: $RELEASE_DIR"
    fi
    log "Log file: $LOG_FILE"
  fi
  exit "$code"
}

trap rollback EXIT
trap 'die "interrupted"' INT TERM HUP

check_host() {
  [ "$(id -u)" -eq 0 ] || die "run as root"
  [ "$(uname -s)" = "Linux" ] || die "Linux is required"
  [ "$(getconf LONG_BIT)" = "64" ] || die "64-bit Linux is required"
  ARCH="$(uname -m)"
  case "$ARCH" in x86_64|aarch64|arm64) ;; *) die "unsupported architecture: $ARCH";; esac
  [ -r /etc/os-release ] || die "/etc/os-release is required"
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="${ID:-unknown}"; OS_VERSION="${VERSION_ID:-unknown}"; OS_CODENAME="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"
  case "$OS_ID" in
    ubuntu) version_ge "$OS_VERSION" "20.04" || die "Ubuntu 20.04+ is required";;
    debian) version_ge "$OS_VERSION" "11" || die "Debian 11+ is required";;
    rocky|almalinux|rhel|fedora|ol) version_ge "$OS_VERSION" "8" || die "RHEL-family 8+ is required";;
    centos) version_ge "$OS_VERSION" "9" || die "CentOS Stream 9+ is required; CentOS Linux and CentOS Stream 8 are unsupported";;
    *) die "unsupported Linux distribution: $OS_ID $OS_VERSION";;
  esac
  local free_kb; free_kb="$(df -Pk "$(dirname "$PREFIX")" | awk 'NR==2 {print $4}')"
  if [ "${free_kb:-0}" -lt 2097152 ]; then
    die "preflight failed: at least 2 GiB free disk space is required; detected ${free_kb:-0} KiB. Installation stopped."
  fi
  local mem_mb; mem_mb="$(awk '/MemTotal:/ {print int($2/1024)}' /proc/meminfo)"
  if [ "${mem_mb:-0}" -lt "$MIN_RAM_MB" ]; then
    die "preflight failed: at least 1 GiB RAM is required; detected ${mem_mb:-0} MiB. Installation stopped."
  fi
  port_is_free "$WEB_PORT" || die "web port $WEB_PORT is already in use"
  port_is_free "$API_PORT" || die "API port $API_PORT is already in use"
  log "Host: $OS_ID $OS_VERSION / $ARCH / ${mem_mb}MiB RAM"
}

detect_package_manager() {
  if has apt-get; then PM="apt"; elif has dnf; then PM="dnf"; elif has yum; then PM="yum"; else die "apt-get, dnf, or yum is required"; fi
  log "Package manager: $PM"
}

has_source_tree() {
  [ -f "$SOURCE_DIR/core/pyproject.toml" ] && [ -f "$SOURCE_DIR/web/server.mjs" ]
}

download_release_bundle() {
  if has_source_tree; then return 0; fi
  has curl || has wget || die "curl or wget is required to download the Server Engine release bundle"
  ARTIFACT_DIR="$(mktemp -d /tmp/server-engine-release.XXXXXX)"
  ARTIFACT_ARCHIVE="$ARTIFACT_DIR/release.tar.gz"
  log "Downloading prebuilt Server Engine release from $RELEASE_URL"
  if has curl; then
    curl --fail --location --silent --show-error --retry 3 "$RELEASE_URL" -o "$ARTIFACT_ARCHIVE" || die "unable to download the release bundle"
  else
    wget --no-verbose --tries=3 -O "$ARTIFACT_ARCHIVE" "$RELEASE_URL" || die "unable to download the release bundle"
  fi
  tar -xzf "$ARTIFACT_ARCHIVE" -C "$ARTIFACT_DIR" || die "unable to extract the release bundle"
  local extracted
  extracted="$(find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 4 -type f -path '*/core/pyproject.toml' -printf '%h/..\n' | head -n1)"
  [ -n "$extracted" ] && [ -f "$extracted/web/dist/index.html" ] || die "release bundle does not contain a production web build"
  SOURCE_DIR="$(cd -- "$extracted" && pwd)"
}

install_system_dependencies() {
  [ "$INSTALL_SYSTEM_DEPS" = true ] || return 0
  case "$PM" in
    apt) run env DEBIAN_FRONTEND=noninteractive apt-get update; run env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar gzip build-essential python3 python3-venv python3-pip nodejs npm;;
    dnf|yum) run "$PM" install -y ca-certificates curl tar gzip gcc gcc-c++ make python3 python3-pip nodejs npm;;
  esac
}

install_certbot_runtime() {
  CERTBOT_ROOT="$PREFIX/services/certbot"
  local certbot_venv="$CERTBOT_ROOT/venv"
  local certbot_bin="$certbot_venv/bin/certbot"
  install -d -m 0755 "$CERTBOT_ROOT"
  if [ ! -x "$certbot_bin" ]; then
    log "Installing Certbot in the Server Engine service root"
    "$PYTHON" -m venv "$certbot_venv"
    run "$certbot_venv/bin/pip" install --disable-pip-version-check --no-cache-dir --upgrade certbot
  else
    log "Certbot already available at $certbot_bin"
  fi
  ln -sfn "$certbot_bin" /usr/local/bin/serverengine-certbot
}

detect_runtimes() {
  has python3 || die "python3 is required; rerun with --install-system-deps"
  has node || die "Node.js is required; rerun with --install-system-deps"
  has npm || die "npm is required; rerun with --install-system-deps"
  PYTHON="$(command -v python3)"; NODE="$(command -v node)"
  local pyv nodev
  pyv="$($PYTHON -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  nodev="$(node --version | sed 's/^v//')"
  version_ge "$pyv" "3.10" || die "Python 3.10+ is required (found $pyv)"
  version_ge "$nodev" "20.19.0" || die "Node.js 20.19+ is required (found $nodev)"
  log "Runtime: Python $pyv / Node v$nodev / npm $(npm --version)"
}

check_existing_state() {
  if [ -e "$PREFIX/current" ] && [ "$YES" != true ]; then
    printf 'An existing Server Engine release was found at %s. Replace it? [yes/no] ' "$PREFIX/current"
    read -r answer
    [ "$answer" = yes ] || die "installation cancelled"
  fi
  if pgrep -f 'serverengine|uvicorn app.main:app' >/dev/null 2>&1 && [ "$YES" != true ]; then
    die "an existing Server Engine process is running; stop it or use -y"
  fi
}

create_release() {
  RELEASE_DIR="$PREFIX/releases/$RELEASE_ID"
  install -d -m 0755 "$RELEASE_DIR" "$PREFIX/releases" "$STATE_DIR" "$LOG_DIR" "$BACKUP_ROOT" "$WEB_ROOT"
  cp -a "$SOURCE_DIR/core" "$RELEASE_DIR/core"
  cp -a "$SOURCE_DIR/web" "$RELEASE_DIR/web"
  rm -rf "$RELEASE_DIR/web/node_modules" "$RELEASE_DIR/core/.venv"
  "$PYTHON" -m venv "$RELEASE_DIR/core/.venv"
  "$RELEASE_DIR/core/.venv/bin/python" -m pip install --upgrade pip
  "$RELEASE_DIR/core/.venv/bin/pip" install --no-cache-dir "$RELEASE_DIR/core"
  if [ ! -f "$RELEASE_DIR/web/dist/index.html" ]; then
    has npm || die "npm is required when installing from a source checkout"
    (cd "$RELEASE_DIR/web" && npm install --ignore-scripts && npm run build)
  fi
  # The installed panel serves the compiled frontend only. Do not ship React
  # source files, Vite configuration, or development dependencies in a release.
  rm -rf "$RELEASE_DIR/web/src" "$RELEASE_DIR/web/node_modules" "$RELEASE_DIR/web/package.json" "$RELEASE_DIR/web/package-lock.json" "$RELEASE_DIR/web/vite.config.js" "$RELEASE_DIR/web/Dockerfile" "$RELEASE_DIR/web/.dockerignore" "$RELEASE_DIR/web/index.html"
  [ -f "$RELEASE_DIR/web/dist/index.html" ] || die "production web build is missing"
  chmod -R u=rwX,go=rX "$RELEASE_DIR"
}

create_runtime_user() {
  if ! getent group "$RUN_GROUP" >/dev/null 2>&1; then groupadd --system "$RUN_GROUP"; fi
  if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    if has useradd; then useradd --system --gid "$RUN_GROUP" --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$RUN_USER"; else die "useradd is required"; fi
  fi
  install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$STATE_DIR" "$LOG_DIR"
  install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0755 "$WEB_ROOT"
}

write_runtime_files() {
cat > "$RELEASE_DIR/core/run.sh" <<EOF
#!/usr/bin/env bash
export SE_SERVICE_ROOT="$PREFIX/services"
export SE_WEB_ROOT="$WEB_ROOT"
export SE_STATE_DIR="$STATE_DIR"
exec "$RELEASE_DIR/core/.venv/bin/uvicorn" app.main:app --host "$API_HOST" --port "$API_PORT"
EOF
cat > "$RELEASE_DIR/web/run.sh" <<EOF
#!/usr/bin/env bash
export PORT="$WEB_PORT"
export API_URL="http://127.0.0.1:$API_PORT"
exec "$NODE" "$RELEASE_DIR/web/server.mjs"
EOF
  chmod 0755 "$RELEASE_DIR/core/run.sh" "$RELEASE_DIR/web/run.sh"
  install -d -m 0755 "$RELEASE_DIR/bin"
  cp "$SOURCE_DIR/bin/serverengine" "$RELEASE_DIR/bin/serverengine"
  chmod 0755 "$RELEASE_DIR/bin/serverengine"
  printf '%s\n' "$INSTALLER_VERSION" > "$RELEASE_DIR/VERSION"
  printf 'web_port=%s\napi_host=%s\napi_port=%s\nrelease=%s\n' "$WEB_PORT" "$API_HOST" "$API_PORT" "$RELEASE_ID" > "$STATE_DIR/config"
  chmod 0600 "$STATE_DIR/config"
}

activate_release() {
  if [ -L "$PREFIX/current" ]; then OLD_RELEASE="$(readlink -f "$PREFIX/current")"; fi
  if [ -n "$OLD_RELEASE" ] && [ -d "$OLD_RELEASE" ]; then cp -a "$OLD_RELEASE" "$BACKUP_ROOT/$RELEASE_ID-previous"; fi
  ln -sfn "$RELEASE_DIR" "$PREFIX/current"
  ln -sfn "$PREFIX/current/bin/serverengine" /usr/local/bin/serverengine
  ln -sfn "$PREFIX/current/bin/serverengine" /usr/local/bin/se
  chown -R "$RUN_USER:$RUN_GROUP" "$RELEASE_DIR" 2>/dev/null || true
}

configure_services() {
  [ "$NO_SERVICE" = true ] && return 0
  has systemctl || die "systemd is required unless --no-service is used"
  install -m 0644 "$SOURCE_DIR/deploy/server-engine-core.service" /etc/systemd/system/server-engine-core.service
  install -m 0644 "$SOURCE_DIR/deploy/server-engine-web.service" /etc/systemd/system/server-engine-web.service
  sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$PREFIX/current/core#; s#^ExecStart=.*#ExecStart=$PREFIX/current/core/run.sh#" /etc/systemd/system/server-engine-core.service
  sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$PREFIX/current/web#; s#^ExecStart=.*#ExecStart=$PREFIX/current/web/run.sh#" /etc/systemd/system/server-engine-web.service
  systemctl daemon-reload
  systemctl enable server-engine-core.service server-engine-web.service
  systemctl restart server-engine-core.service
  systemctl restart server-engine-web.service
}

verify_installation() {
  [ -f "$PREFIX/current/VERSION" ] || die "release activation failed"
  [ "$NO_SERVICE" = true ] && return 0
  sleep 2
  systemctl is-active --quiet server-engine-core.service || { systemctl status server-engine-core.service --no-pager; die "core service failed"; }
  systemctl is-active --quiet server-engine-web.service || { systemctl status server-engine-web.service --no-pager; die "web service failed"; }
  has curl && curl --fail --silent --show-error "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null || die "API health check failed"
  has curl && curl --fail --silent --show-error "http://127.0.0.1:$WEB_PORT/" >/dev/null || die "web health check failed"
}

primary_ip() {
  if has ip; then
    ip route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}'
  elif has hostname; then
    hostname -I 2>/dev/null | awk '{print $1}'
  fi
}

print_success() {
  local host_ip; host_ip="$(primary_ip)"; host_ip="${host_ip:-SERVER_IP}"
  echo
  echo "======================================================================"
  echo "                 SERVER ENGINE INSTALLED SUCCESSFULLY"
  echo "======================================================================"
  echo
  echo "  Control panel"
  echo "    Local:      http://127.0.0.1:$WEB_PORT"
  echo "    Network:    http://$host_ip:$WEB_PORT"
  echo
  echo "  Control-plane API"
  echo "    API docs:   http://127.0.0.1:$API_PORT/docs"
  echo "    Health:     http://127.0.0.1:$API_PORT/api/v1/health"
  echo "    Note:       API is bound to loopback for security."
  echo
  echo "  Installation"
  echo "    Release:    $PREFIX/current"
  echo "    State:      $STATE_DIR"
  echo "    Logs:       $LOG_FILE"
  echo "    Certbot:    $PREFIX/services/certbot/venv/bin/certbot"
  echo
  if [ "$NO_SERVICE" = true ]; then
    echo "  Services were not registered (--no-service)."
    echo "    Start API:  $PREFIX/current/core/run.sh"
    echo "    Start web:  $PREFIX/current/web/run.sh"
  else
    echo "  Services"
    echo "    Status:     systemctl status server-engine-core server-engine-web"
    echo "    Logs:       journalctl -u server-engine-core -u server-engine-web -f"
    echo "    Restart:    systemctl restart server-engine-core server-engine-web"
  fi
  echo
  echo "  Next step: open the control panel URL in your browser."
  echo "======================================================================"
}

main() {
  parse_args "$@"
  prepare_logging
  has flock || die "flock is required (usually provided by util-linux)"
  exec 9>"$LOCK_FILE"; flock -n 9 || die "another installer is running"
  check_host
  detect_package_manager
  if ! has_source_tree; then INSTALL_SYSTEM_DEPS="true"; fi
  install_system_dependencies
  download_release_bundle
  detect_runtimes
  check_existing_state
  create_release
  create_runtime_user
  install_certbot_runtime
  write_runtime_files
  activate_release
  configure_services
  verify_installation
  log "Server Engine installation completed successfully"
  print_success
  trap - EXIT
}

main "$@"
