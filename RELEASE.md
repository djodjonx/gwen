# 📦 Release Process

This document outlines the release process for GWEN.

## Prerequisites

- Maintainer access to npm (scope `@djodjonx`)
- Node.js 20+
- pnpm 9+
- Rust toolchain with `wasm32-unknown-unknown` target
- `wasm-pack` installed (`curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`)

## 🛡️ Automated Safety Checks

We use a custom verification script `scripts/verify-release.mjs` that runs automatically during the release. It ensures:
- All packages have a `dist/` folder (compiled TS).
- WASM-dependent packages (like `engine-core` and `plugin-physics2d`) have their `.wasm` files in the `wasm/` folder.
- Internal `workspace:*` dependencies are valid.

## 🚀 Release Workflows

### 1. Automatic Release (Recommended)

Our GitHub Action handles the entire process when changes are merged to `main`.

1. **Push Changes:** Merge your PRs to `main`.
2. **Review Version PR:** A "Version Packages" PR will be automatically created/updated by Changesets.
3. **Merge Version PR:** Once merged, GitHub Actions will:
   - Build all WASM crates.
   - Build all TypeScript packages.
   - Run verification scripts.
   - Publish to npm under the `@djodjonx` scope.

### 2. Manual Release (Emergency/Local)

If you need to release manually from your machine:

```bash
# 1. Ensure you are on main and up to date
git checkout main
git pull

# 2. Consume changesets and bump versions
pnpm changeset:version

# 3. Review and commit the version bump
git add .
git commit -m "chore(release): bump versions"

# 4. Run the full release command
# This will build WASM, build TS, verify artifacts, and publish
pnpm release
```

**Note:** The `pnpm release` command is a shortcut for:
`pnpm build && pnpm sync:create-app-versions && pnpm release:verify && changeset publish`

---

## 🛠️ Maintenance Commands

### Build WASM only
To manually trigger the Rust to WASM compilation and distribution:
```bash
./scripts/build-wasm.sh
```

### Verify Packages only
To check if your packages are ready for npm without publishing:
```bash
pnpm release:verify
```

### Create a Changeset
Every user-facing change should include a changeset:
```bash
pnpm changeset
```

---

## ⚠️ Important Notes

**WASM Artifacts:** Packages are distributed with their WASM binaries encapsulated. Users do not need Rust installed to use GWEN, but **maintainers** must have it to build the release.

**Scope:** All packages are published under the `@djodjonx` scope (e.g., `@djodjonx/gwen-engine-core`).

