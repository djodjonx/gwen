# Vite Physics3D Query Optimizer Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a `gwen:physics3d-optimizer` Vite sub-plugin that detects imperative spatial query calls (`physics.castRay`, `physics.castShape`, `physics.overlapShape`) made inside `onUpdate` callbacks and rewrites them to use the zero-copy SAB slot system (`useRaycast`, `useShapeCast`, `useOverlap`).

**Architecture:** New AST walker (`PhysicsQueryWalker`) detects the anti-pattern in `defineSystem` bodies. New code transformer (`applyPhysicsQueryTransform`) rewrites detected patterns using MagicString. Integrated into the existing `gwenOptimizerPlugin` pipeline as an opt-in transform.

**Tech Stack:** oxc-parser, oxc-walker, MagicString, Vite transform hook, TypeScript.

---

## Why This Matters

The composable slot system (`useRaycast`, `useShapeCast`) registers a persistent SAB slot during system `setup()`. The SAB is written by WASM during `physics3d_step` — **zero extra WASM boundary crossings per frame**.

The imperative API (`physics.castRay(...)`) crosses the WASM boundary **once per call per frame**. A system querying 10 entities crosses the boundary 10× per frame = 600× per second at 60fps.

**Anti-pattern (N WASM crossings/frame):**
```typescript
onUpdate(() => {
  for (const e of projectiles) {
    const hit = physics.castRay({ origin: ..., direction: ... });
    if (hit) { ... }
  }
});
```

**Optimized (0 extra WASM crossings/frame):**
```typescript
const ray = useRaycast({ origin: ..., direction: ... });
onUpdate(() => {
  for (const e of projectiles) {
    const hit = ray.result;  // reads from SAB view — no WASM call
    if (hit.hit) { ... }
  }
});
```

---

## Detection Pattern

Detect inside `defineSystem(() => { ... })` bodies:

1. **Phase 1 — Setup scan:** Find `useRaycast`, `useShapeCast`, `useOverlap` calls at the top level of the setup function (correct pattern — no action needed).

2. **Phase 2 — Anti-pattern scan:** Find `physics.castRay`, `physics.castShape`, `physics.overlapShape` calls inside `onUpdate` / `onAfterUpdate` / `onBeforeUpdate` callbacks.

3. **Classification:** For each imperative call found inside an update callback:
   - Extract call arguments (origin, direction, opts)
   - Check if an equivalent `useRaycast` slot already exists at the top level
   - If not: flag as transformable

---

## Transformation

When transformable calls are found, the transformer:

1. **Extracts** the imperative call's configuration
2. **Inserts** a `const _ray_N = useRaycast({ ... })` declaration before the `onUpdate` block (hoisted to setup scope)
3. **Replaces** the imperative call inside the loop with `_ray_N.result`
4. **Generates source maps** via MagicString

```typescript
// Before
onUpdate(() => {
  const hit = physics.castRay({ origin: pos, direction: { x: 0, y: -1, z: 0 } });
});

// After
const _ray_0 = useRaycast({ origin: pos, direction: { x: 0, y: -1, z: 0 } });
onUpdate(() => {
  const hit = _ray_0.result;
});
```

---

## Diagnostic Mode (Phase 1)

Before full rewriting, implement a **diagnostic-only mode** that emits Vite warnings:

```
[gwen:physics3d-optimizer] Anti-pattern detected in src/systems/combat.ts:42
  physics.castRay() called inside onUpdate() — use useRaycast() for zero-copy reads.
  See: https://gwenjs.dev/guide/physics3d-spatial-queries#performance
```

This is the Phase 1 deliverable. Full AST rewriting is Phase 2.

---

## New Files

```
packages/vite/src/plugins/physics3d-optimizer.ts   ← new plugin entry
packages/vite/src/optimizer/physics-walker.ts       ← AST walker for physics patterns
packages/vite/src/optimizer/physics-transformer.ts  ← rewriter (Phase 2)
```

---

## Integration

Export from `packages/vite/src/index.ts`:
```typescript
export { gwenPhysics3DOptimizerPlugin } from './plugins/physics3d-optimizer.js';
```

Usage in vite.config.ts:
```typescript
import { gwenVitePlugin, gwenPhysics3DOptimizerPlugin } from '@gwenjs/vite';

export default defineConfig({
  plugins: [
    gwenVitePlugin(),
    gwenPhysics3DOptimizerPlugin({ mode: 'warn' }),  // Phase 1
    // gwenPhysics3DOptimizerPlugin({ mode: 'transform' }),  // Phase 2
  ],
});
```

---

## Options

```typescript
interface GwenPhysics3DOptimizerOptions {
  /** 'warn' emits Vite diagnostics. 'transform' rewrites the source. @default 'warn' */
  mode?: 'warn' | 'transform';
  /** Verbose logging of detected patterns. @default false */
  debug?: boolean;
  /** Directories to scan. @default ['src'] */
  include?: string[];
}
```

---

## Tests

- `PhysicsQueryWalker`: detects imperative `castRay` inside `onUpdate` — returns flagged pattern
- `PhysicsQueryWalker`: does NOT flag `castRay` at setup level
- `PhysicsQueryWalker`: does NOT flag `useRaycast` (already optimized)
- Plugin in `warn` mode: emits Vite warning with correct file+line
- Plugin in `transform` mode: hoists `useRaycast` correctly (Phase 2)
- Source maps are valid after transform (Phase 2)

---

## Non-Goals

- No change to the ECS optimizer (`gwen:optimizer`)
- No batching of multiple raycast calls into a single WASM call (separate RFC)
- No optimization of `onContact` / sensor events
