---
"@djodjonx/gwen-engine-core": major
"@djodjonx/gwen-schema": major
"@djodjonx/gwen-kit": major
"@djodjonx/gwen-cli": major
"@djodjonx/gwen-plugin-input": major
"@djodjonx/gwen-plugin-audio": major
"@djodjonx/gwen-plugin-debug": major
"@djodjonx/gwen-plugin-html-ui": major
"@djodjonx/gwen-plugin-physics2d": major
"@djodjonx/gwen-renderer-canvas2d": major
---

BREAKING: Migrate public packages to @djodjonx scope with gwen-* naming convention

**Package names have been completely rebranded** from `@gwen/*` to `@djodjonx/gwen-*` to ensure NPM scope access and consistent branding.

### Migration Guide

Update all your imports and dependencies:

**Before:**
```typescript
import { createEngine } from '@gwen/engine-core';
import { defineConfig } from '@gwen/kit';
import { InputPlugin } from '@gwen/plugin-input';
```

**After:**
```typescript
import { createEngine } from '@djodjonx/gwen-engine-core';
import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
```

### Package Mapping (Public/Releasable)

| Old Name | New Name |
|----------|----------|
| `@gwen/engine-core` | `@djodjonx/gwen-engine-core` |
| `@gwen/schema` | `@djodjonx/gwen-schema` |
| `@gwen/kit` | `@djodjonx/gwen-kit` |
| `@gwen/cli` | `@djodjonx/gwen-cli` |
| `@gwen/plugin-input` | `@djodjonx/gwen-plugin-input` |
| `@gwen/plugin-audio` | `@djodjonx/gwen-plugin-audio` |
| `@gwen/plugin-debug` | `@djodjonx/gwen-plugin-debug` |
| `@gwen/plugin-html-ui` | `@djodjonx/gwen-plugin-html-ui` |
| `@gwen/plugin-physics2d` | `@djodjonx/gwen-plugin-physics2d` |
| `@gwen/renderer-canvas2d` | `@djodjonx/gwen-renderer-canvas2d` |

### Action Required

1. Update `package.json` dependencies to new scope
2. Update all import statements in your codebase
3. Run `npm install` or `pnpm install` to fetch from correct registry

No functional changes to the engine or APIs — this is purely a naming migration.

