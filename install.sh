#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Allow the public one-line installer to be run by the default Ubuntu user.
# The installer still performs all privileged work as root, but users do not
# need to understand or manually add sudo to the command they copy.
if [ "$(id -u)" -ne 0 ]; then
  if ! command -v sudo >/dev/null 2>&1; then
    echo "Server Engine installation requires root privileges, but sudo is not installed." >&2
    exit 1
  fi
  exec sudo --preserve-env=SE_GITHUB_TOKEN bash "$0" "$@"
fi

# Server Engine native customer-server installer.
# Docker is deliberately not used here; docker-compose.yml is the test harness.

readonly INSTALLER_VERSION="0.1.0"
SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly DEFAULT_RELEASE_URL="https://github.com/ninacoder-info/ServerEngineControlPanel/releases/latest/download/server-engine-release.tar.gz"
RELEASE_URL="${SE_RELEASE_URL:-$DEFAULT_RELEASE_URL}"
GITHUB_TOKEN="${SE_GITHUB_TOKEN:-}"
ARTIFACT_DIR=""
ARTIFACT_ARCHIVE=""
PREFIX="/opt/server-engine"
STATE_DIR="/var/lib/server-engine"
LOG_DIR="/server-engine/logs"
WEB_PORT="2309"
API_PORT="2510"
API_HOST="127.0.0.1"
YES="false"
NO_SERVICE="false"
INSTALL_SYSTEM_DEPS="false"
RUN_USER="serverengine"
RUN_GROUP="serverengine"
WEB_ROOT="/server-engine/www"
CERTBOT_ROOT=""
LOCK_FILE="/run/lock/server-engine-install.lock"
LOG_FILE="/server-engine/logs/installer.log"
BACKUP_ROOT="/server-engine/backups"
ADMIN_CREDENTIALS_FILE=""
GITHUB_TOKEN_FILE=""
ADMIN_USER=""
ADMIN_PASSWORD=""
NEW_ADMIN_CREDENTIALS="false"
SERVICES_WERE_RUNNING="false"
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

usage() {
  cat <<'EOF'
Server Engine native installer

Usage: ./install.sh [options]

Options:
  --prefix PATH           Installation prefix (default: /opt/server-engine)
  --state-dir PATH        Persistent state directory (default: /var/lib/server-engine)
  --web-port PORT         Panel port (default: 2309)
  --api-port PORT         Loopback API port (default: 2510)
  --api-host HOST         API bind address (default: 127.0.0.1)
  --release-url URL       Prebuilt release bundle URL
  SE_GITHUB_TOKEN=TOKEN   Temporary token for a private GitHub release
  --install-system-deps  Install panel and provider build dependencies using apt/dnf/yum
  --no-service            Install and verify files without enabling systemd
  -y, --yes               Do not ask before replacing an existing release
  -h, --help              Show this help

This script installs the panel natively on a Linux customer server.
It does not install Docker, Nginx, Apache, PHP, or databases. It may prepare
a host firewall backend, but never enables, flushes, or applies firewall rules.
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
    if [ "$SERVICES_WERE_RUNNING" = true ] && has systemctl; then
      log "Update failed; attempting to restore the previously running Server Engine services"
      systemctl start server-engine-core.service server-engine-web.service 2>/dev/null || true
    fi
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
  log "Host: $OS_ID $OS_VERSION / $ARCH / ${mem_mb}MiB RAM"
}

detect_package_manager() {
  if has apt-get; then PM="apt"; elif has dnf; then PM="dnf"; elif has yum; then PM="yum"; else die "apt-get, dnf, or yum is required"; fi
  log "Package manager: $PM"
}

has_source_tree() {
  [ -f "$SOURCE_DIR/core/pyproject.toml" ] && [ -f "$SOURCE_DIR/web/dist/index.html" ]
}

