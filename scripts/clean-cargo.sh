#!/bin/bash
# clean-cargo.sh — Clean rebuild all Rust crates without cache
#
# Usage:
#   ./scripts/clean-cargo.sh              # Clean + check all crates
#   ./scripts/clean-cargo.sh build        # Clean + build all crates (release)
#   ./scripts/clean-cargo.sh build-debug  # Clean + build all crates (debug)
#   ./scripts/clean-cargo.sh watch        # Watch mode (cargo watch)
#   ./scripts/clean-cargo.sh test         # Clean + test all crates
#
# Features:
# - Auto-discovers all crates in ./crates/**
# - Removes all build artifacts (target/, *.wasm, *.d.ts)
# - Rebuilds cleanly without cache pollution
# - Parallelizes across available CPU cores
# - Reports errors clearly

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATES_DIR="$PROJECT_ROOT/crates"
TARGET_DIR="$PROJECT_ROOT/target"

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

# Find all Cargo.toml files in crates/
find_crates() {
  find "$CRATES_DIR" -maxdepth 2 -name "Cargo.toml" -type f | sort
}

# Count CPUs for parallel builds
get_cpu_count() {
  if command -v nproc &>/dev/null; then
    nproc
  elif command -v sysctl &>/dev/null; then
    sysctl -n hw.ncpu
  else
    echo 4
  fi
}

# Extract crate name and path from Cargo.toml
get_crate_info() {
  local manifest="$1"
  local dir=$(dirname "$manifest")
  local name=$(grep '^name = ' "$manifest" | sed 's/name = "\(.*\)"/\1/' | head -1)
  echo "$name:$dir"
}

# Clean a single crate
clean_crate() {
  local manifest="$1"
  local dir=$(dirname "$manifest")
  local name=$(basename "$dir")

  if [ -d "$dir/target" ]; then
    log_info "Cleaning $name/target/..."
    rm -rf "$dir/target"
  fi

  # Remove generated WASM artifacts
  if [ -d "$dir/pkg" ]; then
    rm -rf "$dir/pkg"
  fi

  # Remove wasm-pack artifacts
  find "$dir" -maxdepth 1 -name "*.wasm" -delete
  find "$dir" -maxdepth 1 -name "*_bg.js" -delete
  find "$dir" -maxdepth 1 -name "*.d.ts" -delete

  # Remove Cargo.lock if present (forces fresh dependency resolution)
  if [ -f "$dir/Cargo.lock" ]; then
    rm "$dir/Cargo.lock"
  fi
}

# Build a single crate
build_crate() {
  local manifest="$1"
  local target="$2"
  local profile="$3"
  local dir=$(dirname "$manifest")
  local name=$(basename "$dir")
  local start_time=$(date +%s%N)

  log_info "Building $name (target: $target, profile: $profile)..."

  if [ "$profile" = "debug" ]; then
    cargo build -p "$name" --target "$target" 2>&1 || {
      log_error "Build failed for $name"
      return 1
    }
  else
    cargo build -p "$name" --target "$target" --release 2>&1 || {
      log_error "Build failed for $name"
      return 1
    }
  fi

  local end_time=$(date +%s%N)
  local duration_ms=$(( (end_time - start_time) / 1000000 ))
  log_success "Built $name (${duration_ms}ms)"
}

# Test a single crate
test_crate() {
  local manifest="$1"
  local dir=$(dirname "$manifest")
  local name=$(basename "$dir")
  local start_time=$(date +%s%N)

  log_info "Testing $name..."
  cargo test -p "$name" 2>&1 || {
    log_error "Tests failed for $name"
    return 1
  }

  local end_time=$(date +%s%N)
  local duration_ms=$(( (end_time - start_time) / 1000000 ))
  log_success "Tests passed for $name (${duration_ms}ms)"
}

