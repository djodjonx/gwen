# RFC-06 — Physics 3D DX Composables

## Status
`draft`

## Summary

Mirror RFC-04 (Physics DX) for `@gwenjs/physics3d`. Add high-level composables
(`useStaticBody`, `useDynamicBody`, `useBoxCollider`, `useSphereCollider`,
`useCapsuleCollider`, `onContact`, `onSensorEnter`, `onSensorExit`,
`defineLayers`) with 3D-native implementations, update `module.ts` with
auto-imports and a `gwen:physics3d` Vite optimizer, and ensure structural
TypeScript compatibility with `@gwenjs/physics2d` so games can swap physics
packages by changing one import in `gwen.config.ts`.

---

## Motivation

`@gwenjs/physics3d` currently exposes only `usePhysics3D()` — the raw API service.
Developers must call low-level methods (`physics.createBody`, `physics.addCollider`)
instead of using composables like their 2D counterparts (post-RFC-04).

**RFC-06 brings `@gwenjs/physics3d` to full DX parity with `@gwenjs/physics2d`.**

```typescript
// ✅ Same composable names, 3D implementations
// Import @gwenjs/physics3d in gwen.config.ts, then in actors:

const EnemyActor = defineActor(EnemyPrefab, () => {
  const body = useDynamicBody({ mass: 75, fixedRotation: false })
  useBoxCollider({ w: 0.6, h: 1.8, d: 0.6, layer: Layers.enemy })

  onContact((e) => {
    if (e.relativeVelocity > 5) emit('enemy:hit', { enemyId: currentEntityId })
  })
})
// ↑ This exact code works with BOTH physics2d (2D game) and physics3d (3D game)
//   just by swapping the module in gwen.config.ts
```

---

## Existing `@gwenjs/physics3d` Foundation

The package already has:
- `Physics3DAPI` — full low-level API (createBody, addCollider, applyForce…)
- `Physics3DBodyHandle` — body manipulation
- `Physics3DColliderOptions` — shape definitions (box, sphere, capsule, mesh, convex)
- `Physics3DConfig` — gravity, quality presets, layer definitions
- `Physics3DCollisionContact` — contact event shape
- `Physics3DSensorState` — sensor enter/exit states
- `module.ts` with `defineGwenModule` (currently only exports `usePhysics3D`)
- `Physics3DPluginHooks` — `physics3d:step`, `physics3d:collisionStart`, `physics3d:collisionEnd`

RFC-06 **wraps** these existing APIs into composables — no new Rust/WASM work needed.

---

## Design Principles (same as RFC-04)

1. **Self-contained** — `@gwenjs/physics3d` owns all composables, types, and Vite plugin.
2. **Convention mirror** — composable names match RFC-04 exactly for structural compatibility.
3. **3D-native** — `d` dimension is first-class (not optional like in physics2d).
4. **Module-first** — everything auto-imported via `module.ts`.
5. **No core dependency** — composables call `useEngine().tryInject('physics3d')` directly.

---

## New Composables

### `useStaticBody(options?)`

```typescript
export interface StaticBodyOptions3D {
  shape?: Physics3DColliderShape
  layer?: number
  mask?: number
  isSensor?: boolean
  material?: Physics3DMaterialPreset
}

export interface StaticBodyHandle3D {
  readonly bodyId: number
  readonly active: boolean
  enable(): void
  disable(): void
}

export function useStaticBody(options?: StaticBodyOptions3D): StaticBodyHandle3D
```

Reads `Shape` component `{ w, h, d }` if present; otherwise defaults to
`Physics3DColliderShape = 'box'` with dimensions from `useTransform`.

---

### `useDynamicBody(options?)`

```typescript
export interface DynamicBodyOptions3D {
  shape?: Physics3DColliderShape
  layer?: number
  mask?: number
  mass?: number
  linearDamping?: number
  angularDamping?: number
  /** If true, body cannot rotate. @default false */
  fixedRotation?: boolean
  gravityScale?: number
  material?: Physics3DMaterialPreset
  /** Quality preset for CCD (continuous collision detection). @default 'medium' */
  quality?: Physics3DQualityPreset
}

export interface DynamicBodyHandle3D {
  readonly bodyId: number
  applyForce(fx: number, fy: number, fz: number): void
  applyImpulse(ix: number, iy: number, iz: number): void
  applyTorque(tx: number, ty: number, tz: number): void
  setVelocity(vx: number, vy: number, vz: number): void
  readonly velocity: Physics3DVec3
  readonly angularVelocity: Physics3DVec3
  enable(): void
  disable(): void
}

export function useDynamicBody(options?: DynamicBodyOptions3D): DynamicBodyHandle3D
```

---

### Collider composables