download_release_bundle() {
  if has_source_tree; then return 0; fi
  has curl || has wget || die "curl or wget is required to download the Server Engine release bundle"
  ARTIFACT_DIR="$(mktemp -d /tmp/server-engine-release.XXXXXX)"
  ARTIFACT_ARCHIVE="$ARTIFACT_DIR/release.tar.gz"
  log "Downloading prebuilt Server Engine release from $RELEASE_URL"
  local github_auth=()
  local download_url="$RELEASE_URL"
  if [ -n "$GITHUB_TOKEN" ] && [[ "$RELEASE_URL" =~ ^https://github\.com/([^/]+)/([^/]+)/releases/latest/download/([^/?]+)$ ]]; then
    local release_owner="${BASH_REMATCH[1]}"
    local release_repo="${BASH_REMATCH[2]}"
    local release_asset="${BASH_REMATCH[3]}"
    local release_api="https://api.github.com/repos/${release_owner}/${release_repo}/releases/latest"
    log "Resolving private GitHub release asset through the authenticated API"
    download_url="$(curl --fail --location --silent --show-error \
      --header "Authorization: Bearer $GITHUB_TOKEN" \
      --header 'Accept: application/vnd.github+json' \
      "$release_api" | SE_RELEASE_ASSET="$release_asset" python3 -c 'import json, sys
import os
asset_name = os.environ["SE_RELEASE_ASSET"]
release = json.load(sys.stdin)
for asset in release.get("assets", []):
    if asset.get("name") == asset_name:
        print(asset.get("url", ""))
        break
else:
    raise SystemExit(f"release asset not found: {asset_name}")')" || die "unable to resolve the private GitHub release asset"
    [ -n "$download_url" ] || die "private GitHub release asset URL was empty"
  fi
  if [ -n "$GITHUB_TOKEN" ] && [[ "$RELEASE_URL" == https://github.com/* || "$RELEASE_URL" == https://api.github.com/* ]]; then
    github_auth=(--header "Authorization: Bearer $GITHUB_TOKEN" --header "Accept: application/octet-stream")
  fi
  if has curl; then
    curl --fail --location --silent --show-error --retry 3 "${github_auth[@]}" "$download_url" -o "$ARTIFACT_ARCHIVE" || die "unable to download the release bundle"
  else
    if [ "${#github_auth[@]}" -gt 0 ]; then
      wget --no-verbose --tries=3 --header="Authorization: Bearer $GITHUB_TOKEN" --header="Accept: application/octet-stream" -O "$ARTIFACT_ARCHIVE" "$download_url" || die "unable to download the release bundle"
    else
      wget --no-verbose --tries=3 -O "$ARTIFACT_ARCHIVE" "$download_url" || die "unable to download the release bundle"
    fi
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
    apt) disable_unsupported_server_engine_php_source; run env DEBIAN_FRONTEND=noninteractive apt-get update; run env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar gzip unzip git golang-go build-essential python3 python3-venv python3-pip libcap2-bin;;
    dnf|yum) run "$PM" install -y ca-certificates curl tar gzip unzip git golang gcc gcc-c++ make python3 python3-pip libcap;;
  esac
}

disable_unsupported_server_engine_php_source() {
  [ -r /etc/os-release ] || return 0
  # packages.sury.org does not publish an APT Release for Ubuntu 23.10
  # (mantic). This file is owned by Server Engine, so disable only this
  # stale entry and retain a backup; never modify the host's other sources.
  # shellcheck disable=SC1091
  . /etc/os-release
  if [ "${ID:-}" = ubuntu ] && { [ "${VERSION_CODENAME:-}" = mantic ] || [ "${VERSION_ID:-}" = 23.10 ]; }; then
    local source_file=/etc/apt/sources.list.d/server-engine-php.list
    if [ -f "$source_file" ] && grep -q 'packages\.sury\.org/php' "$source_file"; then
      cp -a "$source_file" "$source_file.backup"
      sed -i 's/^[[:space:]]*deb[[:space:]]/# disabled by Server Engine (unsupported Ubuntu release): deb /' "$source_file"
      log "Disabled the stale Server Engine PHP Sury source for unsupported Ubuntu 23.10 (backup: $source_file.backup)"
    fi
  fi
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
  # The control plane runs as serverengine and must be able to inspect and
  # execute this isolated runtime. Never touch the host Certbot installation
  # or any aaPanel-managed certificate files.
  chown -R "$RUN_USER:$RUN_GROUP" "$CERTBOT_ROOT"
  find "$CERTBOT_ROOT" -type d -exec chmod 0755 {} +
  find "$CERTBOT_ROOT" -type f -perm /111 -exec chmod 0755 {} +
  ln -sfn "$certbot_bin" /usr/local/bin/serverengine-certbot
}

firewall_backend_state() {
  local backend="unavailable"
  if has ufw && ufw status 2>/dev/null | grep -q '^Status: active'; then
    backend="ufw"
  elif has firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
    backend="firewalld"
  elif has nft && nft list ruleset 2>/dev/null | grep -qE '^[[:space:]]*(table|chain|set|map)[[:space:]]'; then
    backend="nftables"
  elif has iptables-save && iptables-save 2>/dev/null | grep -qE '^-A (INPUT|FORWARD|OUTPUT) '; then
    backend="iptables"
  elif has nft; then
    backend="nftables-available"
  elif has iptables || has iptables-save; then
    backend="iptables-available"
  fi
  printf '%s' "$backend"
}

prepare_firewall_backend() {
  local detected
  detected="$(firewall_backend_state)"
  if [ "$detected" != "unavailable" ]; then
    log "Firewall backend detected: $detected; no firewall package or rules will be changed"
    printf '%s\n' "$detected" > "$STATE_DIR/firewall-backend"
    chown "$RUN_USER:$RUN_GROUP" "$STATE_DIR/firewall-backend"
    chmod 0640 "$STATE_DIR/firewall-backend"
    return 0
  fi

  log "No firewall backend detected; preparing nftables for Firewall controls"
  local install_ok="false"
  case "$PM" in
    apt)
      if DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nftables; then
        install_ok="true"
      else
        log "nftables package install failed; refreshing package metadata and retrying"
        if DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends nftables; then
          install_ok="true"
        fi
      fi
      ;;
    dnf|yum)
      if "$PM" install -y nftables; then install_ok="true"; fi
      ;;
    *)
      log "No supported package manager is available for automatic nftables preparation"
      ;;
  esac

  if [ "$install_ok" = true ]; then
    detected="$(firewall_backend_state)"
    [ "$detected" = "unavailable" ] && detected="nftables-available"
    log "Firewall backend prepared: $detected (rules remain unchanged)"
  else
    detected="unavailable"
    log "WARNING: unable to prepare nftables; Server Engine installation will continue without host firewall support"
  fi
  printf '%s\n' "$detected" > "$STATE_DIR/firewall-backend"
  chown "$RUN_USER:$RUN_GROUP" "$STATE_DIR/firewall-backend"
  chmod 0640 "$STATE_DIR/firewall-backend"
}

