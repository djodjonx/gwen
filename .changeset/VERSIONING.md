# Versioning & Releases

## Strategy

GWEN follows **semantic versioning** with a **linked monorepo** approach:

- All `@gwen/*` packages are versioned and released **together**
- Breaking changes increment **MAJOR**
- New features increment **MINOR**
- Bug fixes increment **PATCH**
- Changesets automate changelog generation and version bumps

## Workflow

### 1. Create a Changeset

After making changes (bug fix, feature, etc.):

```bash
pnpm changeset
```

Answer the prompts:
- Select affected packages
- Choose semver bump (patch/minor/major)
- Describe the change

This creates a file in `.changeset/` describing your change.

**Example:**
```
# .changeset/fierce-lions-jump.md
---
"@gwen/engine-core": patch
"@gwen/plugin-input": patch
---

fix: prevent entity component access race condition
```

### 2. Commit Your Changes

```bash
git add .changeset/fierce-lions-jump.md
git commit -m "chore: add changeset for entity fix"
```

### 3. Version & Release (Maintainers Only)

When ready to release (on `main` branch):

```bash
# Bump versions and generate CHANGELOG
pnpm changeset version

# Review changes
git diff

# Commit version bumps
git add -A
git commit -m "chore(release): bump versions"

# Publish to npm
pnpm publish
```

## Package Release Scope

### Published Packages (Public NPM)
- `@gwen/engine-core`
- `@gwen/cli`
- `@gwen/plugin-audio`
- `@gwen/plugin-input`
- `@gwen/plugin-debug`
- `@gwen/plugin-html-ui`
- `@gwen/renderer-canvas2d`
- `@gwen/vite-plugin`
- `create-gwen-app`

### Private Packages (Not Published)
- Playground examples
- Internal tools

## Version Tags

Release tags follow the pattern: `v{MAJOR}.{MINOR}.{PATCH}`

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Breaking Changes

For breaking changes:

1. Add `@gwen/package: major` in changeset
2. Document migration guide in changeset description
3. Update relevant README/docs
4. Add explicit warning in CHANGELOG

**Example changeset for breaking change:**

```markdown
---
"@gwen/engine-core": major
---

feat!: rename defineScene to createScene

BREAKING: `defineScene()` is now `createScene()`. Update all scene definitions:

```typescript
// Before
export const GameScene = defineScene({ ... });

// After
export const GameScene = createScene({ ... });
```

See [Migration Guide](./MIGRATION.md) for details.
```

## Prerelease Versions

For alpha/beta releases:

```bash
pnpm changeset pre enter alpha
pnpm changeset version
# Results in: 0.2.0-alpha.0
```

Exit prerelease:

```bash
pnpm changeset pre exit
pnpm changeset version
# Results in: 0.2.0
```

## FAQ

### Q: Do I create a changeset for every commit?
**A:** No, only when making **user-facing changes** (features, fixes, breaking changes). Internal refactors that don't affect the public API don't need changesets.

### Q: Can I update a changeset I already created?
**A:** Yes, edit the `.changeset/random-name.md` file directly.

### Q: What if I forget to create a changeset?
**A:** Create it before merge. It's part of the review process.

### Q: How do I know what bump type to use?
- **patch**: Bug fixes, minor docs updates
- **minor**: New features, non-breaking API additions
- **major**: Breaking changes, significant refactors

## Useful Commands

```bash
# See all pending changesets
pnpm changeset status

# Check what would change in next version
pnpm changeset version --canary

# View changelog diff before release
git diff CHANGELOG.md
```

## CI/CD Integration

In your GitHub Actions workflow:

```yaml
- name: Create Release Pull Request or Publish
  uses: changesets/action@v1
  with:
    publish: pnpm publish
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

For more info: [Changesets Documentation](https://github.com/changesets/changesets)