```typescript
// Box — d is first-class in 3D (required or inferred from Shape)
export function useBoxCollider(options: {
  w: number; h: number
  d?: number           // optional for 2D compat; defaults to w if omitted
  offsetX?: number; offsetY?: number; offsetZ?: number
  isSensor?: boolean; layer?: number; mask?: number
  material?: Physics3DMaterialPreset
}): BoxColliderHandle3D

// Sphere — true 3D sphere
export function useSphereCollider(options: {
  radius: number
  offsetX?: number; offsetY?: number; offsetZ?: number
  isSensor?: boolean; layer?: number; mask?: number
  material?: Physics3DMaterialPreset
}): SphereColliderHandle3D

// Capsule — vertical by default
export function useCapsuleCollider(options: {
  radius: number; height: number
  /** Axis the capsule is aligned to. @default 'y' */
  axis?: 'x' | 'y' | 'z'
  offsetX?: number; offsetY?: number; offsetZ?: number
  isSensor?: boolean; layer?: number; mask?: number
  material?: Physics3DMaterialPreset
}): CapsuleColliderHandle3D

// Mesh collider — for static complex geometry (trimesh)
export function useMeshCollider(options: {
  /** Vertex positions as flat Float32Array [x,y,z, x,y,z, ...] */
  vertices: Float32Array
  /** Triangle indices as Uint32Array [i0,i1,i2, ...] */
  indices: Uint32Array
  isSensor?: boolean; layer?: number; mask?: number
}): MeshColliderHandle3D

// Convex hull — for dynamic complex objects
export function useConvexCollider(options: {
  vertices: Float32Array
  isSensor?: boolean; layer?: number; mask?: number
  material?: Physics3DMaterialPreset
}): ConvexColliderHandle3D
```

`useMeshCollider` and `useConvexCollider` are **3D-only** — no 2D equivalent.
They are not in the structural compatibility contract with physics2d.

---

### `defineLayers(definition)`

Identical API to RFC-04, inlined by `gwen:physics3d` Vite plugin.

```typescript
export const Layers = defineLayers({
  player:    1 << 0,
  enemy:     1 << 1,
  wall:      1 << 2,
  trigger:   1 << 3,
  vehicle:   1 << 4,
  ragdoll:   1 << 5,
})

useBoxCollider({ w: 1, h: 2, d: 1, layer: Layers.player, mask: Layers.wall | Layers.enemy })
```

---

### `onContact(callback)`

```typescript
export interface ContactEvent3D {
  entityA: bigint
  entityB: bigint
  contactX: number; contactY: number; contactZ: number
  normalX: number; normalY: number; normalZ: number
  relativeVelocity: number
  /** Restitution (bounciness) at contact. */
  restitution: number
}

export function onContact(callback: (contact: ContactEvent3D) => void): void
```

---

### `onSensorEnter` / `onSensorExit`

Identical API to RFC-04:

```typescript
export function onSensorEnter(sensorId: number, callback: (entityId: bigint) => void): void
export function onSensorExit(sensorId: number, callback: (entityId: bigint) => void): void
```

---

## Structural Compatibility Contract with `@gwenjs/physics2d`

The following composables have **identical signatures** in both packages,
enabling structural TypeScript compatibility for 2D↔3D game swap:

| Composable | 2D compat | Note |
|-----------|-----------|------|
| `useStaticBody(opts?)` | ✅ | `d` ignored in 2D |
| `useDynamicBody(opts?)` | ✅ | `applyForce(x,y,z)` — z ignored in 2D |
| `useBoxCollider({ w, h, d? })` | ✅ | `d` optional for 2D compat |
| `useSphereCollider({ radius })` | ✅ | circle in 2D, sphere in 3D |
| `useCapsuleCollider({ radius, height })` | ✅ | same shape |
| `defineLayers({...})` | ✅ | identical |
| `onContact(cb)` | ✅ | z fields ignored in 2D |
| `onSensorEnter(id, cb)` | ✅ | identical |
| `onSensorExit(id, cb)` | ✅ | identical |
| `useMeshCollider` | ❌ | 3D only |
| `useConvexCollider` | ❌ | 3D only |
| `body.applyTorque()` | ❌ | 3D only |

**Type test** — verified at CI:
```typescript
// packages/physics3d/tests/compat.type-test.ts
import type {
  useStaticBody as use2DStatic,
  useBoxCollider as use2DBox,
} from '@gwenjs/physics2d'

import type {
  useStaticBody as use3DStatic,
  useBoxCollider as use3DBox,
} from '@gwenjs/physics3d'

// Both must accept the same options shape
type _1 = Parameters<typeof use2DStatic>[0] extends Parameters<typeof use3DStatic>[0] ? true : never
type _2 = Parameters<typeof use3DBox>[0] extends Parameters<typeof use2DBox>[0] ? true : never
```

---

## Vite Plugin: `gwen:physics3d`

Mirrors `gwen:physics2d` (RFC-04):

