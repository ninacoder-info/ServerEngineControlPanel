#!/usr/bin/env bash
set -Eeuo pipefail

IFS=$'\n\t'
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=""
REPO="${SE_GITHUB_REPO:-}"
OUTPUT="${SE_RELEASE_OUTPUT:-$ROOT/server-engine-release.tar.gz}"
NOTES_FILE=""

cleanup() {
  [[ -z "$NOTES_FILE" ]] || rm -f "$NOTES_FILE"
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: ./scripts/publish-release.sh REPOSITORY

Build and publish a GitHub release. Requires the GitHub CLI (`gh`) and an
authenticated account with permission to create releases in the repository.

Examples:
  ./scripts/publish-release.sh ninacoder-info/ServerEngineControlPanel
  SE_GITHUB_REPO=ninacoder-info/ServerEngineControlPanel ./scripts/publish-release.sh

The version is selected automatically: the first release is 0.1.0, then the
patch number is incremented for each subsequent release.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 REPOSITORY" >&2
  exit 2
fi

if [[ -n "${1:-}" ]]; then
  REPO="$1"
fi

if ! command -v gh >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "GitHub CLI (gh) is not installed; installing it with Homebrew..."
    brew install gh
  else
    echo "GitHub CLI (gh) is required. Install it from https://cli.github.com/" >&2
    exit 1
  fi
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Starting GitHub login..."
  gh auth login
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to determine the release repository." >&2
  exit 1
fi

if [[ -z "$REPO" ]]; then
  REMOTE="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
  REMOTE="${REMOTE%.git}"
  if [[ "$REMOTE" =~ github\.com[:/]([^/]+/[^/]+)$ ]]; then
    REPO="${BASH_REMATCH[1]}"
  fi
fi

if [[ -z "$REPO" || "$REPO" == */ ]]; then
  echo "Could not determine a GitHub repository. Pass it as the first argument or set SE_GITHUB_REPO." >&2
  exit 1
fi

latest_version="0.0.0"
version_gt() {
  local left right
  local left_major left_minor left_patch right_major right_minor right_patch
  left="$1"
  right="$2"
  IFS=. read -r left_major left_minor left_patch <<< "$left"
  IFS=. read -r right_major right_minor right_patch <<< "$right"
  ((10#$left_major > 10#$right_major)) ||
    { ((10#$left_major == 10#$right_major && 10#$left_minor > 10#$right_minor)) ||
      ((10#$left_major == 10#$right_major && 10#$left_minor == 10#$right_minor && 10#$left_patch > 10#$right_patch)); }
}

while IFS= read -r tag; do
  if [[ "$tag" =~ ^v?([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    candidate="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
    if version_gt "$candidate" "$latest_version"; then
      latest_version="$candidate"
    fi
  fi
done < <(gh release list --repo "$REPO" --limit 100 --json tagName --jq '.[].tagName' 2>/dev/null || true)

if [[ "$latest_version" == "0.0.0" ]]; then
  VERSION="0.1.0"
else
  IFS=. read -r major minor patch <<< "$latest_version"
  VERSION="${major}.${minor}.$((patch + 1))"
fi

TAG="v${VERSION#v}"

echo "Building Server Engine release ${TAG}..."
"$ROOT/scripts/build-release.sh" "${VERSION#v}" "$OUTPUT"

# Keep GitHub's release page useful even before the tagged CHANGELOG.md can be
# fetched by the panel. Publish the matching section as the release notes.
NOTES_FILE="$(mktemp "${TMPDIR:-/tmp}/server-engine-release-notes.XXXXXX")"
awk -v version="${VERSION#v}" '
  $0 ~ "^##[[:space:]]+\\[?v?" version "\\]?[[:space:]]*$" { found = 1 }
  found && printed && $0 ~ /^##[[:space:]]+/ { exit }
  found { print; printed = 1 }
' "$ROOT/CHANGELOG.md" > "$NOTES_FILE"
if [[ ! -s "$NOTES_FILE" ]]; then
  printf 'Server Engine %s\n\nSee the repository changelog for this release.\n' "$TAG" > "$NOTES_FILE"
fi

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  echo "Release ${TAG} already exists; replacing its release notes and asset."
  gh release edit "$TAG" --repo "$REPO" --notes-file "$NOTES_FILE"
else
  echo "Creating GitHub release ${TAG} in ${REPO}..."
  gh release create "$TAG" \
    --repo "$REPO" \
    --title "Server Engine ${TAG}" \
    --notes-file "$NOTES_FILE"
fi

echo "Uploading ${OUTPUT}..."
gh release upload "$TAG" "$OUTPUT" --repo "$REPO" --clobber

echo "Published: https://github.com/${REPO}/releases/tag/${TAG}"
