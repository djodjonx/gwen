# Plugin Code Reorganisation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganise the internal folder structure of all plugin packages using Approach B (adaptive: create a folder only when ≥ 2 files justify it), without changing any public API.

**Architecture:** Each package gets a `plugin/` folder for internal implementation files, a `types/` folder when a large types file is split, keeping `index.ts` as a thin public barrel throughout. Parent barrels (`src/types.ts`, `src/index.ts`) are kept or converted to re-export barrels so that internal imports in `composables/` and `helpers/` require zero or minimal updates.

**Tech Stack:** TypeScript monorepo, pnpm workspaces, Vitest. Verification: `pnpm --filter @gwenjs/<pkg> exec tsc --noEmit` after each task.

**Spec:** `docs/superpowers/specs/2026-04-04-plugin-restructure-design.md`

---

## Baseline

- [ ] **Verify baseline passes**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors on both.

---

## Task 1: `@gwenjs/physics2d` — delete stubs, create `plugin/`, split `types/`

**Files:**
- Delete: `src/helpers-contact.ts`, `src/helpers-movement.ts`, `src/helpers-orchestration.ts`, `src/helpers-queries.ts`, `src/helpers-static-geometry.ts`, `src/tilemap.ts`
- Create: `src/plugin/index.ts`, `src/plugin/ring-buffer.ts`, `src/plugin/shape-component.ts`, `src/plugin/prefab.ts`
- Create: `src/types/index.ts`, `src/types/config.ts`, `src/types/bodies.ts`, `src/types/events.ts`, `src/types/materials.ts`, `src/types/api.ts`, `src/types/tilemap.ts`
- Modify: `src/index.ts` (thin barrel), `src/types.ts` (thin barrel → types/)

### Step 1 — Delete the 6 stub files

```bash
cd packages/physics2d
git rm src/helpers-contact.ts src/helpers-movement.ts src/helpers-orchestration.ts \
        src/helpers-queries.ts src/helpers-static-geometry.ts src/tilemap.ts
```

### Step 2 — Create the `plugin/` folder and move 3 internal files

```bash
mkdir -p src/plugin
git mv src/ring-buffer.ts   src/plugin/ring-buffer.ts
git mv src/shape-component.ts src/plugin/shape-component.ts
git mv src/prefab.ts        src/plugin/prefab.ts
```

### Step 3 — Extract the plugin implementation from `src/index.ts` into `src/plugin/index.ts`

`src/index.ts` currently contains the `Physics2DPlugin` implementation between the markers:
- Start: `// ─── Internal types ──` (line ~29) through to `// ─── Module, composables & type augmentations ─` (line ~517)

Create `src/plugin/index.ts` with that block (lines ~1–516 of index.ts minus the re-export tail). The file must start with:

```ts
/// <reference types="vite/client" />
import { definePlugin } from '@gwenjs/kit';
// ... (all existing imports from current index.ts top section)
import { ContactRingBuffer, CONTACT_EVENT_BYTES, RING_CAPACITY } from './ring-buffer.js';
import { ShapeComponent } from './shape-component.js';
import { extendPhysicsPrefab } from './prefab.js';
```

And end with:

```ts
export const Physics2DPlugin = definePlugin(/* ... */);
export const Physics2D = Physics2DPlugin;
export function physics2D(config: Physics2DConfig = {}) { /* ... */ }
```

> Note: in `src/index.ts` the plugin was defined inline. After this step, `index.ts` re-exports from `./plugin/index.js` instead.

### Step 4 — Rewrite `src/index.ts` as a thin barrel

Replace the entire content of `src/index.ts` with:

