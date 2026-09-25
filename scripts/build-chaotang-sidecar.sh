#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BACKEND_DIR=$(CDPATH= cd -- "$PROJECT_DIR/../chaotang-os/backend" && pwd)
OUTPUT_DIR="$PROJECT_DIR/crates/tauri-app/resources/chaotang-backend"

cd "$BACKEND_DIR"
BUILD_ROOT=$(mktemp -d "$PROJECT_DIR/../chaotang-sidecar-build.XXXXXXXX")
.venv/bin/python -m PyInstaller \
  --distpath "$BUILD_ROOT/dist" \
  --workpath "$BUILD_ROOT/work" \
  --specpath "$BUILD_ROOT" \
  --noconfirm \
  --clean \
  --name chaotang-backend \
  --collect-submodules app \
  --copy-metadata chaotang-os-backend \
  --add-data "$BACKEND_DIR/config:config" \
  --add-data "$BACKEND_DIR/app/agents/chancellor_draft/instructions.md:app/agents/chancellor_draft" \
  --add-data "$BACKEND_DIR/app/agents/runtime_skills/capability_family_bindings.json:app/agents/runtime_skills" \
  --add-data "$BACKEND_DIR/app/agents/runtime_skills/roles/bureaus/knowledge:app/agents/runtime_skills/roles/bureaus/knowledge" \
  sidecar_main.py

# A release must never seed the developer's local accounts or domain databases.
# Fail before replacing the previous resources if packaging collected private data.
if find "$BUILD_ROOT/dist/chaotang-backend" \( -name '*.sqlite3' -o -name '*.sqlite' -o -name '*.db' -o -name '.env' -o -name '.env.*' -o -name '*.p12' -o -name '*.pfx' -o -name '*private*.pem' \) -print | grep -q .; then
  echo 'Release blocked: private data found in sidecar output.' >&2
  exit 1
fi
mkdir -p "$(dirname "$OUTPUT_DIR")"
if [ -e "$OUTPUT_DIR" ]; then
  BACKUP_DIR=$(mktemp -d "$PROJECT_DIR/../chaotang-sidecar-backup.XXXXXXXX")
  mv "$OUTPUT_DIR" "$BACKUP_DIR/chaotang-backend"
  echo "Previous resources preserved at $BACKUP_DIR"
fi
cp -R "$BUILD_ROOT/dist/chaotang-backend" "$OUTPUT_DIR"

echo "Sidecar prepared at $OUTPUT_DIR"