1. **Layer inlining** — `Layers.enemy` → `2` at build time
2. **Bulk spawn detection** — `useBoxCollider + useStaticBody` batch → `bulk_spawn_with_colliders_3d`
3. **Mesh collider pre-processing** — detects static `useMeshCollider({ vertices, indices })` literals
   → pre-computes trimesh WASM data at build time → ships as binary buffer

```typescript
// Registered in module.ts:
kit.addVitePlugin(physics3dVitePlugin())
```

---

## Module Registration (updated `module.ts`)

```typescript
async setup(options, kit) {
  kit.addPlugin(Physics3DPlugin(options))

  kit.addAutoImports([
    { name: 'usePhysics3D',       from: '@gwenjs/physics3d' },
    // RFC-06 additions:
    { name: 'useStaticBody',      from: '@gwenjs/physics3d' },
    { name: 'useDynamicBody',     from: '@gwenjs/physics3d' },
    { name: 'useBoxCollider',     from: '@gwenjs/physics3d' },
    { name: 'useSphereCollider',  from: '@gwenjs/physics3d' },
    { name: 'useCapsuleCollider', from: '@gwenjs/physics3d' },
    { name: 'useMeshCollider',    from: '@gwenjs/physics3d' },
    { name: 'useConvexCollider',  from: '@gwenjs/physics3d' },
    { name: 'defineLayers',       from: '@gwenjs/physics3d' },
    { name: 'onContact',          from: '@gwenjs/physics3d' },
    { name: 'onSensorEnter',      from: '@gwenjs/physics3d' },
    { name: 'onSensorExit',       from: '@gwenjs/physics3d' },
  ])

  kit.addVitePlugin(physics3dVitePlugin())

  kit.addTypeTemplate({
    filename: 'physics3d.d.ts',
    getContents: () => definePluginTypes({ /* all new types */ })
  })
}
```

---

## Integration Examples

### FPS shooter

```typescript
const PlayerActor = defineActor(PlayerPrefab, () => {
  const body = useDynamicBody({
    mass: 80,
    fixedRotation: true,   // prevent tipping over
    gravityScale: 1,
    quality: 'esport',     // high-frequency CCD
  })
  useCapsuleCollider({ radius: 0.3, height: 1.6, layer: Layers.player, mask: Layers.wall })

  let grounded = false
  onSensorEnter(groundSensorId, () => { grounded = true })
  onSensorExit(groundSensorId, () => { grounded = false })

  onUpdate(() => {
    if (input.pressed('jump') && grounded) body.applyImpulse(0, 5, 0)
  })
})
```

### VR (WebXR) physics interaction

```typescript
const PickableActor = defineActor(PickablePrefab, () => {
  const body = useDynamicBody({ mass: 0.5, linearDamping: 2 })
  useConvexCollider({ vertices: meshVertices, layer: Layers.pickable })

  onContact((e) => {
    if (e.relativeVelocity > 3) audio.play('thud', e.contactX, e.contactY, e.contactZ)
  })
})
```

### Racing game (3D kart)

```typescript
const KartActor = defineActor(KartPrefab, () => {
  const body = useDynamicBody({ mass: 1200, linearDamping: 0.05 })
  useBoxCollider({ w: 1.8, h: 0.8, d: 3.5, layer: Layers.vehicle, mask: Layers.wall | Layers.vehicle })

  onContact((e) => {
    if (e.relativeVelocity > 8) emit('kart:collision', { velocity: e.relativeVelocity })
  })
})
```

### RPG (open world — terrain mesh collider)

```typescript
const TerrainActor = defineActor(TerrainPrefab, () => {
  // Pre-processed at build time by gwen:physics3d Vite plugin
  useMeshCollider({
    vertices: terrainVertices,  // Float32Array from .glb loader
    indices: terrainIndices,    // Uint32Array
    layer: Layers.terrain,
    mask: Layers.player | Layers.enemy | Layers.vehicle,
  })
})
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/physics3d/src/composables/use-static-body.ts` | Create |
| `packages/physics3d/src/composables/use-dynamic-body.ts` | Create |
| `packages/physics3d/src/composables/use-box-collider.ts` | Create |
| `packages/physics3d/src/composables/use-sphere-collider.ts` | Create |
| `packages/physics3d/src/composables/use-capsule-collider.ts` | Create |
| `packages/physics3d/src/composables/use-mesh-collider.ts` | Create — 3D only |
| `packages/physics3d/src/composables/use-convex-collider.ts` | Create — 3D only |
| `packages/physics3d/src/composables/define-layers.ts` | Create |
| `packages/physics3d/src/composables/on-contact.ts` | Create |
| `packages/physics3d/src/composables/on-sensor.ts` | Create |
| `packages/physics3d/src/composables/index.ts` | Create — barrel |
| `packages/physics3d/src/ring-buffer.ts` | Create — SAB collision ring buffer (3D) |
| `packages/physics3d/src/vite-plugin.ts` | Create — `gwen:physics3d` |
| `packages/physics3d/src/module.ts` | Modify — add new auto-imports + vite plugin |
| `packages/physics3d/src/index.ts` | Modify — re-export new composables |
| `packages/physics3d/src/types.ts` | Modify — add new handle types |
| `packages/physics3d/tests/composables/` | Create — Vitest tests |
| `packages/physics3d/tests/compat.type-test.ts` | Create — structural compat test vs physics2d |
| `packages/physics3d/tests/vite-plugin.test.ts` | Create — layer inlining + mesh pre-baking tests |
| `docs/guide/physics3d-composables.md` | Create — VitePress guide |
| `docs/api/physics3d.md` | Create — API reference |