```ts
export { Physics2DPlugin, Physics2D, physics2D } from './plugin/index.js';
export { ShapeComponent } from './plugin/shape-component.js';
export type { ShapeData } from './plugin/shape-component.js';
export { ContactRingBuffer, CONTACT_EVENT_BYTES, RING_CAPACITY } from './plugin/ring-buffer.js';
export { physics2dVitePlugin } from './vite-plugin.js';
export * from './augment.js';
export { usePhysics2D, useRigidBody, useCollider } from './composables.js';
export { default as physics2dModule } from './module.js';
export {
  buildTilemapPhysicsChunks,
  patchTilemapPhysicsChunk,
} from './helpers/tilemap.js';
export type {
  PhysicsKinematicSyncSystemOptions,
  PlatformerGroundedSystemOptions,
} from './systems.js';
export {
  createPhysicsKinematicSyncSystem,
  createPlatformerGroundedSystem,
} from './systems.js';
export * from './composables/index.js';
export * from './helpers/index.js';
export * from './types.js';
export { default } from './module.js';
```

> Check the current barrel tail of index.ts (lines ~517–555) to ensure all existing re-exports are preserved.

### Step 5 — Create the `types/` folder

```bash
mkdir -p src/types
```

Create each file by cutting from `src/types.ts`. Use the section markers (`// ─── …`) as natural boundaries:

**`src/types/config.ts`** — lines 1–80 of types.ts (`// ─── Config` → before `// ─── Body & Collider`):
```ts
// ─── Config ───────────────────────────────────────────────────────────────────
export type PhysicsQualityPreset = 'low' | 'medium' | 'high' | 'esport';
export type PhysicsEventMode = 'pull' | 'hybrid';
export const PHYSICS_QUALITY_PRESET_CODE: Record<PhysicsQualityPreset, number> = { /* ... */ };
export interface Physics2DConfig { /* ... */ }
```

**`src/types/bodies.ts`** — `// ─── Body & Collider` section (lines ~81–130) + `// ─── RFC-04 composable types` section (lines ~311–443):
```ts
// ─── Body & Collider ──────────────────────────────────────────────────────────
export type RigidBodyType = 'fixed' | 'dynamic' | 'kinematic';
export const BODY_TYPE: Record<RigidBodyType, number> = { /* ... */ };
export interface ColliderOptions { /* ... */ }
// ... + StaticBodyOptions, DynamicBodyOptions, handles, ContactEvent, LayerDefinition
```

**`src/types/events.ts`** — `// ─── Collision events`, `// ─── Enriched collision contact`, `// ─── Sensor state` (lines ~131–236):
```ts
export interface CollisionEvent { /* ... */ }
export interface CollisionEventsBatch { /* ... */ }
export interface CollisionContact { /* ... */ }
export interface SensorState { /* ... */ }
```

**`src/types/materials.ts`** — `// ─── Hooks provided by this plugin` + `// ─── Prefab extensions` + materials (lines ~237–310):
```ts
export interface Physics2DPluginHooks { /* ... */ }
export interface PhysicsMaterialPreset { /* ... */ }
export type PhysicsMaterialPresetName = /* ... */;
export const PHYSICS_MATERIAL_PRESETS: Record</* ... */> = { /* ... */ };
export type PhysicsColliderShape = /* ... */;
```

**`src/types/tilemap.ts`** — `// ─── Tilemap chunks` section (lines ~444–628):
```ts
export const TILEMAP_PHYSICS_CHUNK_FORMAT_VERSION = 1;
export interface TilemapChunkRect { /* ... */ }
// ... all tilemap types + PHYSICS2D_BRIDGE_SCHEMA_VERSION, event stride constants
```

**`src/types/api.ts`** — Event parsing + Physics2DAPI + WASM module types (lines ~629–926):
```ts
export function readCollisionEventsFromBuffer(/* ... */): CollisionEvent[] { /* ... */ }
export interface Physics2DAPI { /* ... */ }
export interface Physics2DWasmModule { /* ... */ }
export interface WasmPhysics2DPlugin { /* ... */ }
```

