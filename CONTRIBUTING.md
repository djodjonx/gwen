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

## Project Structure

```
gwen/
├── crates/              # Rust/WASM core
│   └── gwen-core/
├── packages/            # TypeScript packages
│   ├── @gwen/engine-core/
│   ├── @gwen/cli/
│   ├── @gwen/plugin-*/
│   ├── @gwen/renderer-*/
│   └── @gwen/vite-plugin/
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

1. Create directory: `packages/@gwen/plugin-myfeature/`
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
  "@gwen/engine-core": "workspace:*"
}
```

## Common Tasks

### Running Specific Tests

```bash
# Test one package
cd packages/@gwen/engine-core
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
- Profile hot paths with [@gwen/plugin-debug](packages/@gwen/plugin-debug/)
- Use ECS queries efficiently
- Minimize entity creation/destruction per frame

## Documentation Standards

### README Structure

```markdown
# @gwen/package-name

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

```typescript
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
```

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