---

## Acceptance Criteria

- [ ] `useStaticBody()` / `useDynamicBody()` create correct 3D bodies via `Physics3DAPI`
- [ ] `useBoxCollider({ w, h, d })` uses `d` dimension in 3D simulation
- [ ] `useMeshCollider` + `useConvexCollider` are 3D-only and work with Rapier3D trimesh/convex
- [ ] `defineLayers()` bitmasks validated at runtime (no overlap warning)
- [ ] `onContact()` fires with `z` contact coordinates populated
- [ ] `onSensorEnter` / `onSensorExit` work via SAB ring buffer
- [ ] Structural compat type test passes — `useBoxCollider` options from physics2d assignable to physics3d
- [ ] `gwen:physics3d` Vite plugin inlines layer values (unit tested)
- [ ] Mesh collider pre-baking at build time reduces runtime WASM init by ≥ 50% on test mesh
- [ ] All composables have Vitest tests with ≥ 80% coverage
- [ ] Swapping `'@gwenjs/physics2d'` → `'@gwenjs/physics3d'` in `gwen.config.ts` requires 0 actor code changes (for shared composables)

---

## Standards

### Language
All code, JSDoc, comments, test descriptions, and documentation **must be written in English**.

### JSDoc
Every public export follows the existing codebase JSDoc style (same as RFC-04):

```typescript
/**
 * Registers the current actor's entity as a dynamic (physics-simulated) 3D body.
 *
 * Wraps `Physics3DAPI.createBody({ kind: 'dynamic', ... })`. Must be called
 * inside an active engine context.
 *
 * @param options - Dynamic body configuration (mass, damping, CCD quality…).
 * @returns A {@link DynamicBodyHandle3D} for applying forces and reading velocity.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics3d` is not registered.
 *
 * @example
 * ```typescript
 * const body = useDynamicBody({ mass: 80, fixedRotation: true })
 * body.applyImpulse(0, 5, 0)  // jump
 * ```
 *
 * @since 1.0.0
 */
export function useDynamicBody(options?: DynamicBodyOptions3D): DynamicBodyHandle3D
```

Required tags: `@param`, `@returns`, `@throws` (if applicable), `@example`, `@since`.

### Unit Tests (Vitest)

Test file location: `packages/physics3d/tests/composables/<unit>.test.ts`

Required test coverage:
- `use-static-body.ts` — body created as `kind: 'fixed'`; enable/disable
- `use-dynamic-body.ts` — `applyForce`/`applyImpulse`/`applyTorque`/`setVelocity`
- `use-box-collider.ts` — `d` dimension passed to 3D API (not ignored)
- `use-mesh-collider.ts` — vertices/indices forwarded; trimesh created
- `use-convex-collider.ts` — convex hull created from vertices
- `define-layers.ts` — bitmask values; overlap warning
- `on-contact.ts` — `z` contact coordinates populated
- `on-sensor.ts` — enter/exit from ring buffer
- `compat.type-test.ts` — structural compat with physics2d (type-level only)
- `vite-plugin.test.ts` — layer inlining + mesh collider pre-baking

Minimum coverage threshold: **80%** lines per file.

### Performance Tests

File: `packages/physics3d/tests/physics3d.perf.test.ts`

| Test | Threshold |
|------|-----------|
| 500 dynamic bodies created | < 20ms total |
| 500 `onContact` events dispatched per frame | < 1ms dispatch overhead |
| Ring buffer read — 500 contact events (3D struct) | < 0.5ms |
| Mesh collider pre-baking — 10k triangle mesh | < 50ms build time |
| `useMeshCollider` runtime init (pre-baked) | < 2ms |

### VitePress Documentation

- `docs/guide/physics3d-composables.md` — Guide: composables, 3D-specific features (mesh/convex colliders, torque, CCD), swap guide (2D→3D)
- `docs/api/physics3d.md` — Full API reference for all new composables
- Sidebar entry under **Plugins → Physics 3D** and **API Reference**
- All prose in English