**`src/types/index.ts`** — re-exports everything:
```ts
export * from './config.js';
export * from './bodies.js';
export * from './events.js';
export * from './materials.js';
export * from './tilemap.js';
export * from './api.js';
```

### Step 6 — Rewrite `src/types.ts` as a thin barrel

Replace the entire content of `src/types.ts` with:

```ts
export * from './types/index.js';
```

This keeps all existing `import { ... } from '../types.js'` imports in `composables/` and `helpers/` valid — **zero changes needed there**.

### Step 7 — Verify

```bash
cd /path/to/gwen
pnpm --filter @gwenjs/physics2d exec tsc --noEmit
```

Expected: 0 errors.

### Step 8 — Commit

```bash
git add packages/physics2d/
git commit -m "refactor(physics2d): create plugin/ and types/ folders, delete stubs"
```

---

## Task 2: `@gwenjs/physics3d` — split `index.ts` (2211L) into `plugin/`, split `types/`

**Files:**
- Move: `src/bvh-worker.ts` → `src/plugin/bvh-worker.ts`
- Create: `src/plugin/constants.ts`, `src/plugin/bridge.ts`, `src/plugin/bvh.ts`, `src/plugin/index.ts`, `src/plugin/ring-buffer.ts`
- Create: `src/types/index.ts`, `src/types/config.ts`, `src/types/bodies.ts`, `src/types/colliders.ts`, `src/types/bulk.ts`, `src/types/events.ts`, `src/types/api.ts`
- Modify: `src/index.ts` (thin barrel), `src/types.ts` (thin barrel → types/)

### Step 1 — Create `plugin/` and move `bvh-worker.ts` and `ring-buffer.ts`

```bash
cd packages/physics3d
mkdir -p src/plugin
git mv src/bvh-worker.ts    src/plugin/bvh-worker.ts
git mv src/ring-buffer.ts   src/plugin/ring-buffer.ts
```

### Step 2 — Create `src/plugin/constants.ts`

Cut from `src/index.ts` lines 57–73 (`// ─── Constants` section):

```ts
/** Byte stride of one collision event in the shared ring buffer. */
export const EVENT_STRIDE_3D = 52;

/** Maximum events readable per frame. Matches Rust MAX_COLLISION_EVENTS_3D. */
export const MAX_EVENTS_3D = 256;

/** Sentinel value indicating an absent collider id (u16::MAX). */
export const COLLIDER_ID_ABSENT = 65535;
```

### Step 3 — Create `src/plugin/bridge.ts`

Cut from `src/index.ts` lines 158–451 (`// ─── Plugin metadata` + `// ─── Internal types` sections, containing the `Physics3DWasmBridge` interface and supporting internal types):

```ts
// ─── Plugin metadata ────────────────────────────────────────────────────────────
// ─── Internal types ─────────────────────────────────────────────────────────────
/** Internal shape of WASM exports available in the physics3d variant. */
export interface Physics3DWasmExports { /* ~270 lines */ }
/** Minimal bridge runtime shape returned by getWasmBridge(). */
export interface Physics3DBridgeRuntime { /* ... */ }
```

### Step 4 — Create `src/plugin/bvh.ts`

Cut from `src/index.ts`:
- Lines 75–157: `// ─── BVH fetch cache` + `// ─── BVH worker (module-level — lazy singleton)` sections
- Lines 2082–2154: `// ─── preloadMeshCollider` section (PreloadedBvhHandle interface + preloadMeshCollider function)

The file imports from `./bvh-worker.js` (relative to plugin/):

```ts
import type { BvhWorkerRequest, BvhWorkerResponse } from './bvh-worker.js';
import { EVENT_STRIDE_3D } from './constants.js';

// ─── BVH fetch cache ─────────────────────────────────────────────────────────
const _bvhCache = new Map<string, Promise<ArrayBuffer>>();
export function _clearBvhCache(): void { /* ... */ }

// ─── BVH worker singleton ────────────────────────────────────────────────────
/* ... worker singleton logic ... */

// ─── preloadMeshCollider ─────────────────────────────────────────────────────
export interface PreloadedBvhHandle { /* ... */ }
export function preloadMeshCollider(url: string): PreloadedBvhHandle { /* ... */ }
```

