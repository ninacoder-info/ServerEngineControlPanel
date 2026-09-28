#!/usr/bin/env bash
set -Eeuo pipefail

IFS=$'\n\t'
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || echo 0.1.0)}"
OUTPUT="${2:-$ROOT/server-engine-release.tar.gz}"
WORK="$(mktemp -d /tmp/server-engine-build.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/server-engine-release/core" "$WORK/server-engine-release/web" "$WORK/server-engine-release/deploy" "$WORK/server-engine-release/bin"
cp -a "$ROOT/core/." "$WORK/server-engine-release/core/"
cp -a "$ROOT/deploy/." "$WORK/server-engine-release/deploy/"
cp "$ROOT/bin/serverengine" "$WORK/server-engine-release/bin/serverengine"

BUILD_WEB="$WORK/web-build"
mkdir -p "$BUILD_WEB"
cp -a "$ROOT/web/index.html" "$ROOT/web/package.json" "$ROOT/web/package-lock.json" "$ROOT/web/server.mjs" "$ROOT/web/vite.config.js" "$BUILD_WEB/"
cp -a "$ROOT/web/src" "$BUILD_WEB/src"
(cd "$BUILD_WEB" && npm ci --ignore-scripts && npm run build)
cp -a "$BUILD_WEB/dist" "$WORK/server-engine-release/web/dist"
printf '%s\n' "$VERSION" > "$WORK/server-engine-release/VERSION"

tar -czf "$OUTPUT" -C "$WORK" server-engine-release
echo "Created $OUTPUT"