detect_runtimes() {
  has python3 || die "python3 is required; rerun with --install-system-deps"
  PYTHON="$(command -v python3)"
  local pyv
  pyv="$($PYTHON -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
  version_ge "$pyv" "3.10" || die "Python 3.10+ is required (found $pyv)"
  log "Runtime: Python $pyv"
  log "Runtime: Python web proxy and static panel runtime"
}

check_existing_state() {
  if [ -e "$PREFIX/current" ] && [ "$YES" != true ]; then
    printf 'An existing Server Engine release was found at %s. Replace it? [yes/no] ' "$PREFIX/current"
    read -r answer
    [ "$answer" = yes ] || die "installation cancelled"
  fi
}

server_engine_processes_running() {
  pgrep -f "$PREFIX/(current|releases)/.*(uvicorn|serverengine)|server-engine-(core|web)" >/dev/null 2>&1
}

stop_existing_server_engine() {
  local services_running="false"
  local processes_running="false"

  if has systemctl; then
    systemctl is-active --quiet server-engine-core.service 2>/dev/null && services_running="true"
    systemctl is-active --quiet server-engine-web.service 2>/dev/null && services_running="true"
  fi
  server_engine_processes_running && processes_running="true"
  if [ "$services_running" = true ] || [ "$processes_running" = true ]; then
    SERVICES_WERE_RUNNING="true"
  fi

  if [ "$services_running" != true ] && [ "$processes_running" != true ]; then
    return 0
  fi

  log "An existing Server Engine installation is running."
  log "The update will stop Server Engine core and web processes before replacing the release."
  log "Server Engine data, websites, backups, and service files will be preserved."
  if [ "$YES" != true ]; then
    printf 'Stop Server Engine services and continue with this update? [yes/no] '
    local answer
    read -r answer
    [ "$answer" = yes ] || die "installation cancelled; running services were not changed"
  else
    log "--yes supplied; stopping the existing Server Engine services automatically"
  fi

  if has systemctl; then
    # Managed services are child processes of the control plane but must not
    # be killed when only the panel is being replaced. Apply this runtime
    # setting before stopping an older installation whose unit may still use
    # systemd's default KillMode=control-group.
    if systemctl is-active --quiet server-engine-core.service 2>/dev/null; then
      systemctl set-property --runtime server-engine-core.service KillMode=process 2>/dev/null || true
      log "Configured the running core unit to preserve managed service processes"
    fi
    systemctl stop server-engine-web.service server-engine-core.service 2>/dev/null || true
  fi
  if server_engine_processes_running; then
    pkill -TERM -f "$PREFIX/(current|releases)/.*(uvicorn|serverengine)|server-engine-(core|web)" 2>/dev/null || true
    for _ in $(seq 1 20); do
      server_engine_processes_running || break
      sleep 0.25
    done
  fi
  server_engine_processes_running && die "existing Server Engine processes did not stop safely"
  log "Existing Server Engine services stopped; continuing with update"
}