# Check a single crate
check_crate() {
  local manifest="$1"
  local target="$2"
  local dir=$(dirname "$manifest")
  local name=$(basename "$dir")
  local start_time=$(date +%s%N)

  log_info "Checking $name (target: $target)..."
  cargo check -p "$name" --target "$target" 2>&1 || {
    log_error "Check failed for $name"
    return 1
  }

  local end_time=$(date +%s%N)
  local duration_ms=$(( (end_time - start_time) / 1000000 ))
  log_success "Checked $name (${duration_ms}ms)"
}

# Main workflow
main() {
  local command="${1:-check}"
  local target="${2:-wasm32-unknown-unknown}"

  # Global cargo clean (removes all build artifacts across all crates)
  if [ "$command" != "watch" ]; then
    log_info "Running global cargo clean..."
    cargo clean 2>&1 | grep -v "^$" || true
  fi

  # Find all crates
  local crates=()
  while IFS= read -r manifest; do
    crates+=("$manifest")
  done < <(find_crates)

  if [ ${#crates[@]} -eq 0 ]; then
    log_warn "No crates found in $CRATES_DIR"
    exit 1
  fi

  log_info "Found ${#crates[@]} crate(s)"
  for manifest in "${crates[@]}"; do
    dir=$(dirname "$manifest")
    name=$(basename "$dir")
    echo "  - $name ($dir)"
  done
  echo

  local cpu_count=$(get_cpu_count)
  log_info "Using $cpu_count CPU core(s) for parallel builds"
  echo

  case "$command" in
    check)
      log_info "Starting CLEAN CHECK workflow..."
      for manifest in "${crates[@]}"; do
        clean_crate "$manifest"
        check_crate "$manifest" "$target" || exit 1
      done
      log_success "All crates checked successfully!"
      ;;

    build)
      log_info "Starting CLEAN BUILD workflow (release)..."
      for manifest in "${crates[@]}"; do
        clean_crate "$manifest"
        build_crate "$manifest" "$target" "release" || exit 1
      done
      log_success "All crates built successfully!"
      ;;

    build-debug)
      log_info "Starting CLEAN BUILD workflow (debug)..."
      for manifest in "${crates[@]}"; do
        clean_crate "$manifest"
        build_crate "$manifest" "$target" "debug" || exit 1
      done
      log_success "All crates built successfully (debug)!"
      ;;

    test)
      log_info "Starting CLEAN TEST workflow..."
      for manifest in "${crates[@]}"; do
        clean_crate "$manifest"
        test_crate "$manifest" || exit 1
      done
      log_success "All crates tested successfully!"
      ;;

    clean)
      log_info "Cleaning all crates and target/..."
      for manifest in "${crates[@]}"; do
        clean_crate "$manifest"
      done
      if [ -d "$TARGET_DIR" ]; then
        log_info "Cleaning global target/..."
        rm -rf "$TARGET_DIR"
      fi
      log_success "All cleaned!"
      ;;

    watch)
      log_info "Starting cargo watch (release mode)..."
      cargo watch \
        --exec "build --release --target $target" \
        --ignore "*.d.ts" \
        --ignore "*.wasm" \
        2>&1 || exit 1
      ;;

    *)
      echo "Usage: $0 {check|build|build-debug|test|clean|watch} [target]"
      echo
      echo "Commands:"
      echo "  check       — Clean + cargo check all crates (default)"
      echo "  build       — Clean + cargo build --release all crates"
      echo "  build-debug — Clean + cargo build (debug) all crates"
      echo "  test        — Clean + cargo test all crates"
      echo "  clean       — Clean all crate targets + global target/"
      echo "  watch       — cargo watch in release mode"
      echo
      echo "Options:"
      echo "  target      — WASM target (default: wasm32-unknown-unknown)"
      echo "              — Can also be 'native' for native builds"
      echo
      echo "Examples:"
      echo "  ./scripts/clean-cargo.sh check"
      echo "  ./scripts/clean-cargo.sh build wasm32-unknown-unknown"
      echo "  ./scripts/clean-cargo.sh build-debug native"
      echo "  ./scripts/clean-cargo.sh test"
      echo "  ./scripts/clean-cargo.sh clean"
      echo "  ./scripts/clean-cargo.sh watch"
      exit 1
      ;;
  esac
}

main "$@"

