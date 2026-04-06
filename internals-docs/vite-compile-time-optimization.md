# Vite Compile-Time Optimization in GWEN

**Audience:** GWEN core contributors and external plugin authors  
**Status:** Living document — update as the toolchain evolves  
**Location:** `internals-docs/` — not published to VitePress

---

## Table of Contents

1. [The Core Philosophy](#1-the-core-philosophy)
2. [Why Compile-Time, Not Runtime](#2-why-compile-time-not-runtime)
3. [The Toolchain: OXC, oxc-walker, MagicString](#3-the-toolchain-oxc-oxc-walker-magicstring)
4. [Zero-Copy and the WASM Boundary](#4-zero-copy-and-the-wasm-boundary)
5. [How the Pipeline Works](#5-how-the-pipeline-works)
6. [Existing Plugins and What They Do](#6-existing-plugins-and-what-they-do)
7. [Patterns and Recommendations](#7-patterns-and-recommendations)
8. [Writing an External Vite Plugin for GWEN](#8-writing-an-external-vite-plugin-for-gwen)
9. [Pitfalls and Anti-Patterns](#9-pitfalls-and-anti-patterns)
10. [Testing Compile-Time Transforms](#10-testing-compile-time-transforms)

---

## 1. The Core Philosophy

GWEN's design goal is a **simple, readable API for the developer and near-optimal machine code after build**.

The user writes this:

```typescript
// movement.ts — what the developer writes
export const movementSystem = defineSystem(() => {
  const entities = useQuery([Position, Velocity]);

  onUpdate((dt) => {
    for (const entity of entities) {
      const pos = useComponent(entity, Position);
      const vel = useComponent(entity, Velocity);
      useComponent(entity, Position, {
        x: pos.x + vel.x * dt,
        y: pos.y + vel.y * dt,
      });
    }
  });
});
```

After `vite build`, this becomes:

```typescript
// movement.ts — what V8 executes (generated, never seen by the developer)
export const movementSystem = defineSystem(() => {
  const entities = useQuery([Position, Velocity]);

  onUpdate((dt) => {
    const { entityCount: _n, data: _pos, slots: _slots, gens: _gens } =
      __gwen_bridge__.queryReadBulk([1, 2], 1, 2);
    const { data: _vel } =
      __gwen_bridge__.queryReadBulk([1, 2], 2, 2);

    for (let _i = 0; _i < _n; _i++) {
      _pos[_i * 2 + 0] = _pos[_i * 2 + 0] + _vel[_i * 2 + 0] * dt;
      _pos[_i * 2 + 1] = _pos[_i * 2 + 1] + _vel[_i * 2 + 1] * dt;
    }

    __gwen_bridge__.queryWriteBulk(_slots, _gens, 1, _pos);
  });
});
```

The ergonomic per-entity API — N WASM crossings per frame — becomes 2–3 WASM crossings
per frame regardless of entity count. The developer never writes the optimized form.
The build tool does it for them.

This approach is called **transparent compile-time optimization**. It is the same strategy
used by:

- **SolidJS** — JSX compiles to direct DOM calls, not a virtual DOM
- **Svelte** — reactive `$:` becomes imperative update code
- **Vue 3 compiler** — template static hoisting, patch flags
- **Nuxt DevTools** — auto-imports analyzed at build, never scanned at runtime

---

## 2. Why Compile-Time, Not Runtime

### The Cost of "Smart" Runtime Code

A runtime optimizer would need to:

- Track which components are accessed inside every callback
- Count entities per frame to decide when switching to bulk is worth it
- Handle the synchronization between the ergonomic API and the underlying buffer

This adds latency, allocations, and branching on every frame — in the hottest path of the
engine.

### What the Build Step Can See That Runtime Cannot

At build time, the Vite plugin has access to information that no runtime can efficiently
reconstruct:

| Information | Runtime cost | Build-time cost |
|---|---|---|
| Component schema (fields, types, strides) | Closure lookup per access | 0 — read once from `defineComponent` AST |
| Which components are read vs written | Proxy interception per property | 0 — static AST analysis |
| Is this loop safe to bulk-transform? | Guards + flags every frame | 0 — purity check once at build |
| typeId as a numeric literal | Map lookup per call | 0 — inlined as constant |

### Build-Time Transforms are Invisible to the Developer

The developer uses `vite dev` which skips heavy transforms for fast HMR. They only
see the ergonomic API. The optimized output only appears in `vite build`. Source maps
ensure error messages still point to the original readable source.

---

## 3. The Toolchain: OXC, oxc-walker, MagicString

GWEN's compile-time transforms rely on three libraries. Understanding all three is
required before writing or modifying any transform plugin.

### 3.1 OXC Parser (`oxc-parser`)

**What it is:** A Rust-implemented JavaScript/TypeScript parser compiled to WASM, exposed
as an npm package. ~3× faster than Babel's parser on typical source files.

**What it produces:** An ESTree-compatible AST. All types are exported from
`@oxc-project/types` and re-exported by `oxc-parser`.

**How to use it:**

```typescript
import { parseSync } from 'oxc-parser';
import type { Program } from 'oxc-parser';

const result = parseSync('movement.ts', sourceCode);
const program: Program = result.program;
```

**Critical type mapping** — OXC uses ESTree names, not internal Rust names:

| Conceptual name | `node.type` in practice | TypeScript interface |
|---|---|---|
| String literal | `'Literal'` | `StringLiteral` (`.value: string`) |
| Number literal | `'Literal'` | `NumericLiteral` (`.value: number`) |
| Object property | `'Property'` | `ObjectProperty` |
| Function body block | `'BlockStatement'` | `FunctionBody` |
| Static member `a.b` | `'MemberExpression'` | `StaticMemberExpression` |

Because `StringLiteral` and `NumericLiteral` both have `type: 'Literal'`, TypeScript
cannot discriminate them by type alone. Always check `typeof node.value`:

```typescript
import type { StringLiteral, NumericLiteral } from 'oxc-parser';

if (node.type === 'Literal') {
  if (typeof (node as StringLiteral | NumericLiteral).value === 'string') {
    // it is a StringLiteral
  }
}
```

This is the **only legitimate reason** to cast in OXC-related code. All other node types
are discriminable by `node.type` and TypeScript will narrow correctly.

### 3.2 oxc-walker (`oxc-walker`)

**What it is:** A typed depth-first AST walker built on top of `oxc-parser`.
Source: https://github.com/oxc-project/oxc-walker

**What it provides:**

```typescript
import { walk, parseAndWalk, ScopeTracker } from 'oxc-walker';
import type { Node } from 'oxc-walker';

// Walk a pre-parsed program
walk(program, {
  enter(node: Node, parent: Node | null, ctx) {
    // called when entering a node
    // this.skip()    → do not walk children
    // this.remove()  → remove node from parent
    // this.replace() → replace node in parent
  },
  leave(node: Node, parent: Node | null, ctx) {
    // called when leaving a node (after children are walked)
  },
});

// Parse and walk in one call (convenience API)
parseAndWalk(sourceCode, 'filename.ts', {
  enter(node) { ... },
});
```

**Do not re-implement a custom walker.** `oxc-walker` is the official walker for OXC
ASTs and handles all edge cases (sparse arrays, null elements, TypeScript syntax nodes).

**TypeScript narrowing with oxc-walker:**

After `node.type === 'VariableDeclarator'`, TypeScript narrows `node` to `VariableDeclarator`
from `@oxc-project/types`. You can then access `.id` and `.init` directly without casts:

```typescript
import type { VariableDeclarator, CallExpression } from 'oxc-parser';

walk(program, {
  enter(node) {
    if (node.type !== 'VariableDeclarator') return;
    // node is VariableDeclarator — .id: BindingPattern, .init: Expression | null
    const { id, init } = node as VariableDeclarator;

    if (id.type !== 'Identifier') return;
    // id is BindingIdentifier — .name: string
    console.log(id.name);

    if (!init || init.type !== 'CallExpression') return;
    // init is CallExpression — .callee: Expression, .arguments: Argument[]
    const call = init as CallExpression;
  },
});
```

**`this.skip()` for performance:**

When you find the node you are looking for inside a subtree that should not be traversed
further, call `this.skip()` to avoid unnecessary work:

```typescript
walk(program, {
  enter(node) {
    if (node.type !== 'ObjectExpression') return;
    // Found the object — process it
    processConfig(node);
    // No need to go deeper into this object
    this.skip();
  },
});
```

### 3.3 MagicString

**What it is:** A library for surgical string mutations that produces accurate source maps.
It works on the original string by recording character-level edits (overwrite, insert, remove)
and replaying them to produce both the transformed code and a source map.

**Why it matters:** If a Vite transform returns `{ code, map }`, source maps allow the
browser DevTools (and TypeScript error messages) to show the original developer-written
source, not the generated bulk code. Without source maps, stack traces and debugger breakpoints
become useless.

**How to use it:**

```typescript
import MagicString from 'magic-string';

function transformSource(code: string, id: string) {
  const s = new MagicString(code);

  // All positions are byte offsets into the ORIGINAL source string.
  // They come directly from AST node .start and .end properties.

  // Insert text before a position
  s.prependLeft(node.start, 'Object.assign(');

  // Insert text after a position
  s.appendRight(node.end, `, { __name__: '${name}' })`);

  // Replace a range
  s.overwrite(node.start, node.end, replacementCode);

  // Remove a range
  s.remove(node.start, node.end);

  if (!s.hasChanged()) return null; // Vite convention: null = no transform

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: id, includeContent: true }),
  };
}
```

**Key rules for MagicString:**

1. All positions come from AST `.start` and `.end` — never compute them manually.
2. All nodes in `@oxc-project/types` extend `Span { start: number; end: number }`.
   Every node has these fields — no cast needed to access them.
3. When making multiple edits, process them in **reverse source order** (largest offset
   first) to prevent earlier edits from invalidating later positions.
4. Always use `hires: true` in `generateMap()` for accurate column-level source maps.

---

## 4. Zero-Copy and the WASM Boundary

### What is the WASM Boundary?

Calling a `#[wasm_bindgen]` function from JavaScript requires:

1. **Serialization** — JavaScript values are converted to types WASM understands
   (numbers, typed arrays, byte pointers)
2. **Memory crossing** — control is handed to the WASM module
3. **Deserialization** — return values are converted back to JavaScript objects

For scalar numbers, this cost is small. For `&[u8]` / `Float32Array` arguments that map
to raw memory slices, the cost is also small because typed arrays can be backed by the
WASM linear memory buffer — they do not copy.

The real cost is **call frequency**. Calling a WASM function 3000 times per frame (for
1000 entities × 3 operations) creates 3000 context switches. Even if each crossing takes
1 microsecond, that is 3ms per frame — half the frame budget at 60fps.

### Zero-Copy with Typed Arrays

WASM linear memory is exposed to JavaScript as an `ArrayBuffer`. TypedArray views on
this buffer (`Float32Array`, `Uint32Array`) read and write directly — no copy.

```typescript
// The WASM memory buffer
const memory: WebAssembly.Memory = wasm.memory;

// A Float32Array view — this does NOT copy the data
const view = new Float32Array(memory.buffer, byteOffset, length);

// Writing to `view` writes directly into WASM memory
view[0] = 1.0; // goes to WASM linear memory at byteOffset

// DANGER: if WASM calls memory.grow(), the buffer detaches
// Always re-create the view after any WASM call that may allocate
const freshView = new Float32Array(wasm.memory.buffer, byteOffset, length);
```

**GWEN's bulk APIs** return `Float32Array` views into the static query result buffer
in WASM linear memory. The generated loop operates directly on these views:

```typescript
// Generated code — zero copy
const { data: _pos } = __gwen_bridge__.queryReadBulk([1, 2], 1, 2);
for (let _i = 0; _i < _n; _i++) {
  _pos[_i * 2 + 0] += _vel[_i * 2 + 0] * dt; // writes directly to WASM memory
}
__gwen_bridge__.queryWriteBulk(_slots, _gens, 1, _pos); // flush once
```

### The Boundary Tax Summary

| Pattern | WASM calls for 1000 entities | Copies |
|---|---|---|
| Per-entity `useComponent` read + write | 3000 | 3000 object allocations |
| Bulk read + JS loop + bulk write | 3 | 0 (TypedArray views) |
| Pure WASM built-in (e.g. `bulk_integrate_velocity`) | 1 | 0 |

The optimization target, in decreasing priority:

1. **Move the entire computation into WASM** (`bulk_integrate_velocity_2d`) — best, only
   possible for canonical patterns with a Rust implementation
2. **Bulk read → JS loop → bulk write** — second best, 2–3 WASM calls regardless of N
3. **Per-entity calls** — baseline, avoid in `onUpdate` hotpaths

---

## 5. How the Pipeline Works

A Vite transform plugin is a function called by Vite for every module it processes:

```
[Source file]
     │
     ▼
[Vite module graph] ──resolveId──► module identity
     │
     ▼
[transform hook]    ──code, id──► { code, map } | null
     │
     ▼
[esbuild / Rollup]  ── bundle & minify
     │
     ▼
[dist/]
```

GWEN's compile-time transforms happen entirely in the `transform` hook. The general shape
of every transform plugin in this codebase:

```typescript
import { walk } from 'oxc-walker';
import { parseSource } from './oxc/parse.js';
import MagicString from 'magic-string';
import type { Plugin } from 'vite';

export function myTransformPlugin(): Plugin {
  return {
    name: 'gwen:my-transform',
    enforce: 'pre', // run before TypeScript compilation

    transform(code: string, id: string) {
      // 1. Fast bail-out — skip files that cannot contain the pattern
      //    Use a simple string.includes() check before parsing
      if (!code.includes('myPattern')) return null;
      if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;

      // 2. Parse with OXC
      const parsed = parseSource(id, code);
      if (!parsed) return null; // fatal parse error — skip silently

      // 3. Prepare MagicString for position-based mutations
      const s = new MagicString(code);

      // 4. Walk the AST — use oxc-walker, not a custom traversal
      walk(parsed.program, {
        enter(node) {
          // Type narrowing via node.type check
          if (node.type !== 'CallExpression') return;
          // ... detect and record positions
          // Process mutations in reverse order later, or use prependLeft/appendRight
          // which are safe to call in any order
        },
      });

      // 5. Return null if nothing changed
      if (!s.hasChanged()) return null;

      // 6. Return transformed code + source map
      return {
        code: s.toString(),
        map: s.generateMap({ hires: true, source: id, includeContent: true }),
      };
    },
  };
}
```

### The Fast Bail-Out Pattern

Parsing is fast (~0.1ms for typical files), but it is still work. Use a string pre-check
to skip files that cannot possibly contain the target pattern before parsing:

```typescript
// Good — skip before parsing
if (!code.includes('defineSystem')) return null;
if (!code.includes('useQuery')) return null;

// Only parse if the string check passes
const parsed = parseSource(id, code);
```

This is safe because:
- If the string `'useQuery'` does not appear in the file, the AST cannot contain a
  `useQuery` call expression
- String search is O(n) with SIMD acceleration — faster than any AST walk

### The `buildStart` Hook for Cross-File State

Some transforms need information that spans multiple files — for example, the component
manifest needs all `defineComponent` calls from the entire project before it can resolve
a typeId for a specific component name.

Use the `buildStart` Vite hook to build this cross-file state:

```typescript
export function gwenOptimizerPlugin(): Plugin {
  const manifest = new ComponentManifest();
  let root = process.cwd();

  return {
    name: 'gwen:optimizer',

    configResolved(config) {
      root = config.root; // capture project root after Vite resolves config
    },

    async buildStart() {
      // Rebuild the manifest from scratch every time
      // (handles file deletions and HMR server restarts cleanly)
      manifest.clear();
      const files = findComponentFiles(`${root}/src`);
      const scanner = new ComponentScanner(manifest);
      scanner.scanFiles(files);
    },

    transform(code, id) {
      // manifest is now populated — can resolve typeIds
      const entry = manifest.get('Position'); // { typeId: 1, f32Stride: 2, ... }
    },
  };
}
```

---

## 6. Existing Plugins and What They Do

All GWEN Vite sub-plugins live in `packages/vite/src/plugins/`. Each one is narrow
in scope and handles a single concern.

| Plugin | File | What it transforms |
|---|---|---|
| `gwen:wasm` | `wasm.ts` | Serves / inlines the `.wasm` binary; HMR on `.rs` changes |
| `gwen:actor` | `actor.ts` | Injects `__actorName__` / `__prefabName__` debug metadata into `defineActor` / `definePrefab` calls |
| `gwen:layout` | `layout.ts` | Injects `__layoutName__` into `defineLayout`; generates `virtual:gwen/layouts` |
| `gwen:tween` | `tween.ts` | Detects which `EasingName` literals are used; generates `virtual:gwen/used-easings` for tree-shaking |
| `gwen:auto-imports` | `auto-imports.ts` | Inserts missing `@gwenjs/core` named imports |
| `gwen:types` | `types-writer.ts` | Writes `.d.ts` type templates into `.gwen/types/` at build start |
| `gwen:scene-router` | `scene-router.ts` | Generates the scene registry virtual module |
| `gwen:optimizer` | `optimizer.ts` | (**opt-in**) Transforms `useQuery + onUpdate` loops into bulk WASM calls |
| `gwen:virtual` | `virtual.d.ts` | Declares virtual module types for TypeScript |

The main `gwenVitePlugin()` in `src/index.ts` composes all sub-plugins. `gwen:optimizer`
is intentionally excluded from the default composition — it is opt-in because it changes
the runtime semantics of optimizable patterns.

---

## 7. Patterns and Recommendations

### Pattern 1 — String Pre-Check → Parse → Walk

Always follow this three-phase structure:

```typescript
// Phase 1: string pre-check (O(n), no allocation)
if (!code.includes('targetFunction')) return null;

// Phase 2: parse (parse once, reuse the AST)
const parsed = parseSource(id, code);
if (!parsed) return null;

// Phase 3: walk (single traversal if possible)
const mutations: Array<{ start: number; end: number; replacement: string }> = [];
walk(parsed.program, {
  enter(node) {
    // collect mutations
  },
});

// Apply mutations in reverse position order
mutations.sort((a, b) => b.start - a.start);
for (const m of mutations) {
  s.overwrite(m.start, m.end, m.replacement);
}
```

### Pattern 2 — Collect Then Apply (Reverse Order)

Never call `s.overwrite()` inside the walker for ranges that might overlap or affect
sibling positions. Collect all intended mutations first, then apply them in reverse
source order (descending `.start`):

```typescript
// ✅ Correct — collect first, apply in reverse
const insertions: Array<{ pos: number; text: string }> = [];
walk(program, {
  enter(node) {
    if (node.type === 'SomeNode') {
      insertions.push({ pos: node.start, text: 'BEFORE ' });
    }
  },
});
insertions.sort((a, b) => b.pos - a.pos); // reverse order
for (const { pos, text } of insertions) {
  s.prependLeft(pos, text);
}

// ⚠️ Risky — applying overwrite inside walker can corrupt subsequent positions
walk(program, {
  enter(node) {
    if (node.type === 'SomeNode') {
      s.overwrite(node.start, node.end, 'replacement'); // may shift positions
    }
  },
});
```

`prependLeft` and `appendRight` are safe to call in any order — they insert at the same
logical position and MagicString concatenates them correctly. `overwrite` and `remove`
must be applied in reverse order if they affect adjacent ranges.

### Pattern 3 — Never Generate Code for What You Don't Understand

If the AST pattern does not match exactly what the transform expects, return `null` and
leave the code untouched. It is better to miss an optimization than to corrupt valid code.

```typescript
// ✅ Conservative — skip if pattern is ambiguous
enter(node) {
  if (node.type !== 'VariableDeclarator') return;
  const { id, init } = node as VariableDeclarator;
  if (id.type !== 'Identifier') return; // destructuring — skip
  if (!init) return; // no initializer — skip
  if (!isCallTo(init, 'defineComponent')) return; // not the function we want — skip
  // Only proceed if we are certain
}
```

### Pattern 4 — Virtual Modules for Cross-File Information

When a transform needs to expose data computed from multiple files (component registry,
scene list, actor list), expose it through a **virtual module** rather than injecting
globals:

```typescript
const VIRTUAL_ID = 'virtual:gwen/components';
const RESOLVED_ID = '\0virtual:gwen/components';

export function componentsPlugin(): Plugin {
  return {
    name: 'gwen:components',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      // Generate the module from the component manifest
      return `export const componentCount = ${manifest.size};\n`;
    },
  };
}
```

The `\0` prefix is a Vite convention that marks an ID as virtual (not a real file path).

### Pattern 5 — `enforce: 'pre'` for Transforms That Produce TypeScript

If your transform produces valid TypeScript that should be type-checked, use
`enforce: 'pre'` to run before Vite's TypeScript compilation step:

```typescript
return {
  name: 'gwen:optimizer',
  enforce: 'pre', // run before tsc / esbuild
  transform(code, id) { ... },
};
```

Use `enforce: 'post'` only for transforms that work on already-compiled JavaScript
(e.g., minification, dead code elimination).

### Pattern 6 — Annotate Skipped Transforms in Debug Mode

When a pattern is detected but cannot be optimized (e.g., component not in manifest,
non-pure loop body), emit a debug log under a flag rather than silently skipping:

```typescript
if (!result.optimizable) {
  if (debug) {
    console.log(`[gwen:optimizer] Skipping ${id}: ${result.reason}`);
  }
  return null;
}
```

This makes it straightforward for users to understand why their system was not optimized.

---

## 8. Writing an External Vite Plugin for GWEN

GWEN's architecture is designed to be extended. External packages — published as
`@scope/gwen-plugin-*` or `gwen-plugin-*` — can contribute Vite plugins that participate
in the same compile-time optimization pipeline.

### 8.1 Plugin Structure

An external GWEN Vite plugin is a standard Vite plugin factory. It should follow the
naming convention `gwen:<scope>` to appear in Vite's debug output alongside the core plugins:

```typescript
// packages/my-plugin/src/vite.ts
import type { Plugin } from 'vite';

export interface MyPluginOptions {
  debug?: boolean;
}

export function myGwenPlugin(options: MyPluginOptions = {}): Plugin {
  return {
    name: 'gwen:my-plugin', // prefix with 'gwen:' by convention
    enforce: 'pre',

    buildStart() {
      // initialize cross-file state
    },

    transform(code, id) {
      // transform source files
    },
  };
}
```

### 8.2 Accessing the OXC Toolchain

Do not re-vendor `oxc-parser` or `oxc-walker` in your plugin. Declare them as peer
dependencies and import them directly:

```json
// package.json of your external plugin
{
  "peerDependencies": {
    "oxc-parser": ">=0.100.0",
    "oxc-walker": ">=0.7.0",
    "magic-string": ">=0.30.0",
    "vite": ">=5.0.0"
  }
}
```

```typescript
// Use the same APIs as core GWEN plugins
import { walk, parseAndWalk } from 'oxc-walker';
import { parseSync } from 'oxc-parser';
import type { Node, VariableDeclarator, CallExpression } from 'oxc-parser';
import MagicString from 'magic-string';
```

### 8.3 Registering with `gwenVitePlugin`

External plugins can be added alongside `gwenVitePlugin()` in the user's Vite config:

```typescript
// vite.config.ts (user's project)
import { defineConfig } from 'vite';
import { gwenVitePlugin } from '@gwenjs/vite';
import { myGwenPlugin } from 'gwen-plugin-my-feature';

export default defineConfig({
  plugins: [
    gwenVitePlugin(),          // core GWEN plugins
    myGwenPlugin({ debug: true }), // your external plugin
  ],
});
```

If your plugin integrates tightly with GWEN (e.g., adds virtual modules that the GWEN
runtime imports), consider shipping a `module.ts` entry that the user adds to their
`gwen.config.ts` modules array — this is the idiomatic integration point for GWEN modules.

### 8.4 Virtual Module Naming

External plugins that expose virtual modules should use a namespaced ID to avoid
conflicts with core GWEN virtual modules:

```typescript
// ✅ Namespaced — no conflict with core GWEN virtual modules
const VIRTUAL_ID = 'virtual:gwen-my-feature/data';

// ❌ Unnamespaced — may conflict with future core additions
const VIRTUAL_ID = 'virtual:gwen/my-feature';
```

Core GWEN virtual modules follow the pattern `virtual:gwen/*`. External modules should
use `virtual:gwen-<package-name>/*` or `virtual:<package-name>/*`.

### 8.5 Source Map Obligations

If your `transform()` hook returns a modified `code` string, it **must** also return
a valid `map`. Failing to do so breaks source maps for any plugin that runs after yours
in the Vite pipeline.

```typescript
// ✅ Always return map when returning code
transform(code, id) {
  const s = new MagicString(code);
  // ... mutations
  if (!s.hasChanged()) return null;
  return {
    code: s.toString(),
    map: s.generateMap({ hires: true, source: id, includeContent: true }),
  };
}

// ❌ Never return transformed code without a map
transform(code, id) {
  const transformed = code.replace(...);
  return { code: transformed }; // broken — no map
}
```

### 8.6 HMR Invalidation

If your plugin produces a virtual module that depends on source files, invalidate it
when those files change:

```typescript
handleHotUpdate({ file, server }) {
  if (!file.endsWith('.my-component.ts')) return;
  const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
  if (mod) {
    server.moduleGraph.invalidateModule(mod);
    server.hot.send({ type: 'full-reload' });
  }
},
```

---

## 9. Pitfalls and Anti-Patterns

### ❌ Regex-Based Code Transforms

Using `String.replace()` or `RegExp.exec()` to transform source code produces
false positives on patterns inside string literals and comments, and breaks on
multi-line patterns:

```typescript
// ❌ Breaks if pattern appears in a string or comment
code.replace(/const\s+(\w+)\s*=\s*defineActor\s*\(/g, ...);

// ✅ Use AST — only matches actual CallExpression nodes
walk(program, {
  enter(node) {
    if (node.type !== 'VariableDeclarator') return;
    // ...
  },
});
```

Reserve regex for the fast bail-out pre-check (`code.includes(...)`) only.
Never use regex for the actual transformation.

### ❌ `as any` in AST Code

Every node type in `@oxc-project/types` is fully typed. Using `as any` defeats the
type checker and introduces bugs when OXC updates its AST shape:

```typescript
// ❌ as any — unsafe
const name = (node as any).id?.name;

// ✅ Proper narrowing — type-safe
if (node.type !== 'VariableDeclarator') return;
const { id } = node as VariableDeclarator;
if (id.type !== 'Identifier') return;
const name = id.name; // string
```

The only acceptable casts are for `StringLiteral` / `NumericLiteral` disambiguation
(both have `type: 'Literal'`) as documented in §3.1.

### ❌ Rebuilding State on Every `transform()` Call

Do not re-scan the entire project on every call to `transform()`. Build cross-file
state once in `buildStart()` and read it in `transform()`:

```typescript
// ❌ Rescans the project on every file transform
transform(code, id) {
  const allComponents = scanProject(process.cwd()); // called thousands of times
}

// ✅ Build state once, read many times
buildStart() {
  this.componentMap = scanProject(config.root);
},
transform(code, id) {
  const entry = this.componentMap.get('Position'); // O(1) lookup
}
```

### ❌ Ignoring the `enforce` Order

If your transform rewrites code that another transform also reads, you must set the
correct `enforce` value. Plugins run in this order:

```
enforce: 'pre'  → normal (no enforce) → enforce: 'post'
```

The `gwen:optimizer` runs with `enforce: 'pre'` because it needs to see the original
TypeScript before any type stripping. If your plugin also runs `pre` and modifies the
same files, add it before or after `gwenOptimizerPlugin` in the config explicitly.

### ❌ Mutating the Input `code` String

Vite passes the `code` string to all `transform()` hooks in sequence. Do not mutate
the original string — always create a `MagicString` from it:

```typescript
// ❌ Never mutate the input
transform(code, id) {
  code = code.replace(...); // breaks source map chaining
}

// ✅ Use MagicString
transform(code, id) {
  const s = new MagicString(code);
  s.overwrite(...);
  return { code: s.toString(), map: s.generateMap(...) };
}
```

### ❌ Skipping `buildStart` State Reset

The `buildStart` hook fires on both initial build and HMR server restart. If you build
cross-file state (manifests, registries), always clear it at the start to avoid stale
entries from deleted files:

```typescript
buildStart() {
  manifest.clear(); // ← always reset first
  scanner.scanFiles(findComponentFiles(root));
},
```

---

## 10. Testing Compile-Time Transforms

### Unit Testing Transform Functions

Transform functions should be testable in isolation — they are pure functions of source
code in and transformed source code out. Test files live in `packages/vite/tests/`.

```typescript
// tests/plugins/actor.test.ts
import { describe, it, expect } from 'vitest';
import { transformActorNames } from '../../src/plugins/actor.js';

describe('transformActorNames', () => {
  it('injects __actorName__ into defineActor calls', () => {
    const input = `const Enemy = defineActor(EnemyPrefab, () => {});`;
    const output = transformActorNames(input);
    expect(output).toContain('__actorName__: "Enemy"');
  });

  it('does not transform patterns inside string literals', () => {
    const input = `const s = "const Foo = defineActor(bar)";`;
    expect(transformActorNames(input)).toBe(input); // unchanged
  });

  it('does not transform patterns inside comments', () => {
    const input = `// const Foo = defineActor(bar)`;
    expect(transformActorNames(input)).toBe(input);
  });

  it('returns original code when no defineActor is present', () => {
    const input = `const x = 1;`;
    expect(transformActorNames(input)).toBe(input);
  });
});
```

### What to Test for Every Transform

Every transform function should have tests for at least these cases:

| Case | What to assert |
|---|---|
| Happy path | Output contains expected generated code |
| Pattern in a string literal | Input is returned unchanged |
| Pattern in a comment | Input is returned unchanged |
| No pattern present | Returns `null` or the original string unchanged |
| Unparseable source | Returns `null` / no exception thrown |
| Source maps | `map` is present when `code` is returned |
| Multiple occurrences | All occurrences are transformed, not just the first |

### Integration Testing the Vite Plugin

For testing the full Vite plugin (including `buildStart` / virtual modules), use
`vite-plugin-test` or simply instantiate the plugin object and call its hooks directly:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { gwenOptimizerPlugin } from '../../src/plugins/optimizer.js';
import type { Plugin } from 'vite';

describe('gwenOptimizerPlugin', () => {
  let plugin: Plugin;

  beforeEach(() => {
    plugin = gwenOptimizerPlugin({ debug: false });
  });

  it('returns null for files without useQuery', async () => {
    const result = await (plugin.transform as Function)(
      `const x = 1;`,
      '/src/systems/test.ts',
    );
    expect(result).toBeNull();
  });

  it('transforms a pure useQuery + onUpdate pattern', async () => {
    await (plugin.buildStart as Function).call({ root: testProjectRoot });
    const result = await (plugin.transform as Function)(
      SYSTEM_WITH_PURE_PATTERN,
      '/src/systems/movement.ts',
    );
    expect(result).not.toBeNull();
    expect(result.code).toContain('queryReadBulk');
    expect(result.code).toContain('queryWriteBulk');
    expect(result.map).toBeDefined();
  });
});
```

### Snapshot Testing for Complex Transforms

For transforms that produce non-trivial output (like the bulk WASM transform), use
Vitest snapshot testing to lock the generated code format:

```typescript
it('generates the expected bulk transform output', async () => {
  const result = await plugin.transform(MOVEMENT_SYSTEM_SOURCE, 'movement.ts');
  expect(result?.code).toMatchSnapshot();
});
```

Update snapshots intentionally with `vitest --update-snapshots` when the code generator
is updated.

---

## Vite 8 + Rolldown

### Async `buildStart` (VITE-06)

Vite 8 uses Rolldown as its unified dev/prod bundler. One consequence: `buildStart` is awaited
during dev server startup, so a slow synchronous scan directly delays the first browser load.

The `ComponentScanner` introduced by VITE-04 reads every TypeScript source file with
`readFileSync` inside a `for` loop. On a project with 50+ component files that can add
50–200 ms of blocking work before the server is ready. Vite 8 documents this explicitly:
_"buildStart should not run long and extensive operations"_.

**Fix applied (VITE-06):** `ComponentScanner.scanFiles` is now `async` and reads files
concurrently via `Promise.allSettled`. `allSettled` (not `Promise.all`) preserves the
original behaviour of silently skipping unreadable files instead of rejecting the entire batch.
Because Node.js is single-threaded, concurrent `readFile` calls share no mutable state and
`manifest.register()` remains safe.

```typescript
// Before (VITE-04) — blocking
scanFiles(files: string[]): void { ... readFileSync ... }

// After (VITE-06) — non-blocking, concurrent
async scanFiles(files: string[]): Promise<void> {
  await Promise.allSettled(files.map(async (f) => {
    const code = await readFile(f, 'utf-8');
    this.scanSource(code, f);
  }));
  this._assignFallbackIds();
}
```

`optimizer.ts` `buildStart` was already `async`; adding `await` before `scanner.scanFiles`
is the only change required there.

### Full Bundle Mode (experimental)

In standard dev mode, Vite serves modules on demand via native ESM — the `transform` hook
is called per browser request. With Rolldown's **Full Bundle Mode** (opt-in in Vite 8), the
dev server bundles modules like a production build: `transform` runs once on the entire bundle,
identical to `vite build`.

Impact for gwen plugins:
- Bulk optimisations (VITE-02) are active **in dev** with Full Bundle Mode.
- `ComponentScanner` (VITE-04/06) is unaffected — `buildStart` fires in both modes.
- Startup times improve (~3× per VoidZero benchmarks) but `buildStart` remains blocking,
  which is why VITE-06 matters.

### Raw AST Transfer (future)

Vite 8 roadmap includes a **Raw AST transfer** mechanism: JS plugins will receive the OXC/Rolldown
Rust AST directly, without re-serialising to JSON. When that lands, `parseSource()` in
`src/oxc/parse.ts` becomes redundant — the AST will arrive natively from the host. At that point
`src/oxc/parse.ts` can be removed and the helpers adapted to consume the Vite-provided AST
directly. Track the Rolldown roadmap for availability.

---

## Summary

| Goal | Mechanism |
|---|---|
| Ergonomic developer API | Write `useComponent`, `useQuery`, `defineActor` as high-level abstractions |
| Optimized build output | Vite `transform` hook rewrites the AST before bundling |
| Accurate source maps | `MagicString` records all edits as position-based mutations |
| Fast AST parsing | `oxc-parser` (~3× faster than Babel) |
| Typed AST traversal | `oxc-walker` — official walker for OXC, provides `walk` + `ScopeTracker` |
| Zero-copy WASM data | `Float32Array` views on WASM linear memory — no serialization |
| Minimal WASM crossings | Bulk APIs: N entities → 2–3 calls per frame |
| Extensibility | Vite plugin architecture — external plugins compose with `gwenVitePlugin()` |