check_requested_ports() {
  port_is_free "$WEB_PORT" || die "web port $WEB_PORT is still in use by another process"
  port_is_free "$API_PORT" || die "API port $API_PORT is still in use by another process"
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
    die "release bundle does not contain a production web build; install a prebuilt release bundle"
  fi
  # The installed panel serves the compiled frontend only. Do not ship React
  # source files, Vite configuration, or development dependencies in a release.
  rm -rf "$RELEASE_DIR/web/src" "$RELEASE_DIR/web/node_modules" "$RELEASE_DIR/web/package.json" "$RELEASE_DIR/web/package-lock.json" "$RELEASE_DIR/web/vite.config.js" "$RELEASE_DIR/web/server.mjs" "$RELEASE_DIR/web/Dockerfile" "$RELEASE_DIR/web/.dockerignore" "$RELEASE_DIR/web/index.html"
  [ -f "$RELEASE_DIR/web/dist/index.html" ] || die "production web build is missing"
  chmod -R u=rwX,go=rX "$RELEASE_DIR"
}

create_runtime_user() {
  if ! getent group "$RUN_GROUP" >/dev/null 2>&1; then groupadd --system "$RUN_GROUP"; fi
  if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    if has useradd; then useradd --system --gid "$RUN_GROUP" --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$RUN_USER"; else die "useradd is required"; fi
  fi
  # Service installers run as serverengine and create isolated service roots
  # below this directory.  Older releases left the parent root-owned, which
  # made the first install of a new service fail with EACCES.  Change only
  # the parent ownership here; existing service files keep their ownership.
  install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0755 "$PREFIX/services"
  chown "$RUN_USER:$RUN_GROUP" "$PREFIX/services" 2>/dev/null || true
  # Control-plane state is private to the root-owned core. The web process
  # runs as serverengine and reaches the core only through its API, so it must
  # never read the SQLite database, admin credentials, or GitHub token.
  install -d -o root -g root -m 0700 "$STATE_DIR"
  install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0750 "$LOG_DIR" "$BACKUP_ROOT"
  if [ -e "$STATE_DIR/control.db" ]; then
    chown root:root "$STATE_DIR/control.db" 2>/dev/null || true
    chmod 0600 "$STATE_DIR/control.db" 2>/dev/null || true
  fi
  GITHUB_TOKEN_FILE="$STATE_DIR/github-token"
  if [ -n "$GITHUB_TOKEN" ]; then
    umask 077
    printf '%s\n' "$GITHUB_TOKEN" > "$GITHUB_TOKEN_FILE"
    chown root:root "$GITHUB_TOKEN_FILE"
    chmod 0600 "$GITHUB_TOKEN_FILE"
  elif [ -f "$GITHUB_TOKEN_FILE" ]; then
    chown root:root "$GITHUB_TOKEN_FILE" 2>/dev/null || true
    chmod 0600 "$GITHUB_TOKEN_FILE"
  fi
  # Migrate data created by older releases without deleting the old location.
  if [ -d /var/lib/server-engine/backups ] && [ "$BACKUP_ROOT" != "/var/lib/server-engine/backups" ]; then
    cp -a /var/lib/server-engine/backups/. "$BACKUP_ROOT/" 2>/dev/null || true
  fi
  if [ -d /var/log/server-engine ] && [ "$LOG_DIR" != "/var/log/server-engine" ]; then
    cp -a /var/log/server-engine/. "$LOG_DIR/" 2>/dev/null || true
  fi
  chown -R "$RUN_USER:$RUN_GROUP" "$BACKUP_ROOT" 2>/dev/null || true
  chown -R "$RUN_USER:$RUN_GROUP" "$LOG_DIR" 2>/dev/null || true
  [ ! -e "$STATE_DIR/control.db" ] || { chown root:root "$STATE_DIR/control.db" 2>/dev/null || true; chmod 0600 "$STATE_DIR/control.db" 2>/dev/null || true; }
  [ ! -e "$STATE_DIR/admin-credentials" ] || { chown root:root "$STATE_DIR/admin-credentials" 2>/dev/null || true; chmod 0600 "$STATE_DIR/admin-credentials" 2>/dev/null || true; }
  # All control-plane registries are private root-owned state.  Normalize
  # legacy files created by releases that ran the core as serverengine; do
  # not remove them because they contain the user's website/domain inventory.
  for state_file in \
    control.db backups.json backup-config.json websites.json domains.json \
    ftp.json node-projects.json proxy-routes.json cloudflare.json \
    admin-credentials github-token config; do
    if [ -e "$STATE_DIR/$state_file" ]; then
      chown root:root "$STATE_DIR/$state_file" 2>/dev/null || true
      chmod 0600 "$STATE_DIR/$state_file" 2>/dev/null || true
    fi
  done
  install -d -o "$RUN_USER" -g "$RUN_GROUP" -m 0755 "$WEB_ROOT"
}

