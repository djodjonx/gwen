# Plan TS-07 — Compléter les README de `kit`, `app` et `physics3d-fracture`

## Objectif
Trois packages publics centraux ont des README insuffisants :
- `@gwenjs/kit` — 3 lignes alors que c'est le package `definePlugin`/`defineModule` utilisé par TOUS les plugins
- `@gwenjs/app` — 3 lignes alors que c'est le runtime d'application central
- `@gwenjs/physics3d-fracture` — **absent** (aucun README)

Ce plan est documentaire : aucun code Rust ni TypeScript n'est modifié.

## Impact sur les autres packages
Aucun. README uniquement.

---

# Partie A — `@gwenjs/kit`

## Fichier à modifier : `packages/kit/README.md`

**Contenu à écrire :**

```markdown
# @gwenjs/kit

The official plugin and module authoring kit for GWEN. Provides `definePlugin`, `defineGwenModule`, and the plugin lifecycle types used by every first-party and third-party GWEN extension.

## Installation

```bash
npm install @gwenjs/kit
```

## definePlugin

`definePlugin` creates a self-contained, reusable game system. Plugins declare lifecycle hooks (`onSetup`, `onUpdate`, `onDestroy`) and expose a typed service API accessible to actors and other plugins.

```typescript
import { definePlugin } from '@gwenjs/kit';

export const MyPlugin = definePlugin((config: MyConfig = {}) => {
  let score = 0;

  return {
    id: 'my-plugin',

    onSetup(engine) {
      // Called once when the plugin is registered
    },

    onUpdate(engine, delta) {
      // Called every frame — delta is in seconds
    },

    onDestroy() {
      score = 0;
    },

    // Public API exposed to actors via useMyPlugin()
    api: {
      getScore: () => score,
      addScore: (n: number) => { score += n; },
    },
  };
});
```

## defineGwenModule

`defineGwenModule` registers a collection of plugins as a single installable unit in a GWEN app config.

```typescript
import { defineGwenModule } from '@gwenjs/kit';
import { MyPlugin } from './my-plugin';

export const MyModule = defineGwenModule({
  id: 'my-module',
  plugins: [MyPlugin({ debug: true })],
});
```

## Plugin lifecycle

| Hook | When | Typical use |
|------|------|-------------|
| `onSetup(engine)` | Once, after WASM init | Register components, allocate resources |
| `onUpdate(engine, delta)` | Every frame | Sync physics, update state machines |
| `onDestroy()` | Scene teardown | Free resources, cancel subscriptions |

## Accessing plugin services from actors

Plugins that expose an `api` object can be accessed in actors via `usePlugin`:

```typescript
import { usePlugin } from '@gwenjs/core';
import type { MyPluginAPI } from './my-plugin';

const PlayerActor = defineActor(PlayerPrefab, () => {
  const my = usePlugin<MyPluginAPI>('my-plugin');

  onUpdate(() => {
    my.addScore(1);
  });
});
```

## See also

- `@gwenjs/core` — Engine, ECS, WASM bridge
- `@gwenjs/schema` — App configuration schema
- `@gwenjs/app` — Application runtime
```

---

# Partie B — `@gwenjs/app`

## Fichier à modifier : `packages/app/README.md`

**Contenu à écrire :**

```markdown
# @gwenjs/app

GWEN application runtime. Loads the engine configuration, initializes WASM, resolves plugins, and manages the scene router lifecycle.

## What it does

`@gwenjs/app` is the entry point for a GWEN game. It:
1. Loads `gwen.config.ts` (or `.js`) via `c12`
2. Validates config against `@gwenjs/schema`
3. Initializes the WASM engine variant (light / physics2d / physics3d)
4. Resolves and registers all declared plugins
5. Starts the scene router

In most projects this is called automatically by the Vite plugin — you do not need to call it manually.

## Manual usage

```typescript
import { createApp } from '@gwenjs/app';

const app = await createApp({
  config: './gwen.config.ts',
  env: 'production',
});

await app.start();
```

## Configuration

See `@gwenjs/schema` for the full `GwenConfig` type and all available options.

```typescript
// gwen.config.ts
import { defineConfig } from '@gwenjs/schema';

