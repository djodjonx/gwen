# RFC-04 — Physics DX Composables

## Status
`draft`

## Summary

Add high-level composables (`useStaticBody`, `useDynamicBody`, `useBoxCollider`,
`useSphereCollider`, `useCapsuleCollider`, `onContact`, `onSensorEnter`,
`onSensorExit`, `defineLayers`) to `@gwenjs/physics2d`, update its `module.ts`
with auto-imports and a Vite optimizer plugin `gwen:physics2d`, and define the
same API contract by convention in `@gwenjs/physics3d`.

The goal is to match the ergonomics of Unity/Unreal physics workflows — but
through composables, auto-imports, and zero-overhead ECS integration.

---

## Motivation

Current `@gwenjs/physics2d` API is low-level:

```typescript
// ❌ Before — requires usePhysics2D() + manual body setup
const physics = usePhysics2D()
const body = physics.createBody({ type: 'static', position: [x, y] })
physics.addCollider(body, { shape: 'box', w: 32, h: 32 })
```

With RFC-04:

```typescript
// ✅ After — composable, auto-imported, unified with useShape
useStaticBody()   // reads Shape component for dimensions automatically
// or explicitly:
useBoxCollider({ w: 32, h: 32 })
```

---

## Design Principles

1. **Self-contained** — `@gwenjs/physics2d` owns its composables, types, and Vite plugin.
2. **No core coupling** — composables live in `@gwenjs/physics2d`, not in `@gwenjs/core`.
3. **Convention over interface** — `@gwenjs/physics3d` exports the same composable names
   by convention (structural TypeScript compatibility, no forced interface in core).
4. **Module-first** — everything is auto-imported via `module.ts`, zero manual imports.
5. **Extensible** — a custom physics plugin can implement the same composable names.

---

## New Composables

### `useStaticBody(options?)`

Registers the current actor's entity as a static (non-moving) physics body.
Reads `Shape` component if present to auto-configure collider dimensions.

```typescript
export interface StaticBodyOptions {
  /** Override collider shape. Reads from Shape component if omitted. */
  shape?: ColliderShape
  /** Physics layer bit(s) this body belongs to. */
  layer?: number
  /** Physics layer bit(s) this body collides with. */
  mask?: number
  /** If true, acts as a trigger (no physical response, only events). @default false */
  isSensor?: boolean
}

export interface StaticBodyHandle {
  readonly bodyId: number
  /** True if body is currently active in the simulation. */
  readonly active: boolean
  enable(): void
  disable(): void
}

export function useStaticBody(options?: StaticBodyOptions): StaticBodyHandle
```

**Usage:**

```typescript
const GroundActor = defineActor(GroundPrefab, () => {
  useShape({ w: 800, h: 32 })      // shared dimensions
  useStaticBody()                   // reads Shape → 800×32 collider
  useSprite({ texture: 'ground' }) // renderer also reads Shape
})
```

---

### `useDynamicBody(options?)`

Registers a dynamic (physics-simulated) body for the current actor entity.

```typescript
export interface DynamicBodyOptions {
  shape?: ColliderShape
  layer?: number
  mask?: number
  /** Mass in kg. @default 1 */
  mass?: number
  /** Linear damping (air resistance). @default 0 */
  linearDamping?: number
  /** Angular damping. @default 0 */
  angularDamping?: number
  /** If true, prevents rotation. @default false */
  fixedRotation?: boolean
  /** Gravity scale multiplier. @default 1 */
  gravityScale?: number
}

export interface DynamicBodyHandle {
  readonly bodyId: number
  applyForce(fx: number, fy: number): void
  applyImpulse(ix: number, iy: number): void
  setVelocity(vx: number, vy: number): void
  readonly velocity: { x: number; y: number }
  enable(): void
  disable(): void
}

export function useDynamicBody(options?: DynamicBodyOptions): DynamicBodyHandle
```

---

### `useBoxCollider(options)` / `useSphereCollider(options)` / `useCapsuleCollider(options)`

Explicit collider shape composables. More precise than `useStaticBody` when
you need full control over the shape.

```typescript
export function useBoxCollider(options: {
  w: number; h: number
  /** Depth for 3D. Optional — ignored by physics2d. */
  d?: number
  offsetX?: number; offsetY?: number
  isSensor?: boolean; layer?: number; mask?: number
}): BoxColliderHandle

export function useSphereCollider(options: {
  radius: number
  offsetX?: number; offsetY?: number
  isSensor?: boolean; layer?: number; mask?: number
}): CircleColliderHandle   // physics2d uses circles for "spheres"

export function useCapsuleCollider(options: {
  radius: number; height: number
  offsetX?: number; offsetY?: number
  isSensor?: boolean; layer?: number; mask?: number
}): CapsuleColliderHandle
```