configure_panel_updater() {
  local helper="/usr/local/sbin/server-engine-update"
  local worker="/usr/local/sbin/server-engine-update-worker"
  install -d -m 0755 /usr/local/sbin /etc/sudoers.d
  # The worker must run outside server-engine-core.service. Otherwise the
  # installer stops the core unit and systemd kills the updater in the same
  # cgroup before it can install and restart the replacement.
  cat > "$worker" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
readonly INSTALLER_URL="https://secp.ninacoder.top/install.sh"
readonly TOKEN_FILE="$STATE_DIR/github-token"
readonly LOG_FILE="$LOG_DIR/panel-update.log"
script_file="\$(mktemp /tmp/server-engine-update.XXXXXX.sh)"
cleanup() { rm -f "\$script_file"; }
trap cleanup EXIT
mkdir -p "\$(dirname "\$LOG_FILE")"
exec >>"\$LOG_FILE" 2>&1
echo "[\$(date -u +%Y-%m-%dT%H:%M:%SZ)] Panel update started"
if [ -s "\$TOKEN_FILE" ]; then
  export SE_GITHUB_TOKEN="\$(cat "\$TOKEN_FILE")"
fi
/usr/bin/curl --fail --location --silent --show-error "\$INSTALLER_URL" -o "\$script_file"
/bin/bash "\$script_file" --yes
echo "[\$(date -u +%Y-%m-%dT%H:%M:%SZ)] Panel update completed"
EOF
  chmod 0750 "$worker"
  chown root:root "$worker"
  cat > "$helper" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
exec /usr/bin/systemd-run --unit=server-engine-panel-update --collect --no-block --service-type=oneshot "$worker"
EOF
  chmod 0750 "$helper"
  chown root:root "$helper"
  cat > /etc/sudoers.d/server-engine-update <<EOF
$RUN_USER ALL=(root) NOPASSWD: $helper
EOF
  chmod 0440 /etc/sudoers.d/server-engine-update
  if has visudo; then visudo -cf /etc/sudoers.d/server-engine-update >/dev/null || die "invalid Server Engine updater sudo policy"; fi
}