export default defineConfig({
  engine: {
    maxEntities: 10_000,
    variant: 'physics3d',
  },
  plugins: [
    Physics3DPlugin({ gravity: { x: 0, y: -9.81, z: 0 } }),
    Canvas2DRendererPlugin(),
  ],
});
```

## Module system

GWEN modules (from `@gwenjs/kit`'s `defineGwenModule`) can be registered in the config and are resolved before the app starts:

```typescript
export default defineConfig({
  modules: [MyGameModule],
});
```

## Hooks

`@gwenjs/app` uses `hookable` to expose lifecycle hooks:

| Hook | Description |
|------|-------------|
| `app:before-init` | Before WASM initialization |
| `app:ready` | After all plugins are registered |
| `app:error` | Unhandled error during startup |

## See also

- `@gwenjs/schema` — Configuration schema
- `@gwenjs/kit` — Plugin authoring
- `@gwenjs/cli` — Project tooling (build, dev, scaffold)
```

---

# Partie C — `@gwenjs/physics3d-fracture`

## Fichier à créer : `packages/physics3d-fracture/README.md`

**Contenu à écrire :**

```markdown
# @gwenjs/physics3d-fracture

Voronoi mesh fracture for GWEN Physics 3D. Splits a triangle mesh into N shards using a deterministic Voronoi site assignment algorithm, computed in a standalone WASM module.

## When to use

Use this package when you need runtime destructible geometry:
- Breaking windows, walls, or terrain on high-impact collisions
- Debris spawning from explosions
- Destructible environment tiles

## Installation

```bash
npm install @gwenjs/physics3d-fracture
```

Requires `@gwenjs/physics3d` to be installed and configured.

## Usage

```typescript
import { parseFractureBuffer } from '@gwenjs/physics3d-fracture';

// Inside an actor — fracture module loaded via engine.loadWasmModule
const fracture = useWasmModule('fracture');

onContact(({ impulse, localPoint }) => {
  if (impulse < 200) return; // Only fracture on strong impacts

  const rawBuf = fracture.voronoi_fracture(
    meshVerts,      // Float32Array: [x0,y0,z0, x1,y1,z1, ...]
    meshIdxs,       // Uint32Array:  [a0,b0,c0, ...]
    localPoint.x,   // Impact point (local space)
    localPoint.y,
    localPoint.z,
    12,             // Number of shards
    Date.now() & 0xFFFFFFFF, // Seed for reproducibility
  );

  const { shards } = parseFractureBuffer(new Float32Array(rawBuf.buffer));

  for (const shard of shards) {
    const debris = instantiate(GlassShardPrefab, { position: getPosition() });
    // GlassShardPrefab uses useMeshCollider({ vertices: shard.vertices, indices: shard.indices })
  }

  destroyActor();
});
```

## API

### `parseFractureBuffer(buffer: Float32Array): FractureResult`

Parse the raw `f32` output buffer returned by `voronoi_fracture()` into typed shard objects.

### `FractureShard`

```typescript
interface FractureShard {
  /** Flat vertex buffer [x0,y0,z0, x1,y1,z1, ...] */
  vertices: Float32Array;
  /** Flat index buffer [a0,b0,c0, ...] — ready for useMeshCollider() */
  indices: Uint32Array;
}
```

## WASM module loading

The fracture WASM is a **separate standalone module** — it is NOT included in the main gwen-core WASM. Register it in your app config:

```typescript
// gwen.config.ts
export default defineConfig({
  wasmModules: [
    { name: 'fracture', url: '/wasm/gwen_physics3d_fracture_bg.wasm' },
  ],
});
```

## Performance notes

- Algorithm complexity: O(triangles × shard_count) — fast for ≤ 64 shards on meshes up to ~10 000 triangles
- Prefer calling from a Web Worker for very complex meshes to avoid frame drops
- The fracture is deterministic — same `seed` + same mesh always produces the same shards

## See also

- `@gwenjs/physics3d` — 3D rigid body physics
- `useMeshCollider` — Attach the shard geometry as a physics collider
```

---

## Vérification

```bash
# Vérifier que les README existent et ont une taille raisonnable
wc -l packages/kit/README.md packages/app/README.md packages/physics3d-fracture/README.md
# Attendu : > 50 lignes chacun
```

---

## Résumé des fichiers créés/modifiés
| Fichier | Modification |
|---------|-------------|
| `packages/kit/README.md` | Réécriture complète (~90 lignes) |
| `packages/app/README.md` | Réécriture complète (~80 lignes) |
| `packages/physics3d-fracture/README.md` | **Nouveau** (~80 lignes) |