### Step 5 — Create `src/plugin/index.ts`

Cut from `src/index.ts` lines 452–2081 (`// ─── Plugin implementation` section through utility functions). Add imports at the top:

```ts
import { definePlugin } from '@gwenjs/kit';
import { EVENT_STRIDE_3D, MAX_EVENTS_3D, COLLIDER_ID_ABSENT } from './constants.js';
import type { Physics3DWasmExports, Physics3DBridgeRuntime } from './bridge.js';
import { _clearBvhCache, preloadMeshCollider, getBvhWorker } from './bvh.js';
import { ContactRingBuffer3D, RING_CAPACITY_3D } from './ring-buffer.js';
import type { Physics3DConfig } from '../types.js';
// ... remaining imports from the current index.ts top block
```

End of file exports:
```ts
export const Physics3DPlugin = /* definePlugin(...) */;
export { Physics3DPlugin as default };
```

### Step 6 — Rewrite `src/index.ts` as a thin barrel

The current index.ts lines ~2155–2211 already contain the public re-exports. Replace the entire file with those re-exports plus re-exports from the new plugin files:

```ts
/// <reference types="vite/client" />
export { Physics3DPlugin, default } from './plugin/index.js';
export { _clearBvhCache, preloadMeshCollider } from './plugin/bvh.js';
export type { PreloadedBvhHandle } from './plugin/bvh.js';
export { EVENT_STRIDE_3D, MAX_EVENTS_3D, COLLIDER_ID_ABSENT } from './plugin/constants.js';
export { ContactRingBuffer3D, CONTACT_EVENT_FLOATS, RING_CAPACITY_3D } from './plugin/ring-buffer.js';
export { physics3dVitePlugin, createGwenPhysics3DPlugin } from './vite-plugin.js';
export * from './augment.js';
export { usePhysics3D } from './composables.js';
export { default as physics3dModule } from './module.js';
export * from './composables/index.js';
export * from './helpers/contact.js';
export * from './helpers/movement.js';
export * from './helpers/queries.js';
export * from './systems.js';
export { normalizePhysics3DConfig, QUALITY_PRESETS } from './config.js';
export * from './types.js';
export type { BulkStaticBoxesOptions, BulkStaticBoxesResult } from './types.js';
```

> Diff against the original re-export tail (lines 2155–2211) to ensure nothing is missing.

### Step 7 — Update `use-mesh-collider.ts` import

The only composable that imports `PreloadedBvhHandle` from `'../index.js'` — this continues to work since `index.ts` re-exports it. **No change needed.**

### Step 8 — Create the `types/` folder

```bash
mkdir -p src/types
```

**`src/types/config.ts`** — lines 1–100 (`// ─── Primitive types` + `// ─── Config` sections):
```ts
export interface Physics3DVec3 { x: number; y: number; z: number }
export interface Physics3DQuat { x: number; y: number; z: number; w: number }
export type Physics3DQualityPreset = 'low' | 'medium' | 'high' | 'esport';
export const QUALITY_PRESETS: Record<Physics3DQualityPreset, number> = { /* ... */ };
export interface Physics3DConfig { /* ... */ }
export interface ResolvedPhysics3DConfig { /* ... */ }
```

**`src/types/bodies.ts`** — `// ─── Entity ID` + `// ─── Body` sections (lines ~100–213) + `// ─── RFC-06 DX Composable types` body part (lines ~870–1007):
```ts
export type Physics3DEntityId = string | number | bigint;
export type Physics3DBodyKind = 'dynamic' | 'kinematic' | 'fixed';
export interface Physics3DBodyOptions { /* ... */ }
export interface Physics3DBodyHandle { /* ... */ }
// ... + StaticBodyOptions3D, DynamicBodyOptions3D, StaticBodyHandle3D, DynamicBodyHandle3D
```

