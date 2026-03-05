# 📖 GWEN CLI Usage Guide

**Version**: 0.2.0  
**Framework**: Citty with Consola logging and Zod validation

---

## Installation

```bash
npm install -D @gwen/cli
# or
pnpm add -D @gwen/cli
```

### Verify Installation

```bash
gwen --version  # Shows 0.2.0
gwen --help     # Shows all commands
```

---

## Global Options

All commands support these flags:

### `--verbose` or `-v`

Show detailed logs about what's happening.

```bash
gwen prepare --verbose
gwen dev -v
gwen build --verbose
```

### `--debug`

Show debug information (very verbose). Implies verbose mode.

```bash
gwen dev --debug
gwen build --debug
```

---

## Commands

### `gwen prepare`

Generate `.gwen/` folder with TypeScript configuration and type definitions.

This command is usually called automatically before `dev` and `build`, but can be called manually.

**Usage:**
```bash
gwen prepare
gwen prepare --verbose
gwen prepare --debug
```

**What it generates:**
- `.gwen/tsconfig.generated.json` — Complete TypeScript configuration
- `.gwen/gwen.d.ts` — Type definitions for GWEN globals

---

### `gwen dev`

Start development server with hot module reloading.

**Usage:**
```bash
gwen dev
gwen dev --port 3001
gwen dev --open
gwen dev --port 3001 --open --verbose
```

**Options:**

- `--port <number>` — HTTP server port (default: 3000)
  - Must be between 1024 and 65535
  - Example: `gwen dev --port 3001`

- `--open` or `-o` — Auto-open browser on start
  - Example: `gwen dev --open`

- `--verbose (-v)` — Show detailed logs
- `--debug` — Show debug information

**Examples:**
```bash
# Start on default port 3000
gwen dev

# Start on custom port and open browser
gwen dev --port 3001 --open

# Start with verbose logging
gwen dev --verbose

# Start with debug information
gwen dev --debug
```

---

### `gwen build`

Build project for production.

**Usage:**
```bash
gwen build
gwen build --mode debug
gwen build --out-dir dist
gwen build --verbose
```

**Options:**

- `--mode <release|debug>` — Build mode (default: release)
  - `release` — Optimized build (slower to build, faster to run)
  - `debug` — Debug build (faster to build, slower to run)

- `--out-dir <path>` — Output directory (default: dist)
  - Example: `gwen build --out-dir build/`

- `--dryRun` — Simulate build without writing files
  - Useful for testing build configuration

- `--verbose (-v)` — Show detailed logs
- `--debug` — Show debug information

**Examples:**
```bash
# Standard production build
gwen build

# Debug build for development
gwen build --mode debug

# Custom output directory
gwen build --out-dir ./build

# Verbose build to debug issues
gwen build --verbose

# Test build configuration without writing files
gwen build --dryRun
```

---

### `gwen preview`

Preview the production build locally before deployment.

**Usage:**
```bash
gwen preview
gwen preview --port 4174
```

**Options:**

- `--port <number>` — Preview server port (default: 4173)
  - Must be between 1024 and 65535
  - Example: `gwen preview --port 4174`

- `--verbose (-v)` — Show detailed logs
- `--debug` — Show debug information

**Examples:**
```bash
# Preview on default port
gwen preview

# Preview on custom port
gwen preview --port 5000
```

---

### `gwen lint`

Lint source code with oxlint for issues.

**Usage:**
```bash
gwen lint
gwen lint --fix
gwen lint --path src/ --fix
```

**Options:**

- `--fix` — Auto-fix lint errors
  - Example: `gwen lint --fix`

- `--path <path>` — Path to lint (default: src)
  - Example: `gwen lint --path src/`

- `--verbose (-v)` — Show detailed logs
- `--debug` — Show debug information

**Examples:**
```bash
# Check for lint issues
gwen lint

# Auto-fix lint issues
gwen lint --fix

# Lint specific directory
gwen lint --path src/components

# Lint with verbose output
gwen lint --verbose
```

---

### `gwen format`

Format source code with oxfmt.

**Usage:**
```bash
gwen format
gwen format --check
gwen format --path src/
```

**Options:**

