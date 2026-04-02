# 🚀 Quick Guide: First npm Release

## Prerequisites (do once)

```bash
# 1. Install wasm-pack
cargo install wasm-pack

# 2. Log in to npm
npm login

# 3. (Optional) Configure GitHub Actions
# Create an npm token: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
# Add to GitHub: Settings → Secrets → Actions
# Name: NPM_TOKEN, Value: your token
```

## Release Workflow (3 steps)

### 1. Create a changeset (after each change)

```bash
pnpm changeset
# → Select changed packages (Space)
# → Choose type: patch/minor/major
# → Write a summary

git add .changeset/*.md
git commit -m "chore: add changeset"
git push
```

### 2. Bump versions (when ready)

```bash
pnpm changeset:version
# → Updates package.json
# → Generates CHANGELOG.md

git add -A
git commit -m "chore: version packages"
git push
```

### 3. Publish to npm

```bash
# Build WASM + TypeScript
./scripts/build-wasm.sh
pnpm build:ts

# Publish
pnpm publish -r --access public

# Create the git tag
git tag v0.1.0
git push origin v0.1.0
```

## Or let GitHub Actions do it automatically

Once the `NPM_TOKEN` token is configured in GitHub:

1. Push to `main` → CI creates a "Version Packages" PR
2. Merge the PR → CI publishes automatically to npm

## Summary of useful files created

| File | Usage |
|---------|-------|
| `scripts/build-wasm.sh` | **Build WASM** (essential before publish) |
| `docs/DEPLOYMENT.md` | User guide (HTTP headers) |
| `.github/workflows/release.yml` | Automatic CI/CD (optional) |

## Reference Commands

```bash
# Development
pnpm dev                    # Dev mode with watch
pnpm test                   # Tests
pnpm lint                   # Linter

# Build
./scripts/build-wasm.sh     # Build Rust → WASM
pnpm build:ts               # Build TypeScript

# Release (via Changesets)
pnpm changeset              # Create a changeset
pnpm changeset:version      # Bump versions
pnpm release                # Publish to npm
```

## Help

- Full release guide: `RELEASE.md` (repository root)
- Changesets config: `.changeset/README.md` (repository root)
- Deployment guide: [DEPLOYMENT.md](/DEPLOYMENT)

---

**That's it! 🎉**

Next time you add a feature:
```bash
# 1. Write code
# 2. pnpm changeset
# 3. git commit && push
# 4. When ready: pnpm changeset:version
# 5. ./scripts/build-wasm.sh && pnpm build:ts && pnpm release
```