---

### `defineLayers(definition)`

Declares named physics layers and their bitmasks. Called once at module scope.
The `gwen:physics2d` Vite plugin inlines all layer values at build time.

```typescript
export function defineLayers<T extends Record<string, number>>(
  definition: T
): { [K in keyof T]: number }

// Usage:
export const Layers = defineLayers({
  player: 1 << 0,   // 0b00001 = 1
  enemy:  1 << 1,   // 0b00010 = 2
  wall:   1 << 2,   // 0b00100 = 4
  bullet: 1 << 3,   // 0b01000 = 8
  sensor: 1 << 4,   // 0b10000 = 16
})

// In actor:
useStaticBody({ layer: Layers.wall, mask: Layers.player | Layers.bullet })
```

**Vite optimization:** `gwen:physics2d` inlines `Layers.wall` → `4` at build time.
If layer masks are defined as `defineLayers({ ... })`, the plugin validates that
no two layers share bits and warns on collision.

---

### `onContact(callback)`

Subscribes to collision events for the current actor entity.
Events are batched via a ring buffer (SharedArrayBuffer) — WASM fills the buffer
per frame, TypeScript reads in one pass per frame.

```typescript
export interface ContactEvent {
  entityA: bigint
  entityB: bigint
  /** Contact point in world coordinates. */
  contactX: number
  contactY: number
  /** Collision normal (direction of separation). */
  normalX: number
  normalY: number
  /** Relative velocity at contact. */
  relativeVelocity: number
}

export function onContact(callback: (contact: ContactEvent) => void): void
```

---

### `onSensorEnter(sensorId, callback)` / `onSensorExit(sensorId, callback)`

Subscribes to sensor overlap events for the current entity's sensor collider.

```typescript
export function onSensorEnter(
  sensorId: number,
  callback: (otherEntityId: bigint) => void
): void

export function onSensorExit(
  sensorId: number,
  callback: (otherEntityId: bigint) => void
): void

// Usage (enemy detection zone):
const EnemyActor = defineActor(EnemyPrefab, () => {
  const sensor = useSphereCollider({ radius: 64, isSensor: true })
  
  onSensorEnter(sensor.colliderId, (playerId) => {
    emit('enemy:detected', { enemyId: currentEntityId, playerId })
  })
  
  onSensorExit(sensor.colliderId, () => {
    emit('enemy:lost-target', { enemyId: currentEntityId })
  })
})
```

---

## Collision Events Architecture

Events are delivered via a ring buffer for zero-copy performance:

```
[WASM] physics step → fills SAB ring buffer with ContactEvent structs
                            ↓
[TypeScript] onAfterUpdate → reads ring buffer, dispatches to registered callbacks
                            ↓ 
[Actor callbacks] onContact, onSensorEnter, onSensorExit fire
```

Ring buffer layout (per contact event, 32 bytes):
```
offset 0:  entityA index  (u32)
offset 4:  entityB index  (u32)
offset 8:  contactX       (f32)
offset 12: contactY       (f32)
offset 16: normalX        (f32)
offset 20: normalY        (f32)
offset 24: relativeVel    (f32)
offset 28: flags          (u32) — bit 0: isSensor, bit 1: enter, bit 2: exit
```

---

## Vite Plugin: `gwen:physics2d`

Shipped inside `@gwenjs/physics2d`, registered via `module.ts`.

**Optimizations:**
1. **Layer inlining** — detects `defineLayers({...})` calls and replaces
   `Layers.wall` with the literal number `4` at build time.
2. **Bulk spawn detection** — detects `useBoxCollider` + `useStaticBody` called
   together on multiple identical actors → generates `bulk_spawn_with_colliders` WASM call.
3. **Collision filter dead-code elimination** — unused collision pairs
   detected statically → `defineLayers` entries not in any `mask` are removed.

```typescript
// In @gwenjs/physics2d/src/vite-plugin.ts
import type { Plugin } from 'vite'
export function physics2dVitePlugin(): Plugin {
  return {
    name: 'gwen:physics2d',
    transform(code, id) {
      if (!code.includes('defineLayers') && !code.includes('useBoxCollider')) return
      // AST transform: inline layer values, detect bulk patterns
    }
  }
}
```