- `--check` — Check format without modifying files
  - Useful in CI/CD to ensure code is formatted
  - Example: `gwen format --check`

- `--path <path>` — Path to format (default: src)
  - Example: `gwen format --path src/components`

- `--verbose (-v)` — Show detailed logs
- `--debug` — Show debug information

**Examples:**
```bash
# Format all source files
gwen format

# Check if files are formatted (without modifying)
gwen format --check

# Format specific directory
gwen format --path src/components

# Format with verbose output
gwen format --verbose
```

---

### `gwen info`

Display parsed configuration from `gwen.config.ts`.

Useful for debugging configuration issues.

**Usage:**
```bash
gwen info
gwen info | jq '.engine'
```

**Options:**

- `--verbose (-v)` — Show detailed logs
- `--debug` — Show debug information

**Examples:**
```bash
# Show full configuration
gwen info

# Show engine config only
gwen info | jq '.engine'

# Show plugins
gwen info | jq '.plugins'

# Save config to file
gwen info > config.json
```

---

## Configuration

### Default Configuration

If no `gwen.config.ts` is found, GWEN uses default values:

```typescript
{
  engine: {
    maxEntities: 10_000,
    targetFPS: 60,
    debug: false,
  },
  html: {
    title: 'GWEN Project',
    background: '#000000',
  },
  plugins: [],
  scenes: [],
}
```

### Create `gwen.config.ts`

Create a file named `gwen.config.ts` in your project root:

```typescript
export default {
  engine: {
    maxEntities: 5000,
    targetFPS: 60,
    debug: false,
  },
  html: {
    title: 'My Game',
    background: '#1a1a1a',
  },
  plugins: [],
  scenes: ['menu', 'game', 'pause'],
};
```

### Configuration Validation

Configuration is validated with Zod at runtime. Errors are clear:

```
maxEntities must be at least 100
targetFPS must be between 30 and 240
background must be valid hex color
```

---

## Typical Workflow

```bash
# 1. Initialize project
mkdir my-game
cd my-game
pnpm init
pnpm add -D @gwen/cli

# 2. Prepare artifacts
gwen prepare

# 3. Start development
gwen dev --open

# 4. Make changes, watch for hot reload...

# 5. Format and lint before commit
gwen format
gwen lint --fix

# 6. Build for production
gwen build

# 7. Preview production build
gwen preview

# 8. Deploy dist/ folder
```

---

## Troubleshooting

### Port Already in Use

If you get "port already in use" error:

```bash
gwen dev --port 3001  # Try a different port
```

### Get Debug Information

To see what's happening during a command:

```bash
gwen build --verbose --debug
gwen dev --debug
```

### Check Configuration

If configuration seems wrong:

```bash
gwen info
```

Output will show parsed configuration.

### Config File Not Found

Make sure `gwen.config.ts` exists in project root:

```bash
ls -la gwen.config.ts
gwen info  # Should show configuration
```

### TypeScript Compilation Errors

TypeScript artifacts are in `.gwen/`:

```bash
gwen prepare --verbose  # Regenerate
```

---

## Environment Variables

(Currently no environment variables)

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Unknown error |
| 2 | Config error |
| 3 | Build error |
| 4 | Validation error |

---

## Performance Tips

1. **Use `--mode debug` during development** — Faster builds
2. **Use `--mode release` for production** — Optimized output
3. **Lint/format only changed files** — Use git hooks
4. **Preview before deploying** — Use `gwen preview`

---

## FAQ

**Q: Can I use a different config filename?**  
A: No, must be `gwen.config.ts` or `engine.config.ts`.

**Q: Does `--verbose` affect performance?**  
A: No, it only adds logging.

**Q: What if I don't want to auto-open browser?**  
A: Don't use `--open` flag.

**Q: Can I use `--debug` with `--fix`?**  
A: Yes, flags combine: `gwen lint --fix --debug`

---

## More Help

```bash
gwen --help              # Show all commands
gwen prepare --help      # Show prepare options
gwen dev --help          # Show dev options
# ... etc for all commands
```

---

**Version**: 0.2.0  
**Last Updated**: March 5, 2026  
**Repo**: https://github.com/unjs/gwen