configure_powerdns_capability_helper() {
  local helper="/usr/local/sbin/server-engine-powerdns-bind-cap"
  install -d -m 0755 /usr/local/sbin /etc/sudoers.d
  cat > "$helper" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
readonly ROOT="$PREFIX/services/powerdns"
readonly SETCAP="$(command -v setcap || true)"
if [ -z "\$SETCAP" ]; then
  echo "setcap is required to bind isolated PowerDNS to port 53" >&2
  exit 1
fi
binary=""
for candidate in "\$ROOT/usr/sbin/pdns_server" "\$ROOT/sbin/pdns_server" "\$ROOT/bin/pdns_server"; do
  if [ -x "\$candidate" ]; then binary="\$candidate"; break; fi
done
if [ -z "\$binary" ]; then
  echo "managed PowerDNS binary was not found" >&2
  exit 1
fi
exec "\$SETCAP" cap_net_bind_service=+ep "\$binary"
EOF
  chmod 0750 "$helper"
  chown root:root "$helper"
  cat > /etc/sudoers.d/server-engine-powerdns <<EOF
$RUN_USER ALL=(root) NOPASSWD: $helper
EOF
  chmod 0440 /etc/sudoers.d/server-engine-powerdns
  if has visudo; then visudo -cf /etc/sudoers.d/server-engine-powerdns >/dev/null || die "invalid Server Engine PowerDNS sudo policy"; fi
}

configure_source_build_helper() {
  local helper="/usr/local/sbin/server-engine-prepare-build-deps"
  install -d -m 0755 /usr/local/sbin /etc/sudoers.d
  cat > "$helper" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

service_id="${1:-}"
case "$service_id" in
  php)
    packages=(build-essential cmake pkg-config libssl-dev zlib1g-dev autoconf bison re2c libxml2-dev libcurl4-openssl-dev libsqlite3-dev libonig-dev libzip-dev libreadline-dev libxslt1-dev libjpeg-dev libpng-dev libwebp-dev libfreetype6-dev libicu-dev libpq-dev)
    ;;
  apache)
    packages=(build-essential cmake pkg-config libssl-dev zlib1g-dev autoconf automake libtool libexpat1-dev libnghttp2-dev libpcre3-dev libpcre2-dev libcurl4-openssl-dev libxml2-dev libyajl-dev liblua5.1-0-dev perl git)
    ;;
  python)
    packages=(build-essential cmake pkg-config libssl-dev zlib1g-dev libbz2-dev libffi-dev liblzma-dev libncurses-dev libreadline-dev libsqlite3-dev libgdbm-dev libnss3-dev libuuid1 uuid-dev tk-dev)
    ;;
  *)
    echo "Unsupported source-build dependency request: $service_id" >&2
    exit 2
    ;;
esac

/usr/bin/apt-get update
/usr/bin/apt-get install -y "${packages[@]}"
EOF
  chmod 0750 "$helper"
  chown root:root "$helper"
  cat > /etc/sudoers.d/server-engine-build-deps <<EOF
$RUN_USER ALL=(root) NOPASSWD: $helper
EOF
  chmod 0440 /etc/sudoers.d/server-engine-build-deps
  if has visudo; then visudo -cf /etc/sudoers.d/server-engine-build-deps >/dev/null || die "invalid Server Engine build dependency sudo policy"; fi
}

