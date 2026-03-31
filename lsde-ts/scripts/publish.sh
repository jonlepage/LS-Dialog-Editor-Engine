#!/usr/bin/env bash
set -euo pipefail

# ─── LSDE Publish Script ─────────────────────────────────────────────────────
# Bumps version, runs tests, builds, and publishes npm + NuGet packages.
#
# Usage:
#   ./scripts/publish.sh patch          # 0.1.0 → 0.1.1 (bug fix)
#   ./scripts/publish.sh minor          # 0.1.0 → 0.2.0 (new feature)
#   ./scripts/publish.sh major          # 0.1.0 → 1.0.0 (breaking change)
#   ./scripts/publish.sh npm patch      # npm only
#   ./scripts/publish.sh nuget minor    # nuget only
#
# API keys:
#   npm   : stored in ~/.npmrc (npm login)
#   nuget : NUGET_API_KEY env var, or stored in ~/.lsde-nuget-key

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -W 2>/dev/null || pwd)"
TS_DIR="$ROOT/lsde-ts"
CS_DIR="$ROOT/lsde-csharp/src/LsdeDialogEngine"
CSPROJ="$CS_DIR/LsdeDialogEngine.csproj"

TARGET="both"
BUMP=""

for arg in "$@"; do
  case "$arg" in
    npm)           TARGET="npm" ;;
    nuget)         TARGET="nuget" ;;
    patch|minor|major) BUMP="$arg" ;;
  esac
done

if [ -z "$BUMP" ]; then
  echo "Usage: ./scripts/publish.sh [npm|nuget] <patch|minor|major>"
  echo ""
  echo "  patch  — bug fix        (0.1.0 → 0.1.1)"
  echo "  minor  — new feature    (0.1.0 → 0.2.0)"
  echo "  major  — breaking change (0.1.0 → 1.0.0)"
  exit 1
fi

# ─── Resolve NuGet API key ───────────────────────────────────────────────────
resolve_nuget_key() {
  if [ -n "${NUGET_API_KEY:-}" ]; then
    return
  fi
  local keyfile="$HOME/.lsde-nuget-key"
  if [ -f "$keyfile" ]; then
    NUGET_API_KEY="$(cat "$keyfile")"
    export NUGET_API_KEY
  else
    echo "✗ NUGET_API_KEY not set and ~/.lsde-nuget-key not found"
    echo "  Save your key:  echo 'YOUR_KEY' > ~/.lsde-nuget-key"
    exit 1
  fi
}

# ─── Version bump ────────────────────────────────────────────────────────────
bump_version() {
  local current
  current=$(node -p "require('$TS_DIR/package.json').version")

  IFS='.' read -r major minor patch <<< "$current"

  case "$BUMP" in
    patch) patch=$((patch + 1)) ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    major) major=$((major + 1)); minor=0; patch=0 ;;
  esac

  NEW_VERSION="$major.$minor.$patch"
  echo "═══ Version: $current → $NEW_VERSION ($BUMP) ═══"
  echo ""
}

sync_versions() {
  # Update package.json
  cd "$TS_DIR"
  npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version > /dev/null

  # Update .csproj
  sed -i "s|<Version>.*</Version>|<Version>$NEW_VERSION</Version>|" "$CSPROJ"

  # Update CMakeLists.txt
  local CMAKE="$ROOT/lsde-cpp/CMakeLists.txt"
  sed -i "s|project(lsde-dialog-engine VERSION [0-9.]*|project(lsde-dialog-engine VERSION $NEW_VERSION|" "$CMAKE"

  echo "✓ Versions synced to $NEW_VERSION"
}

