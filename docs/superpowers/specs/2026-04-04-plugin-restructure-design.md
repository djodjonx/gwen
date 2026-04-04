# Plugin Code Reorganisation — Design Spec

**Date:** 2026-04-04  
**Approach:** B — Adaptive folder structure (dossier créé seulement si ≥ 2 fichiers)  
**Scope:** All plugin packages in `packages/`

---

## Problem

Several plugin packages have accumulated structural issues:

- `physics3d/src/index.ts` is a 2211-line god file (plugin impl + internal bridge types + BVH logic + constants).
- `physics2d/src/types.ts` is 926 lines with no internal organisation.
- `physics2d/src/` has 6 stub re-export files left over from an incomplete migration.
- `sprite-anim/src/runtime.ts` is 956 lines with a split started but never completed.
- `input/src/` mixes plugin implementation with constants and device-specific files at the same level.
- `renderer-canvas2d/src/` puts `renderer.ts` (515L) and `shapes.ts` (374L) at the package root.

---

## Global Canonical Rules (Approach B)

| Rule | Detail |
|------|--------|
| `plugin/` folder | Created when ≥ 2 files implement the plugin internals (not public) |
| `types/` folder | Created when 1 large types file is split into ≥ 2 type files |
| `composables/` folder | Already exists where needed — not created for a single composable file |
| `constants/` folder | Created when ≥ 2 constant files exist |
| Always flat at `src/` | `index.ts`, `module.ts`, `augment.ts`, `vite.ts` (single vite plugin file) |
| `index.ts` | Stays as public barrel — signature never changes |
| `package.json` exports | Keys (public sub-paths) unchanged; values (internal paths) updated |
| `vite-plugin.ts` | Renamed to `vite.ts` everywhere (no folder — single file) |

---

## Per-Package Target Structures

### `@gwenjs/physics2d`

**Changes:**
- Delete 6 stub files: `helpers-contact.ts`, `helpers-movement.ts`, `helpers-orchestration.ts`, `helpers-queries.ts`, `helpers-static-geometry.ts`, `tilemap.ts`
- Rename `vite-plugin.ts` → `vite.ts`
- Extract `plugin/` from `index.ts`: plugin impl, ring-buffer, shape-component, prefab
- Split `types.ts` (926L) into `types/` folder
- Keep `core.ts` flat (public sub-path `./core`, 37L — not worth moving)

```
src/
  index.ts            ← barrel (unchanged public API)
  module.ts · augment.ts · config.ts · core.ts · vite-env.d.ts
  vite.ts             ← renamed from vite-plugin.ts
  composables.ts      ← entry barrel for composables
  composables/        ← unchanged (7 files)
  helpers.ts          ← entry barrel for helpers
  helpers/            ← unchanged (6 files)
  plugin/
    index.ts          ← definePlugin (extracted from index.ts)
    ring-buffer.ts    ← moved
    shape-component.ts← moved
    prefab.ts         ← moved
  types/
    index.ts          ← re-exports all
    config.ts         ← PhysicsQualityPreset, Physics2DConfig
    bodies.ts         ← RigidBodyType, BODY_TYPE, body handles/options
    colliders.ts      ← ColliderOptions, shapes
    events.ts         ← CollisionEvent, CollisionContact, SensorState
    materials.ts      ← PhysicsMaterialPreset, PHYSICS_MATERIAL_PRESETS
    api.ts            ← Physics2DAPI, hooks, prefab extensions
    tilemap.ts        ← tilemap physics types
```

**Exports map changes:** `"./core"` value: `./src/core.ts` (unchanged — stays flat).

---

### `@gwenjs/physics3d`

**Changes:**
- Rename `vite-plugin.ts` → `vite.ts`
- Split `index.ts` (2211L) into `plugin/` folder (4 files)
- Split `types.ts` (1194L) into `types/` folder

```
src/
  index.ts · module.ts · augment.ts · config.ts
  vite.ts             ← renamed from vite-plugin.ts
  composables.ts · composables/ ← unchanged (10 files)
  helpers/            ← unchanged (4 files)
  systems.ts          ← flat (single file)
  plugin/
    index.ts          ← definePlugin (main plugin logic)
    bridge.ts         ← Physics3DWasmBridge internal interface (~270L)
    bvh.ts            ← BVH cache + worker singleton + preloadMeshCollider
    constants.ts      ← EVENT_STRIDE_3D, MAX_EVENTS_3D, COLLIDER_ID_ABSENT, etc.
    ring-buffer.ts    ← moved from src/
  types/
    index.ts          ← re-exports all
    config.ts         ← Physics3DConfig, layer registry
    bodies.ts         ← body types, handles, options
    colliders.ts      ← collider types, options (mesh, convex, BVH, compound, heightfield)
    events.ts         ← contacts, sensors
    materials.ts      ← material presets
    api.ts            ← Physics3DAPI, hooks
    bulk.ts           ← BulkStaticBoxes*
```

