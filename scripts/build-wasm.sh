#!/bin/bash
# build-wasm.sh — Build WASM crates and copy artifacts to npm packages
#
# This script:
# 1. Builds each WASM crate with wasm-pack (generates .wasm + JS bindings)
# 2. Copies the generated files to the corresponding npm package wasm/ folder
# 3. Ensures the artifacts are ready for npm publishing

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATES_DIR="$PROJECT_ROOT/crates"
PACKAGES_DIR="$PROJECT_ROOT/packages/@djodjonx"

# Functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $*"
}

log_success() {
  echo -e "${GREEN}✓${NC} $*"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $*"
}

log_error() {
  echo -e "${RED}✗${NC} $*"
}

# Check if wasm-pack is installed
check_wasm_pack() {
  if ! command -v wasm-pack &> /dev/null; then
    log_error "wasm-pack is not installed"
    echo ""
    echo "Install it with:"
    echo "  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    echo ""
    echo "Or with cargo:"
    echo "  cargo install wasm-pack"
    exit 1
  fi

  local version
  version=$(wasm-pack --version | awk '{print $2}')
  log_success "wasm-pack $version found"
}

# Build a WASM crate with wasm-pack
build_wasm_crate() {
  local crate_dir="$1"
  local crate_name="$2"
  local target_package="$3"

  log_info "Building WASM crate: $crate_name"

  cd "$crate_dir"

  # Build with wasm-pack (bundler target for npm packages)
  wasm-pack build \
    --target bundler \
    --release \
    --out-dir pkg \
    --out-name "${crate_name}" \
    2>&1 | grep -v "warning: " || true

  if [ ! -d "pkg" ]; then
    log_error "Failed to build $crate_name - pkg/ directory not created"
    return 1
  fi

  log_success "Built $crate_name"

  # Copy artifacts to target npm package
  local wasm_dir="$PACKAGES_DIR/$target_package/wasm"

  log_info "Copying artifacts to $target_package/wasm/"

  # Create wasm directory if it doesn't exist
  mkdir -p "$wasm_dir"

  # Copy the generated files
  cp "pkg/${crate_name}.js" "$wasm_dir/" 2>/dev/null || cp "pkg/${crate_name}_bg.js" "$wasm_dir/" 2>/dev/null || true
  cp "pkg/${crate_name}_bg.wasm" "$wasm_dir/"
  cp "pkg/${crate_name}.d.ts" "$wasm_dir/" 2>/dev/null || true
  cp "pkg/${crate_name}_bg.wasm.d.ts" "$wasm_dir/" 2>/dev/null || true

  # Copy package.json if exists (for wasm-pack metadata)
  if [ -f "pkg/package.json" ]; then
    cp "pkg/package.json" "$wasm_dir/"
  fi

  # Remove .gitignore from wasm directory if it was copied or exists
  # wasm-pack generates a .gitignore with '*' which prevents npm from publishing the files
  if [ -f "$wasm_dir/.gitignore" ]; then
    rm "$wasm_dir/.gitignore"
  fi

  log_success "Artifacts copied to $wasm_dir"

  # List generated files
  echo "  Generated files:"
  ls -lh "$wasm_dir" | tail -n +2 | awk '{print "    - " $9 " (" $5 ")"}'

  cd "$PROJECT_ROOT"
}

# Main
main() {
  log_info "🚀 Building WASM artifacts for npm packages"
  echo ""

  # Check prerequisites
  check_wasm_pack
  echo ""

  # Build gwen-core → @djodjonx/engine-core/wasm/
  if [ -d "$CRATES_DIR/gwen-core" ]; then
    build_wasm_crate \
      "$CRATES_DIR/gwen-core" \
      "gwen_core" \
      "engine-core"
    echo ""
  else
    log_warn "Skipping gwen-core (not found)"
  fi

  # Build gwen-plugin-physics2d → @djodjonx/plugin-physics2d/wasm/
  if [ -d "$CRATES_DIR/gwen-plugin-physics2d" ]; then
    build_wasm_crate \
      "$CRATES_DIR/gwen-plugin-physics2d" \
      "gwen_physics2d" \
      "plugin-physics2d"
    echo ""
  else
    log_warn "Skipping gwen-plugin-physics2d (not found)"
  fi

  log_success "🎉 All WASM artifacts built successfully!"
  echo ""
  log_info "Next steps:"
  echo "  1. Run: pnpm build:ts"
  echo "  2. Test: pnpm test"
  echo "  3. Release: pnpm changeset && pnpm changeset:version && pnpm release"
}

main "$@"

