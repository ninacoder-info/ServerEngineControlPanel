#!/usr/bin/env bash
set -Eeuo pipefail

while true; do
  cd /src
  chmod +x ./install.sh
  ./install.sh --no-service --yes --prefix /opt/server-engine-test \
    --state-dir /var/lib/server-engine-test --web-port 18888 \
    --api-host 0.0.0.0 --api-port 18000

  /opt/server-engine-test/current/core/run.sh &
  api_pid=$!
  /opt/server-engine-test/current/web/run.sh &
  web_pid=$!

  wait "$web_pid" || true
  kill "$api_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  sleep 1
done