**`src/types/colliders.ts`** — `// ─── Colliders` section (lines ~214–330) + RFC-06/07 collider handle types (lines ~1005–1194):
```ts
export type Physics3DColliderShape = /* ... */;
export type Physics3DMaterialPreset = /* ... */;
export const PHYSICS3D_MATERIAL_PRESETS: Record</* ... */> = { /* ... */ };
export interface Physics3DColliderOptions { /* ... */ }
export interface ColliderHandle3D { /* ... */ }
// ... BoxColliderHandle3D, SphereColliderHandle3D, MeshColliderHandle3D, ConvexColliderHandle3D,
//     CompoundColliderOptions3D, CompoundColliderHandle3D, HeightfieldColliderHandle3D
```

**`src/types/bulk.ts`** — `// ─── Bulk spawn` section (lines ~331–366):
```ts
export interface BulkStaticBoxesOptions { /* ... */ }
export interface BulkStaticBoxesResult { /* ... */ }
```

**`src/types/events.ts`** — `// ─── Sensor` + `// ─── Collision events` + `// ─── Prefab extension` + `// ─── Plugin hooks` sections (lines ~367–457):
```ts
export interface Physics3DSensorState { /* ... */ }
export interface Physics3DCollisionContact { /* ... */ }
export interface Physics3DPrefabExtension { /* ... */ }
export interface Physics3DPluginHooks { /* ... */ }
```

**`src/types/api.ts`** — `// ─── Service API` section (lines ~459–869) + `ContactEvent3D` (line ~881):
```ts
export interface Physics3DAPI { /* ~400 lines */ }
export interface ContactEvent3D { /* ... */ }
```

**`src/types/index.ts`**:
```ts
export * from './config.js';
export * from './bodies.js';
export * from './colliders.js';
export * from './bulk.js';
export * from './events.js';
export * from './api.js';
```

### Step 9 — Rewrite `src/types.ts` as a thin barrel

```ts
export * from './types/index.js';
```

All `import from '../types.js'` in `composables/` stay valid — zero changes needed.

### Step 10 — Verify

```bash
cd /path/to/gwen
pnpm --filter @gwenjs/physics3d exec tsc --noEmit
```

Expected: 0 errors.

### Step 11 — Commit

```bash
git add packages/physics3d/
git commit -m "refactor(physics3d): split 2211-line index.ts into plugin/ and types/"
```

---

## Task 3: `@gwenjs/renderer-canvas2d` — create `plugin/`

**Files:**
- Move: `src/renderer.ts` → `src/plugin/renderer.ts`, `src/shapes.ts` → `src/plugin/shapes.ts`
- Create: `src/plugin/index.ts`
- Modify: `src/index.ts` (thin barrel)

### Step 1 — Move files

```bash
cd packages/renderer-canvas2d
mkdir -p src/plugin
git mv src/renderer.ts src/plugin/renderer.ts
git mv src/shapes.ts   src/plugin/shapes.ts
```

### Step 2 — `renderer.ts` already IS `definePlugin` — no extraction needed

`renderer.ts` (515L) contains `Canvas2DRenderer = definePlugin(...)` directly. `src/index.ts` is already a thin barrel. We only need to update the import paths:

```ts
// src/index.ts — update two lines:
// Before:
export { Canvas2DRenderer } from './renderer';
export { ShapeRenderer } from './shapes';
// After:
export { Canvas2DRenderer } from './plugin/renderer.js';
export { ShapeRenderer } from './plugin/shapes.js';
```

### Step 3 — Verify

```bash
pnpm --filter @gwenjs/renderer-canvas2d exec tsc --noEmit
```

Expected: 0 errors.

### Step 4 — Commit

