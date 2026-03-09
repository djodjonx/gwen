# 📦 Release Process

This document outlines the release process for GWEN.

## Prerequisites

- Maintainer access to npm
- Node.js 18+
- pnpm 8+
- Rust toolchain with `wasm32-unknown-unknown` target
- `wasm-pack` installed (`cargo install wasm-pack`)
- `NPM_TOKEN` configured in CI/CD environment
- `GITHUB_TOKEN` optional in local (required in CI for enriched changelog)

## ⚠️ Important Notes

**WASM Artifacts:** Packages `@gwen/engine-core` and `@gwen/plugin-physics2d` include pre-compiled WASM binaries in their `wasm/` folders. These MUST be built before publishing with `./scripts/build-wasm.sh`.

**SharedArrayBuffer:** Users deploying GWEN need specific HTTP headers. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for configuration guides (Vercel, Netlify, Cloudflare, etc.).

## Release Checklist

### Before Release

- [ ] All PRs merged to `main`
- [ ] `pnpm install && pnpm test` passes
- [ ] No breaking changes without MAJOR bump
- [ ] All changesets added for user-facing changes

### During Release

#### Step 1: Create Changesets (Per Commit)

After making changes:

```bash
pnpm changeset
# Follow prompts to select packages and bump type
git add .changeset/*.md
git commit -m "chore: add changeset for [feature/fix]"
```

**Bump Types:**
- `patch` - Bug fixes, minor docs
- `minor` - New features, non-breaking additions
- `major` - Breaking changes

#### Step 2: Version Bump (When Ready)

Run this to generate new versions and CHANGELOG:

```bash
pnpm changeset:version
```

Note:
- In CI (GitHub Actions), `GITHUB_TOKEN` is available and changelogs include PR/author metadata.
- In local development without `GITHUB_TOKEN`, Changesets now falls back to a simple changelog format.

Review the changes:

```bash
git diff package.json packages/*/package.json CHANGELOG.md
```

Commit version bump:

```bash
git add -A
git commit -m "chore(release): bump versions [x.y.z]"
git tag vx.y.z
git push origin main vx.y.z
```

#### Step 3: Publish (Manual or CI)

**Manual:**
```bash
pnpm release
# Publishes all public packages to npm
```

**GitHub Actions (Recommended):**
Use the Changesets GitHub Action to automate this.

### After Release

- [ ] Verify packages published to npm
- [ ] GitHub release created with changelog
- [ ] Announce on social media / Discord

## Example: Full Release Flow

```bash
# 1. Feature work completed
pnpm changeset
# Selects: @gwen/engine-core (minor), @gwen/plugin-audio (patch)
# Reason: "Add new audio mixing API"

git add .changeset/fancy-cats-12345.md
git commit -m "chore: add changeset for audio mixing"
git push

# 2. PR reviewed and merged to main
# 3. Ready to release

pnpm changeset:version
# Updates package.json versions
# Generates CHANGELOG entries
# Removes changeset file

git add -A
git commit -m "chore(release): bump @gwen/engine-core to 0.2.0, @gwen/plugin-audio to 0.1.1"
git tag v0.2.0
git push origin main v0.2.0

# 4. Build WASM + TypeScript
./scripts/build-wasm.sh
pnpm build:ts

# 5. Publish
pnpm release
# npm install @gwen/engine-core@0.2.0
```

## Hotfix Release

For critical bug fixes:

```bash
git checkout -b hotfix/critical-bug
# ... fix bug ...
git push origin hotfix/critical-bug
# Create PR, get approval

git checkout main
git pull
pnpm changeset
# Select patch bump for affected package

pnpm changeset:version
git add -A
git commit -m "chore(release): hotfix vx.y.z"
git tag vx.y.z
git push origin main vx.y.z

pnpm release
```

## Prerelease Versions

For alpha/beta testing:

```bash
pnpm changeset pre enter alpha
pnpm changeset:version
# Results in: 0.2.0-alpha.0, 0.1.2-alpha.0, etc.

git add -A
git commit -m "chore(release): v0.2.0-alpha.0"
git tag v0.2.0-alpha.0
git push origin main v0.2.0-alpha.0

pnpm release
# Publishes with npm dist-tag: latest-alpha
```

Exit prerelease:

```bash
pnpm changeset pre exit
pnpm changeset:version
# Bump to stable: 0.2.0, 0.1.2

git add -A
git commit -m "chore(release): exit prerelease"
git push origin main

pnpm release
```

## Breaking Changes

When introducing breaking changes:

1. Add `@package: major` in changeset
2. Document migration in changeset description
3. Create `MIGRATION.md` in package root
4. Update package README

**Changeset example:**

```markdown
---
"@gwen/engine-core": major
---

feat!: rename defineScene to createScene

BREAKING: API change for scene definitions.

Before:
```typescript
export const MyScene = defineScene({ ... });
```

After:
```typescript
export const MyScene = createScene({ ... });
```

See [MIGRATION.md](./MIGRATION.md) for full guide.
```

## CI/CD Integration

### GitHub Actions Setup

Add to `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: pnpm

      - run: pnpm install
      - run: pnpm test
      - run: pnpm build

      - name: Create Release PR or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Troubleshooting

### "Package not found on npm"

- Verify `npm whoami` to confirm auth
- Check `package.json` has `"publishConfig": { "access": "public" }`
- Confirm package name under `@gwen/` scope exists on npm

### "CHANGELOG conflicts"

Manually resolve conflicts in `CHANGELOG.md`, then:

```bash
git add CHANGELOG.md
git commit -m "chore: resolve CHANGELOG conflict"
```

### "Lost changeset file"

Recreate it:

```bash
pnpm changeset
# Manually recreate from git log
```

## FAQ

**Q: Can I release a single package?**
A: No, GWEN uses linked versioning. All `@gwen/*` packages release together.

**Q: What if there are no changesets?**
A: No release is created. Always add changesets for user-facing changes.

**Q: How do I skip a package in release?**
A: Add it to `.changeset/config.json` `ignore` list.

**Q: Can I manually bump versions?**
A: Not recommended. Use changesets for consistency and audit trail.

---

**Questions?** See [.changeset/VERSIONING.md](.changeset/VERSIONING.md)