# ─── Changelog ───────────────────────────────────────────────────────────────
generate_changelog() {
  cd "$ROOT"
  local changelog="$ROOT/CHANGELOG.md"
  local date
  date=$(date +%Y-%m-%d)

  # Find last version tag
  local last_tag
  last_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

  # Collect commits since last tag (or all if no tag)
  local log_range=""
  if [ -n "$last_tag" ]; then
    log_range="$last_tag..HEAD"
  fi

  # Categorize commits
  local feats fixes docs others
  feats=$(git log $log_range --pretty=format:"%s" 2>/dev/null | grep -i "^feat" | sed 's/^feat[:(]//' | sed 's/^[)]*: */- /' || true)
  fixes=$(git log $log_range --pretty=format:"%s" 2>/dev/null | grep -i "^fix" | sed 's/^fix[:(]//' | sed 's/^[)]*: */- /' || true)
  docs=$(git log $log_range --pretty=format:"%s" 2>/dev/null | grep -i "^docs\|^doc" | sed 's/^docs\?[:(]//' | sed 's/^[)]*: */- /' || true)
  others=$(git log $log_range --pretty=format:"%s" 2>/dev/null | grep -iv "^feat\|^fix\|^docs\?\|^doc\|^merge\|^Co-Authored" | sed 's/^/- /' || true)

  # Build new entry
  local entry="## v$NEW_VERSION ($date)"$'\n'
  [ -n "$feats" ]  && entry+=$'\n'"### Features"$'\n'"$feats"$'\n'
  [ -n "$fixes" ]  && entry+=$'\n'"### Fixes"$'\n'"$fixes"$'\n'
  [ -n "$docs" ]   && entry+=$'\n'"### Docs"$'\n'"$docs"$'\n'
  [ -n "$others" ] && entry+=$'\n'"### Other"$'\n'"$others"$'\n'

  # Prepend to CHANGELOG.md
  if [ -f "$changelog" ]; then
    local existing
    existing=$(cat "$changelog")
    echo -e "# Changelog\n\n$entry\n${existing#*# Changelog}" > "$changelog"
  else
    echo -e "# Changelog\n\n$entry" > "$changelog"
  fi

  echo "✓ CHANGELOG.md updated"
}

# ─── Git tag ─────────────────────────────────────────────────────────────────
git_tag() {
  cd "$ROOT"
  git add CHANGELOG.md "$TS_DIR/package.json" "$CSPROJ" "$ROOT/lsde-cpp/CMakeLists.txt"
  git commit -m "release: v$NEW_VERSION"
  git tag "v$NEW_VERSION"
  echo "✓ Tagged v$NEW_VERSION"
}

# ─── npm ──────────────────────────────────────────────────────────────────────
publish_npm() {
  echo ""
  echo "═══ npm: @lsde/dialog-engine@$NEW_VERSION ═══"
  cd "$TS_DIR"

  echo "→ Tests..."
  npm test

  echo "→ Build..."
  npm run build

  echo "→ Publishing..."
  npm publish --access public
  echo "✓ Published to npm"
}

# ─── NuGet ────────────────────────────────────────────────────────────────────
publish_nuget() {
  echo ""
  echo "═══ NuGet: LsdeDialogEngine@$NEW_VERSION ═══"
  cd "$CS_DIR"

  resolve_nuget_key

  echo "→ Build + pack..."
  dotnet pack -c Release -o ./nupkg

  local NUPKG
  NUPKG=$(ls ./nupkg/LsdeDialogEngine.*.nupkg | head -1)

  echo "→ Pushing..."
  dotnet nuget push "$NUPKG" --api-key "$NUGET_API_KEY" --source https://api.nuget.org/v3/index.json --skip-duplicate
  echo "✓ Published to NuGet"

  rm -rf ./nupkg
}

# ─── Run ──────────────────────────────────────────────────────────────────────
bump_version
sync_versions
generate_changelog

[[ "$TARGET" == "both" || "$TARGET" == "npm" ]]   && publish_npm
[[ "$TARGET" == "both" || "$TARGET" == "nuget" ]] && publish_nuget

git_tag

echo ""
echo "══════════════════════════════════════"
echo "  ✓ Published v$NEW_VERSION"
echo "  ✓ CHANGELOG.md updated"
echo "  ✓ Tagged v$NEW_VERSION"
echo "══════════════════════════════════════"