prepare_admin_credentials() {
  ADMIN_CREDENTIALS_FILE="$STATE_DIR/admin-credentials"
  if [ -s "$ADMIN_CREDENTIALS_FILE" ]; then
    ADMIN_USER="$(awk -F= '$1 == "username" {print substr($0, index($0, "=") + 1)}' "$ADMIN_CREDENTIALS_FILE")"
    ADMIN_PASSWORD="$(awk -F= '$1 == "password" {print substr($0, index($0, "=") + 1)}' "$ADMIN_CREDENTIALS_FILE")"
    [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASSWORD" ] || die "admin credentials file is incomplete: $ADMIN_CREDENTIALS_FILE"
    return 0
  fi

  # Never replace credentials for an existing control database. Existing
  # accounts remain managed by SQLite and must not be reset during upgrades.
  if [ -s "$STATE_DIR/control.db" ]; then
    log "Existing control database found; preserving its administrator credentials"
    return 0
  fi

  ADMIN_USER="se_admin_$($PYTHON -c 'import secrets; print(secrets.token_hex(4))')"
  ADMIN_PASSWORD="$($PYTHON -c 'import secrets; print(secrets.token_urlsafe(32))')"
  umask 077
  printf 'username=%s\npassword=%s\n' "$ADMIN_USER" "$ADMIN_PASSWORD" > "$ADMIN_CREDENTIALS_FILE"
  chown root:root "$ADMIN_CREDENTIALS_FILE"
  chmod 0600 "$ADMIN_CREDENTIALS_FILE"
  NEW_ADMIN_CREDENTIALS="true"
  log "Generated a random administrator account for the new installation"
}

write_runtime_files() {
cat > "$RELEASE_DIR/core/run.sh" <<EOF
#!/usr/bin/env bash
export SE_SERVICE_ROOT="$PREFIX/services"
export SE_WEB_ROOT="$WEB_ROOT"
export SE_STATE_DIR="$STATE_DIR"
export SE_LOG_ROOT="$LOG_DIR"
export SE_BACKUP_ROOT="$BACKUP_ROOT"
export SE_WEB_DIST="$RELEASE_DIR/web/dist"
if [ -s "$STATE_DIR/github-token" ]; then
  export SE_GITHUB_TOKEN="$(cat "$STATE_DIR/github-token")"
fi
if [ -s "$STATE_DIR/admin-credentials" ]; then
  export SE_ADMIN_USER="\$(awk -F= '\$1 == "username" {print substr(\$0, index(\$0, "=") + 1)}' "$STATE_DIR/admin-credentials")"
  export SE_ADMIN_PASSWORD="\$(awk -F= '\$1 == "password" {print substr(\$0, index(\$0, "=") + 1)}' "$STATE_DIR/admin-credentials")"
  export SE_BOOTSTRAP_CREDENTIALS_FILE="$STATE_DIR/admin-credentials"
fi
exec "$RELEASE_DIR/core/.venv/bin/uvicorn" app.main:app --host "$API_HOST" --port "$API_PORT"
EOF
  chmod 0755 "$RELEASE_DIR/core/run.sh"
cat > "$RELEASE_DIR/web/run.sh" <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
export PORT="$WEB_PORT"
export API_URL="http://127.0.0.1:$API_PORT"
export SE_WEB_DIST="$PREFIX/current/web/dist"
exec "$RELEASE_DIR/core/.venv/bin/uvicorn" server:app --app-dir "$PREFIX/current/web" --host 0.0.0.0 --port "$WEB_PORT"
EOF
  chmod 0755 "$RELEASE_DIR/web/run.sh"
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
  sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$PREFIX/current/core#; s#^ExecStart=.*#ExecStart=$PREFIX/current/core/run.sh#" /etc/systemd/system/server-engine-core.service
  install -m 0644 "$SOURCE_DIR/deploy/server-engine-web.service" /etc/systemd/system/server-engine-web.service
  sed -i "s#^WorkingDirectory=.*#WorkingDirectory=$PREFIX/current/web#; s#^ExecStart=.*#ExecStart=$PREFIX/current/web/run.sh#" /etc/systemd/system/server-engine-web.service
  systemctl daemon-reload
  systemctl enable server-engine-core.service
  systemctl enable server-engine-web.service
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
  has curl && curl --fail --silent --show-error "http://127.0.0.1:$API_PORT/" >/dev/null || die "web health check failed"
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
    echo "    Start:      $PREFIX/current/core/run.sh"
  else
    echo "  Services"
    echo "    Status:     systemctl status server-engine-core"
    echo "    Logs:       journalctl -u server-engine-core -f"
    echo "    Restart:    systemctl restart server-engine-core"
  fi
  if [ "$NEW_ADMIN_CREDENTIALS" = true ]; then
    echo
    echo "  Initial administrator credentials"
    echo "    Username: $ADMIN_USER"
    echo "    Password: $ADMIN_PASSWORD"
    echo "    Save these credentials now; the password is not shown again."
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
  check_existing_state
  stop_existing_server_engine
  check_requested_ports
  detect_package_manager
  if ! has_source_tree; then INSTALL_SYSTEM_DEPS="true"; fi
  install_system_dependencies
  download_release_bundle
  detect_runtimes
  create_release
  create_runtime_user
  configure_panel_updater
  configure_powerdns_capability_helper
  configure_source_build_helper
  prepare_admin_credentials
  prepare_firewall_backend
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
