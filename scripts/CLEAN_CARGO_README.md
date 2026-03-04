# Clean Cargo Build Script

A smart Bash script for clean rebuilding all Rust crates in the GWEN project without cache pollution.

## Features

✅ **Auto-discovery** — Finds all `Cargo.toml` in `crates/**` automatically
✅ **Clean builds** — Removes all artifacts before rebuild (target/, *.wasm, *.d.ts)
✅ **Multi-target** — Works with WASM and native targets
✅ **Error handling** — Clear error messages and exit codes
✅ **Colored output** — Easy-to-read logs with colors
✅ **Future-proof** — New crates are automatically detected

## Quick Start

### Direct script usage

```bash
# Check all crates (default)
./scripts/clean-cargo.sh

# Build release
./scripts/clean-cargo.sh build

# Build debug
./scripts/clean-cargo.sh build-debug

# Run tests
./scripts/clean-cargo.sh test

# Clean all artifacts
./scripts/clean-cargo.sh clean

# Watch mode (cargo watch)
./scripts/clean-cargo.sh watch
```

### Via npm scripts (recommended)

```bash
# Check all crates
pnpm run check:cargo

# Build release (cleans Rust + builds TypeScript)
pnpm run build
pnpm run build:cargo      # Rust only

# Build debug
pnpm run build:cargo:debug

# Test all (Rust + TypeScript)
pnpm run test
pnpm run test:cargo       # Rust only

# Watch mode
pnpm run dev

# Clean everything
pnpm run clean
```

## Commands Reference

| Command | What it does |
|---|---|
| `check` | **Default** — `cargo check` all crates with WASM target |
| `build` | Clean + `cargo build --release` all crates |
| `build-debug` | Clean + `cargo build` (debug) all crates |
| `test` | Clean + `cargo test` all crates |
| `clean` | Remove all `target/` and artifact directories |
| `watch` | Continuous rebuild with `cargo watch` (release mode) |

## Custom Targets

By default, the script targets `wasm32-unknown-unknown`. You can override:

```bash
# Native builds
./scripts/clean-cargo.sh build native
./scripts/clean-cargo.sh check native

# WASM (explicit)
./scripts/clean-cargo.sh build wasm32-unknown-unknown
```

## What Gets Cleaned

The script removes:

- **Global**: `cargo clean` on entire workspace
- **Per-crate**: `target/`, `pkg/`, `Cargo.lock`
- **Artifacts**: `*.wasm`, `*_bg.js`, `*.d.ts`

This ensures a completely fresh build, not just using cached artifacts.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Build/test failed or no crates found |

## Performance

The script:

- Runs **global `cargo clean`** before each build to eliminate cache pollution
- Removes `Cargo.lock` files per-crate to force fresh dependency resolution
- **Displays actual build times** for each crate (milliseconds)
- Parallelizes where possible across CPU cores
- Only rebuilds changed crates on incremental builds

### Build Times (examples)

Clean build (first time):
```
✓ Checked gwen-core (9389ms)           — Full compilation from scratch
✓ Built gwen-plugin-physics2d (11535ms) — Heavy Rapier2D dependency
✓ Built gwen-wasm-utils (110ms)        — Tiny utility crate
```

Incremental build (no changes):
```
✓ Checked gwen-core (45ms)              — Cargo sees no changes
✓ Checked gwen-plugin-physics2d (32ms) — Fast incremental check
✓ Checked gwen-wasm-utils (28ms)       — Already cached
```

## Architecture

```
clean-cargo.sh
├─ Auto-discovers crates
│  └─ Iterates crates/**/*.rs/Cargo.toml
├─ Cleans each crate
│  ├─ Removes target/, pkg/
│  └─ Removes generated artifacts
└─ Builds/checks/tests each crate
   └─ Reports success/failure clearly
```

## Troubleshooting

### "No crates found"
Make sure you're in the project root and crates exist in `./crates/`.

### Build still using cache
The script does a full clean. If issues persist:
```bash
pnpm run clean              # Clean everything
cargo clean --release       # Extra aggressive clean
./scripts/clean-cargo.sh build
```

### Permission denied
Make the script executable:
```bash
chmod +x ./scripts/clean-cargo.sh
```

## Examples

### Development workflow

```bash
# One-time full setup
pnpm run install:all

# Build everything cleanly
pnpm run build

# Work with Rust in watch mode
pnpm run dev

# Before commit
pnpm run test
```

### CI/CD

```bash
# Ensure clean state
pnpm run clean

# Validate everything
pnpm run check:cargo
pnpm run test:cargo
pnpm run lint
pnpm run typecheck

# Build release
pnpm run build
```

### Adding new crates

Just create a new crate in `crates/my-new-crate/`:

```bash
cargo new --lib crates/my-new-crate
```

The script will automatically discover and build it on next run:

```bash
./scripts/clean-cargo.sh build
```

## Notes

- The script is **idempotent** — running it twice with no changes is safe
- It **does not push to git** or modify version numbers
- Perfect for **CI/CD pipelines** to ensure reproducible builds
- Works on **macOS, Linux, and WSL** (bash 4.0+)