**Registered in `module.ts`:**
```typescript
async setup(options, kit) {
  kit.addPlugin(Physics2DPlugin(options))
  kit.addAutoImports([
    { name: 'usePhysics2D',      from: '@gwenjs/physics2d' },
    { name: 'useRigidBody',      from: '@gwenjs/physics2d' },
    { name: 'useCollider',       from: '@gwenjs/physics2d' },
    // RFC-04 additions:
    { name: 'useStaticBody',     from: '@gwenjs/physics2d' },
    { name: 'useDynamicBody',    from: '@gwenjs/physics2d' },
    { name: 'useBoxCollider',    from: '@gwenjs/physics2d' },
    { name: 'useSphereCollider', from: '@gwenjs/physics2d' },
    { name: 'useCapsuleCollider',from: '@gwenjs/physics2d' },
    { name: 'defineLayers',      from: '@gwenjs/physics2d' },
    { name: 'onContact',         from: '@gwenjs/physics2d' },
    { name: 'onSensorEnter',     from: '@gwenjs/physics2d' },
    { name: 'onSensorExit',      from: '@gwenjs/physics2d' },
  ])
  kit.addVitePlugin(physics2dVitePlugin())
  kit.addTypeTemplate({ /* ... */ })
}
```

---

## `@gwenjs/physics3d` Convention

`@gwenjs/physics3d` exports the **same composable names** with 3D implementations.
TypeScript structural compatibility ensures that code using only the composable
functions (not the handle types) works without modification when swapping physics
packages in `gwen.config.ts`:

```typescript
// gwen.config.ts — swap 2D → 3D
modules: [
  ['@gwenjs/physics3d', { gravity: -9.81 }]  // was '@gwenjs/physics2d'
]

// Actor code — no changes needed:
useStaticBody()             // works with both
useBoxCollider({ w, h, d }) // 3D uses d; 2D ignores d
onContact(cb)               // same event shape
```

---

## Integration Examples

### Platformer (Mario-like)

```typescript
const PlayerActor = defineActor(PlayerPrefab, () => {
  const t     = useTransform()
  const body  = useDynamicBody({ fixedRotation: true, gravityScale: 2.5 })
  const Layers = defineLayers({ player: 1, platform: 2, coin: 4 })

  useBoxCollider({ w: 20, h: 32, layer: Layers.player, mask: Layers.platform | Layers.coin })

  let grounded = false
  onSensorEnter(groundSensorId, () => { grounded = true })
  onSensorExit(groundSensorId, () => { grounded = false })

  onUpdate(() => {
    if (input.pressed('jump') && grounded) body.applyImpulse(0, 400)
  })
})
```

### Mario Kart-like (obstacle collision)

```typescript
const KartActor = defineActor(KartPrefab, () => {
  const body = useDynamicBody({ mass: 800, linearDamping: 0.3 })
  useBoxCollider({ w: 40, h: 64, layer: Layers.kart, mask: Layers.wall | Layers.kart })

  onContact((e) => {
    if (e.relativeVelocity > 200) {
      emit('kart:crash', { kartId: currentEntityId, velocity: e.relativeVelocity })
    }
  })
})
```

### RPG (NPC detection zone)

```typescript
const NPCActor = defineActor(NPCPrefab, () => {
  useStaticBody({ isSensor: false })         // physical NPC body
  const zone = useSphereCollider({            // detection aura
    radius: 80, isSensor: true,
    layer: Layers.sensor, mask: Layers.player
  })
  
  onSensorEnter(zone.colliderId, (playerId) => {
    emit('npc:player-nearby', { npcId: currentEntityId, playerId })
  })
})
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/physics2d/src/composables/use-static-body.ts` | Create |
| `packages/physics2d/src/composables/use-dynamic-body.ts` | Create |
| `packages/physics2d/src/composables/use-box-collider.ts` | Create |
| `packages/physics2d/src/composables/use-sphere-collider.ts` | Create |
| `packages/physics2d/src/composables/use-capsule-collider.ts` | Create |
| `packages/physics2d/src/composables/define-layers.ts` | Create |
| `packages/physics2d/src/composables/on-contact.ts` | Create |
| `packages/physics2d/src/composables/on-sensor.ts` | Create |
| `packages/physics2d/src/composables/index.ts` | Create — barrel |
| `packages/physics2d/src/ring-buffer.ts` | Create — SAB collision ring buffer |
| `packages/physics2d/src/vite-plugin.ts` | Create — `gwen:physics2d` |
| `packages/physics2d/src/module.ts` | Modify — add new auto-imports + vite plugin |
| `packages/physics2d/src/index.ts` | Modify — re-export new composables |
| `packages/physics2d/src/types.ts` | Modify — add new handle types |
| `packages/physics2d/tests/composables/` | Create — Vitest tests for each composable |
| `packages/physics2d/tests/vite-plugin.test.ts` | Create — layer inlining tests |
| `docs/guide/physics-composables.md` | Create — VitePress guide |
| `docs/api/physics2d.md` | Create — API reference |