**Exports map changes:** `"./vite-plugin"` → `"./vite"` (value: `./src/vite.ts`).

---

### `@gwenjs/input`

**Changes:**
- Extract `plugin/` from `index.ts`: keyboard, mouse, gamepad device files + mapping
- Move `mapping/` into `plugin/mapping/`
- `constants/` already justified (2 existing files: `keys.ts`, `gamepad.ts`)

```
src/
  index.ts · module.ts · augment.ts · composables.ts
  constants/
    keys.ts           ← unchanged
    gamepad.ts        ← unchanged
  plugin/
    index.ts          ← definePlugin (extracted from index.ts)
    keyboard.ts       ← moved
    mouse.ts          ← moved
    gamepad.ts        ← moved (device impl, not the constant file)
    mapping/
      InputMapper.ts  ← moved from src/mapping/
      types.ts        ← moved from src/mapping/
```

---

### `@gwenjs/renderer-canvas2d`

**Changes:**
- Move `renderer.ts` + `shapes.ts` into `plugin/`
- `composables.ts` stays flat (single composable file, no folder needed)

```
src/
  index.ts · module.ts · augment.ts · composables.ts
  plugin/
    index.ts          ← definePlugin (extracted)
    renderer.ts       ← moved
    shapes.ts         ← moved
```

---

### `@gwenjs/sprite-anim`

**Changes:**
- Finish the `runtime/` split: absorb into `plugin/`
- `types.ts` (183L) and `systems.ts` (69L) stay flat (under threshold)

```
src/
  index.ts · module.ts · augment.ts
  composables.ts · systems.ts · types.ts   ← flat
  plugin/
    index.ts          ← definePlugin (extracted)
    runtime.ts        ← SpriteAnimRuntime (from runtime.ts)
    contracts.ts      ← moved from runtime/contracts.ts
```

> `runtime/` directory is removed (absorbed into `plugin/`).

---

### `@gwenjs/debug`

**Changes:**
- Move `overlay.ts` + `fps-tracker.ts` into `plugin/`

```
src/
  index.ts · module.ts · augment.ts · types.ts · composables.ts
  plugin/
    index.ts          ← definePlugin (extracted)
    overlay.ts        ← moved
    fps-tracker.ts    ← moved
```

---

### `@gwenjs/kit-platformer`

**Changes:**
- Group flat plugin-related files into `plugin/`

```
src/
  index.ts · module.ts · augment.ts
  components/  · systems/ · prefabs/ · helpers/   ← unchanged
  plugin/
    index.ts          ← plugin.ts renamed + definePlugin
    input.ts          ← moved
    scene-utils.ts    ← moved
    units.ts          ← moved
```

---

### `@gwenjs/audio` and `@gwenjs/ui`

No changes — packages are too small (< 4 files), Approach B threshold not reached.

---

## Import Impact

| Layer | Impact |
|-------|--------|
| External consumers (`@gwenjs/*` public imports) | **None** — barrel `index.ts` unchanged |
| Sub-path exports (`./core`, `./helpers/*`, etc.) | **None** — public keys unchanged; only internal path values in `package.json` updated |
| Intra-package relative imports | **Updated** — e.g. `'../index.js'` → `'../plugin/index.js'`, `'../types.js'` → `'../types/index.js'` |
| `kit-platformer` imports from `@gwenjs/physics2d` | **None** — sub-path public names unchanged |

---

## Verification Steps (per package)

1. Move/rename/delete files
2. Update all intra-package relative imports
3. Update `package.json` exports map internal paths
4. Run `pnpm --filter @gwenjs/<pkg> exec tsc --noEmit`
5. Run `pnpm lint` — must be 0 errors
6. Final: `pnpm typecheck && pnpm lint` — full monorepo green

---

## Non-Goals

- No changes to `@gwenjs/core`, `@gwenjs/math`, `@gwenjs/schema`, `@gwenjs/vite`, `@gwenjs/cli`
- No API changes — public exports are frozen
- No splitting of `@gwenjs/audio` or `@gwenjs/ui`
- No new functionality