```bash
git add packages/renderer-canvas2d/
git commit -m "refactor(renderer-canvas2d): move renderer + shapes into plugin/"
```

---

## Task 4: `@gwenjs/input` — create `plugin/`

**Files:**
- Move: `src/keyboard.ts` → `src/plugin/keyboard.ts`, `src/mouse.ts` → `src/plugin/mouse.ts`, `src/gamepad.ts` → `src/plugin/gamepad.ts`
- Move: `src/mapping/InputMapper.ts` → `src/plugin/mapping/InputMapper.ts`, `src/mapping/types.ts` → `src/plugin/mapping/types.ts`
- Create: `src/plugin/index.ts`
- Modify: `src/index.ts`

### Step 1 — Move device files and mapping

```bash
cd packages/input
mkdir -p src/plugin/mapping
git mv src/keyboard.ts           src/plugin/keyboard.ts
git mv src/mouse.ts              src/plugin/mouse.ts
git mv src/gamepad.ts            src/plugin/gamepad.ts
git mv src/mapping/InputMapper.ts src/plugin/mapping/InputMapper.ts
git mv src/mapping/types.ts       src/plugin/mapping/types.ts
rmdir src/mapping
```

### Step 2 — Extract `definePlugin` into `src/plugin/index.ts`

Move the plugin implementation from `src/index.ts` to `src/plugin/index.ts`. Update internal imports:

```ts
import { KeyboardInputSource } from './keyboard.js';
import { MouseInputSource }    from './mouse.js';
import { GamepadInputSource }  from './gamepad.js';
import { InputMapper }         from './mapping/InputMapper.js';
import type { InputMapConfig } from './mapping/types.js';
// ... rest of plugin implementation
export const InputPlugin = definePlugin(/* ... */);
```

### Step 3 — Rewrite `src/index.ts` as a thin barrel

```ts
export { InputPlugin } from './plugin/index.js';
export * from './augment.js';
export { useInput } from './composables.js';
export { default as inputModule } from './module.js';
export * from './constants/keys.js';
export * from './constants/gamepad.js';
// ... any other existing re-exports
```

### Step 4 — Verify

```bash
pnpm --filter @gwenjs/input exec tsc --noEmit
```

Expected: 0 errors.

### Step 5 — Commit

```bash
git add packages/input/
git commit -m "refactor(input): move device files + mapping into plugin/"
```

---

## Task 5: `@gwenjs/sprite-anim` — finish `runtime/` split into `plugin/`

**Files:**
- Move: `src/runtime.ts` → `src/plugin/runtime.ts`, `src/runtime/contracts.ts` → `src/plugin/contracts.ts`
- Create: `src/plugin/index.ts`
- Modify: `src/index.ts`

### Step 1 — Move files

```bash
cd packages/sprite-anim
mkdir -p src/plugin
git mv src/runtime.ts          src/plugin/runtime.ts
git mv src/runtime/contracts.ts src/plugin/contracts.ts
rmdir src/runtime
```

### Step 2 — Update imports inside `src/plugin/runtime.ts`

The moved file previously imported from `./contracts` (relative). Update to:

```ts
import type { /* ... */ } from './contracts.js';
```

### Step 3 — Extract `definePlugin` into `src/plugin/index.ts`

```ts
import { SpriteAnimRuntime } from './runtime.js';
// ... plugin implementation from src/index.ts
export const SpriteAnimPlugin = definePlugin(/* ... */);
```

### Step 4 — Rewrite `src/index.ts` as a thin barrel

```ts
export { SpriteAnimPlugin } from './plugin/index.js';
export * from './augment.js';
export { useSpriteAnim } from './composables.js';
export * from './types.js';
export * from './systems.js';
export { default as spriteAnimModule } from './module.js';
```

### Step 5 — Verify

```bash
pnpm --filter @gwenjs/sprite-anim exec tsc --noEmit
```

Expected: 0 errors.

### Step 6 — Commit