---

## Acceptance Criteria

- [ ] `useStaticBody()` creates a static body and reads `Shape` component automatically if present
- [ ] `useDynamicBody()` supports `applyImpulse`, `setVelocity`, `velocity` getter
- [ ] `useBoxCollider` / `useSphereCollider` / `useCapsuleCollider` create colliders with correct shapes
- [ ] `defineLayers()` returns correct bitmasks, validated at runtime (no two bits overlap warning)
- [ ] `onContact()` fires with correct entity IDs and contact data within same frame
- [ ] `onSensorEnter` / `onSensorExit` fire on SAB ring buffer events, no frame lag
- [ ] `gwen:physics2d` Vite plugin correctly inlines layer values (unit tested with AST check)
- [ ] `module.ts` exports all new auto-imports — no manual imports needed in actor files
- [ ] All new composables have Vitest tests with ≥ 80% coverage
- [ ] `@gwenjs/physics2d` and `@gwenjs/physics3d` export same composable names (structural compat test)

---

## Standards

### Language
All code, JSDoc, comments, test descriptions, and documentation **must be written in English**.

### JSDoc
Every public export follows the existing `@gwenjs/physics2d` JSDoc style:

```typescript
/**
 * Registers the current actor's entity as a static (non-moving) physics body.
 *
 * Reads the `Shape` ECS component for collider dimensions if present.
 * Must be called inside an active engine context (inside `defineActor()` or `defineSystem()`).
 *
 * @param options - Optional body and collider configuration.
 * @returns A {@link StaticBodyHandle} for enabling/disabling the body at runtime.
 * @throws {GwenPluginNotFoundError} If `@gwenjs/physics2d` is not registered.
 *
 * @example
 * ```typescript
 * const GroundActor = defineActor(GroundPrefab, () => {
 *   useShape({ w: 800, h: 32 })
 *   useStaticBody()   // reads Shape → 800×32 collider
 * })
 * ```
 *
 * @since 1.0.0
 */
export function useStaticBody(options?: StaticBodyOptions): StaticBodyHandle
```

Required tags: `@param`, `@returns`, `@throws` (if applicable), `@example`, `@since`.

### Unit Tests (Vitest)

Test file location: `packages/physics2d/tests/composables/<unit>.test.ts`

Required test coverage:
- `use-static-body.ts` — body created with correct shape; `enable()`/`disable()` toggle active state
- `use-static-body.ts` — reads `Shape` component when no explicit shape given
- `use-dynamic-body.ts` — `applyImpulse`/`setVelocity`/`velocity` getter correct
- `use-box-collider.ts` / `use-sphere-collider.ts` / `use-capsule-collider.ts` — shape dimensions passed to API
- `define-layers.ts` — correct bitmask values; warns if two layers share bits
- `on-contact.ts` — callback fires with correct entity IDs and contact data
- `on-sensor.ts` — `onSensorEnter`/`onSensorExit` fire on ring buffer events
- `vite-plugin.ts` — layer inlining: `Layers.wall` → literal `4` in output AST

Minimum coverage threshold: **80%** lines per file.

### Performance Tests

File: `packages/physics2d/tests/physics2d.perf.test.ts`

| Test | Threshold |
|------|-----------|
| 1 000 static bodies created | < 10ms total |
| 1 000 `onContact` events dispatched per frame | < 1ms dispatch overhead |
| `defineLayers` inlining — build time | < 100ms for 100 layer usages |
| Ring buffer read — 500 contact events | < 0.5ms |

### VitePress Documentation

- `docs/guide/physics-composables.md` — Guide: useStaticBody, useDynamicBody, colliders, sensors, layers
- `docs/api/physics2d.md` — Full API reference for all new composables
- Sidebar entry under **Plugins → Physics 2D** and **API Reference**
- All prose in English
