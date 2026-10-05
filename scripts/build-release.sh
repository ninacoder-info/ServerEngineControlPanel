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
cp "$ROOT/CHANGELOG.md" "$WORK/server-engine-release/CHANGELOG.md"

BUILD_WEB="$WORK/web-build"
mkdir -p "$BUILD_WEB"
cp -a "$ROOT/web/index.html" "$ROOT/web/package.json" "$ROOT/web/package-lock.json" "$ROOT/web/server.mjs" "$ROOT/web/server.py" "$ROOT/web/vite.config.js" "$BUILD_WEB/"
cp -a "$ROOT/web/src" "$BUILD_WEB/src"
cp -a "$ROOT/web/public" "$BUILD_WEB/public"
(cd "$BUILD_WEB" && npm ci --ignore-scripts && npm run build)
cp -a "$BUILD_WEB/dist" "$WORK/server-engine-release/web/dist"
cp "$BUILD_WEB/server.py" "$WORK/server-engine-release/web/server.py"
# Keep the API-reported version aligned with the release metadata. The source
# tree remains unchanged; only the staged release copy is rewritten.
python3 - "$WORK/server-engine-release/core/app/version.py" "$VERSION" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
version = sys.argv[2]
content = path.read_text()
content, count = re.subn(r'^APP_VERSION\s*=\s*.*$', f'APP_VERSION = "{version}"', content, count=1, flags=re.MULTILINE)
if count != 1:
    raise SystemExit("APP_VERSION declaration was not found")
path.write_text(content)
PY
printf '%s\n' "$VERSION" > "$WORK/server-engine-release/VERSION"

tar -czf "$OUTPUT" -C "$WORK" server-engine-release
echo "Created $OUTPUT"