```bash
git add packages/sprite-anim/
git commit -m "refactor(sprite-anim): absorb runtime/ into plugin/, remove dangling folder"
```

---

## Task 6: `@gwenjs/debug` — create `plugin/`

**Files:**
- Move: `src/overlay.ts` → `src/plugin/overlay.ts`, `src/fps-tracker.ts` → `src/plugin/fps-tracker.ts`
- Create: `src/plugin/index.ts`
- Modify: `src/index.ts`

### Step 1 — Move files

```bash
cd packages/debug
mkdir -p src/plugin
git mv src/overlay.ts     src/plugin/overlay.ts
git mv src/fps-tracker.ts src/plugin/fps-tracker.ts
```

### Step 2 — Extract `definePlugin` into `src/plugin/index.ts`

```ts
import { DebugOverlay }  from './overlay.js';
import { FpsTracker }    from './fps-tracker.js';
// ... plugin implementation from src/index.ts
export const DebugPlugin = definePlugin(/* ... */);
```

### Step 3 — Rewrite `src/index.ts` as a thin barrel

```ts
export { DebugPlugin } from './plugin/index.js';
export * from './augment.js';
export { useDebug } from './composables.js';
export * from './types.js';
export { default as debugModule } from './module.js';
```

### Step 4 — Verify

```bash
pnpm --filter @gwenjs/debug exec tsc --noEmit
```

Expected: 0 errors.

### Step 5 — Commit

```bash
git add packages/debug/
git commit -m "refactor(debug): move overlay + fps-tracker into plugin/"
```

---

## Task 7: `@gwenjs/kit-platformer` — create `plugin/`

**Files:**
- Move: `src/plugin.ts` → `src/plugin/index.ts`, `src/input.ts` → `src/plugin/input.ts`, `src/scene-utils.ts` → `src/plugin/scene-utils.ts`, `src/units.ts` → `src/plugin/units.ts`
- Modify: `src/index.ts`, `src/composables.ts`

### Step 1 — Move files

```bash
cd packages/kit-platformer
mkdir -p src/plugin
git mv src/plugin.ts      src/plugin/index.ts
git mv src/input.ts       src/plugin/input.ts
git mv src/scene-utils.ts src/plugin/scene-utils.ts
git mv src/units.ts       src/plugin/units.ts
```

### Step 2 — Update imports in `src/plugin/index.ts` (was `src/plugin.ts`)

The file previously imported from `./input`, `./scene-utils`, `./units`. Update:

```ts
import { /* ... */ } from './input.js';
import { /* ... */ } from './scene-utils.js';
import type { PlatformerUnits } from './units.js';
```

### Step 3 — Update `src/index.ts` references

Any import that referenced `./plugin`, `./input`, `./scene-utils`, or `./units` directly needs updating:

```ts
// Before:
export { PlatformerKitPlugin } from './plugin.js';
export type { PlatformerUnits } from './units.js';
// After:
export { PlatformerKitPlugin } from './plugin/index.js';
export type { PlatformerUnits } from './plugin/units.js';
```

Check `src/composables.ts` and `src/systems/` for any cross-imports of those files and update them too.

### Step 4 — Verify

```bash
pnpm --filter @gwenjs/kit-platformer exec tsc --noEmit
```

Expected: 0 errors.

### Step 5 — Commit

```bash
git add packages/kit-platformer/
git commit -m "refactor(kit-platformer): group plugin implementation files into plugin/"
```

---

## Final Check

- [ ] **Run full monorepo typecheck + lint**

```bash
cd /path/to/gwen && pnpm typecheck && pnpm lint
```

Expected: 0 errors on both.

- [ ] **Run all TS tests**

```bash
pnpm test:ts
```

Expected: all pass (no behaviour changed — this is a pure file reorganisation).

- [ ] **Final commit if any stragglers**

```bash
git add -A && git commit -m "refactor: plugin code reorganisation complete (approach B)"
```
