# 🤝 Contributing to GWEN

Thank you for your interest in contributing to GWEN! This guide will help you get started.

## Code of Conduct

Be respectful, inclusive, and professional. We're building a welcoming community.

## Getting Started

### Prerequisites

- Rust 1.75+
- Node.js 18+
- pnpm 8+
- wasm-pack (`cargo install wasm-pack`)

### Setup

```bash
git clone https://github.com/yourusername/gwen.git
cd gwen
pnpm install
cargo build --target wasm32-unknown-unknown
```

### Development Workflow

```bash
# Start dev server with WASM hot-reload
pnpm dev

# Run tests
pnpm test

# Format code
pnpm format

# Lint code
pnpm lint
pnpm lint:fix
```

## 🪝 Git Hooks

This project uses [Husky](https://typicode.github.io/husky/) to automatically run checks before commits and pushes.

### Pre-commit Hook

**Runs automatically before every commit**

The pre-commit hook ensures code quality by:

- 🔍 **Linting** - Automatically fixes linting issues with `oxlint --fix`
- ✨ **Formatting** - Auto-formats code with `oxfmt`
- ⚡ **Fast** - Only checks staged files (via lint-staged)

**What happens:**

```bash
git add .
git commit -m "feat: add new feature"
# → 🔍 Running pre-commit checks...
# → ✅ Pre-commit checks passed!
```

### Commit Message Validation

**Enforces Conventional Commits format**

All commit messages must follow this format:

```
type(scope): description
```

**Valid types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Test changes
- `chore` - Build/tooling changes
- `perf` - Performance improvements
- `ci` - CI/CD changes
- `build` - Build system changes

**Examples:**

```bash
✅ feat(engine-core): add particle system
✅ fix(cli): resolve import path issue
✅ docs: update README with examples
✅ refactor(plugin-audio): simplify AudioManager
✅ test: add prefab tests

❌ added new feature        # Missing type
❌ fix: bug                 # Too short
❌ update(core): changes    # Invalid type
```

### Skipping Hooks (Emergency Only)

If you absolutely need to skip the hooks:

```bash
# Skip pre-commit checks
git commit --no-verify -m "emergency fix"

# Skip pre-push checks
git push --no-verify
```

**⚠️ Warning:** Only use `--no-verify` in emergencies. Skipped checks may cause CI to fail.

## Project Structure

```
gwen/
├── crates/              # Rust/WASM core
│   └── gwen-core/
├── packages/            # TypeScript packages
│   ├──@djodjonx/gwen-engine-core/
│   ├──@djodjonx/gwen-cli/
│   ├──@djodjonx/gwen-plugin-*/
│   ├──@djodjonx/gwen-renderer-*/
│   └──@djodjonx/gwen-vite-plugin/
├── playground/          # Example game (Space Shooter)
└── docs/               # Documentation
```

## Making Changes

### Branch Naming

```
feature/short-description    # New feature
fix/short-description        # Bug fix
docs/short-description       # Documentation
chore/short-description      # Maintenance
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `test:` — Tests
- `chore:` — Maintenance
- `refactor:` — Code restructuring

**Examples:**

```
feat(plugin-audio): add sound effect volume normalization

fix(engine-core): prevent entity component access race condition

docs(cli): add installation troubleshooting section

test(plugin-input): add gamepad axis mapping tests
```

### Code Style

- **TypeScript**: Follow ESLint/Prettier (auto-formatted by oxfmt)
- **Rust**: Follow rustfmt (run `cargo fmt`)
- Use **100% strict TypeScript** mode
- Use **2 spaces** for indentation
- Use **descriptive variable names**

### Testing

- Write tests for new features
- Run tests locally before pushing:
  ```bash
  pnpm test
  cargo test
  ```
- Ensure all tests pass

### Documentation

- Update README if adding features
- Add JSDoc comments for public APIs
- Update ARCHITECTURE.md for structural changes
- Add examples in package-specific docs

## Submitting Changes

### Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Write/update** tests
5. **Format** code (`pnpm format`)
6. **Lint** code (`pnpm lint:fix`)
7. **Commit** with conventional messages
8. **Push** to your fork
9. **Create** a Pull Request

### Pull Request Guidelines

- Use a clear, descriptive title
- Reference related issues (`Closes #123`)
- Describe what changed and why
- Include screenshots/demos for UI changes
- Keep PRs focused (one feature per PR)
- Respond to review feedback promptly

**Example PR Description:**

```markdown
## Description

Adds panning functionality to the camera system for games with larger maps.

## Changes

- Add `camera.pan(x, y)` method
- Add pan animation with configurable duration
- Add camera boundary constraints

## Related Issues

Closes #456

## Testing

- [x] Unit tests added
- [x] Manual testing on playground
- [x] No regressions in existing tests
```

## Package Development

### Adding a New Plugin

1. Create directory: `packages/@djodjonx/gwen-plugin-myfeature/`
2. Copy structure from an existing plugin
3. Update `package.json` with correct metadata
4. Implement plugin in `src/index.ts`
5. Add tests in `tests/`
6. Create `README.md` with usage examples
7. Update root `CONTRIBUTING.md` if needed

### Monorepo Packages

All packages use:

- **Vite** for building (except CLI which uses TSC)
- **Vitest** for testing
- **TypeScript** 5.3+
- **pnpm workspaces** for dependency management

Use `workspace:*` for internal dependencies:

```json
"dependencies": {
  "@djodjonx/gwen-engine-core": "workspace:*"
}
```

## Common Tasks

### Running Specific Tests

```bash
# Test one package
cd packages/@djodjonx/gwen-engine-core
pnpm test

# Test with watch mode
pnpm test --watch

# Test a specific file
pnpm test tests/my-feature.test.ts
```

### Building for Production

```bash
pnpm build
```

### Benchmarking

```bash
pnpm bench
```

### Cleaning Build Artifacts

```bash
pnpm clean
```

## Performance Considerations

- Keep WASM binary size low
- Profile hot paths with [@djodjonx/gwen-plugin-debug](packages/@djodjonx/gwen-plugin-debug/)
- Use ECS queries efficiently
- Minimize entity creation/destruction per frame

## String Pool Best Practices

### Overview

GWEN uses a **String Pool** system to store strings efficiently in ECS components. Understanding this system is critical to avoid memory leaks.

### Golden Rule: Never Store String IDs

**❌ NEVER DO THIS:**

```typescript
// BAD: Storing string IDs in closures or globals
const cachedId = GlobalStringPoolManager.scene.intern('PlayerName');

export const MySystem = () => {
  // This ID becomes INVALID after a scene transition!
  const name = GlobalStringPoolManager.scene.get(cachedId);
};
```

**✅ ALWAYS DO THIS:**

```typescript
// GOOD: Store the string itself, let the schema handle IDs
const cachedName = 'PlayerName';

export const MyComponent = defineComponent({
  name: 'MyComponent',
  schema: {
    name: Types.string, // Automatic ID management
  },
});
```

### When to Use Each String Type

#### `Types.string` (Scene-Scoped) — Default ✅

**Use this 99% of the time.**

```typescript
const Enemy = defineComponent({
  name: 'Enemy',
  schema: {
    name: Types.string, // Cleared on scene transition
    description: Types.string,
  },
});
```

**Cleared automatically on scene transitions** — prevents memory leaks.

---

#### `Types.persistentString` (Persistent) — Use Sparingly ⚠️

**Only use for data that MUST survive scene transitions.**

```typescript
const PlayerSave = defineComponent({
  name: 'PlayerSave',
  schema: {
    playerName: Types.persistentString, // Survives transitions
    lastPlayed: Types.persistentString,
  },
});
```

**Never cleared** — overuse will cause memory leaks!

**Valid use cases:**

- Player names from save files
- User preferences (language, volume settings)
- Configuration loaded once at startup

**Invalid use cases:**

- Enemy names
- UI labels
- Temporary messages
- Any scene-specific data

### Debugging String Pool Leaks

If memory grows indefinitely after scene transitions:

```typescript
import { GlobalStringPoolManager } from '@djodjonx/gwen-engine-core';

// Check pool sizes
const stats = GlobalStringPoolManager.getDebugStats();
console.log(`Scene pool: ${stats.scenePoolSize} strings`);
console.log(`Persistent pool: ${stats.persistentPoolSize} strings`);
```

**Expected behavior:**

- `scenePoolSize`: Only current scene's strings (typically 10-100)
- `persistentPoolSize`: Stable across transitions (only truly persistent data)

**Red flags:**

- `scenePoolSize` growing with each transition
- `persistentPoolSize` > 1000 (warning logged in dev mode)

### Further Reading

See [docs/core/string-pool.md](docs/core/string-pool.md) for complete documentation.

---

## Documentation Standards

### README Structure

```markdown
#@djodjonx/gwen-package-name

**Short description**

## Installation

## Quick Start

## API Reference

## Examples

## Browser Compatibility

## See Also
```

### Code Comments

- Use JSDoc for public APIs
- Explain "why" not "what"
- Keep comments up-to-date

````typescript
/**
 * Load audio file and cache for playback.
 *
 * @param name - Unique identifier for the sound
 * @param url - Path to audio file (WAV, MP3, OGG)
 * @throws Error if AudioContext not initialized
 *
 * @example
 * ```ts
 * audio.preload('jump', '/sounds/jump.wav');
 * audio.play('jump');
 * ```
 */
public preload(name: string, url: string): void { }
````

## Reporting Issues

### Bug Reports

Include:

- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment (browser, OS, versions)
- Screenshots/videos if applicable

### Feature Requests

Include:

- Use case and motivation
- Proposed API/behavior
- Examples of similar solutions

## Questions?

- 💬 Open a [GitHub Discussion](https://github.com/yourusername/gwen/discussions)
- 📧 Email: [your-email@example.com]
- 🐦 Twitter: [@gwen_engine](https://twitter.com/gwen_engine)

## Recognition

Contributors are recognized in:

- README.md contributors section
- Release notes
- Community highlights

Thank you for contributing to GWEN! 🎮✨
