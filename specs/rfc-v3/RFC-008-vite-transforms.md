# RFC-008 — Vite Build Macros

**Statut:** Draft  
**Priorité:** P3 — Milestone 4  
**Packages impactés:** `@djodjonx/vite-plugin`, `@djodjonx/cli`

---

## Résumé

Ajouter un mode de transformation de code au plugin Vite. À la compilation :
- `defineComponent` → offsets TypedArray hardcodés (zéro lookup runtime)
- Boucles `entities` → TypedArray ops directs (zéro WASM call)
- Auto-imports des primitives GWEN
- System HMR sans rechargement de page

---

## Motivation

Sans transforms, le hot loop :
```
api.component.get(id, T) → lookup registry → DataView.getFloat32 × N → objet TS
```

Avec transforms (produit compilé) :
```typescript
// Source développeur :
const speed = e.get(KartState).speed;
// Compilé :
const speed = _f32view[_ks_base + 0]; // offset 0 hardcodé
```

→ Zéro WASM call, zéro allocation, vitesse native Float32Array.

---

## Design détaillé

### 1. Plugin Vite

```typescript
export function gwenTransform(options: GwenTransformOptions = {}): Plugin {
  let componentOffsets: Map<string, ComponentOffsetMap>;

  return {
    name: 'gwen:transform',
    async buildStart() {
      componentOffsets = await loadComponentOffsets('.gwen/manifest.json');
    },
    transform(code, id) {
      if (!id.endsWith('.ts') && !id.endsWith('.tsx')) return null;
      if (!code.includes('defineSystem') && !code.includes('defineComponent')) return null;
      let result = code;
      if (options.compileComponents !== false) result = transformComponents(result, componentOffsets);
      if (options.compileSystems !== false) result = transformSystems(result, componentOffsets);
      return result || null;
    },
    handleHotUpdate({ file, server }) {
      if (!file.includes('/systems/')) return;
      server.ws.send({ type: 'custom', event: 'gwen:system-hmr', data: { file } });
    },
  };
}
```

### 2. Transform 1 : `defineComponent` → offsets statiques

```typescript
// Source
export const KartState = defineComponent({
  name: 'KartState',
  schema: { speed: Types.f32, throttle: Types.f32, steer: Types.f32, drifting: Types.bool },
});

// Compilé (injecté par gwenTransform)
export const KartState = defineComponent({
  name: 'KartState',
  schema: { speed: Types.f32, throttle: Types.f32, steer: Types.f32, drifting: Types.bool },
  __compiled: {
    byteSize: 13,
    offsets: { speed: 0, throttle: 4, steer: 8, drifting: 12 },
    bufferIndex: 3,
  }
});
```

### 3. Transform 2 : System query → TypedArray boucle

```typescript
// Source
defineSystem('KartSystem', {
  query: [KartState, Transform3D],
  onUpdate(api, dt, entities) {
    for (const e of entities) {
      const s = e.get(KartState);
      e.set(KartState, { speed: s.speed + dt * 10 });
    }
  }
});

// Compilé
defineSystem('KartSystem', {
  query: [KartState, Transform3D],
  onUpdate(api, dt, entities) {
    const _f32 = api.__getFloat32View();
    const _STRIDE = api.__getComponentStride();
    for (let _i = 0; _i < entities.__length; _i++) {
      const _idx = entities.__indices[_i];
      const _ks = _idx * _STRIDE + 3 * _COMPONENT_BLOCK; // bufferIndex=3
      const _speed = _f32[_ks + 0];
      _f32[_ks + 0] = _speed + dt * 10; // set speed
    }
  }
});
```

### 4. Auto-imports

```typescript
// unplugin-auto-import configuré automatiquement :
// defineSystem, defineComponent, defineScene, definePrefab, Types → @djodjonx/gwen-engine-core
// vec3, quat, damp, lerp, clamp, createSpring → @gwen/math
// GwenProvider, GwenLoop, useService, useQuery, useEntityTransform → @gwen/adapter-r3f
```

### 5. System HMR

```typescript
// Côté client (injecté dans bootstrap GWEN) :
if (import.meta.hot) {
  import.meta.hot.on('gwen:system-hmr', ({ file }) => {
    engine.pluginManager.reloadSystem(file);
  });
}
```

### 6. Config

```typescript
// vite.config.ts
import gwen from '@djodjonx/vite-plugin';
import { gwenTransform } from '@djodjonx/vite-plugin/transform';

export default defineConfig({
  plugins: [
    gwen(),
    gwenTransform({
      compileComponents: true,  // false en dev pour les sourcemaps
      compileSystems: true,
      autoImports: true,
    }),
  ],
});
```

### 7. Deux passes pour les plugins tiers

```
Pass 1 (plugin build) : offsets symboliques → __GWEN_OFFSET_Transform3D_position__
Pass 2 (user build)   : symboles résolus   → 0
```

---

## Prérequis

`gwen prepare` doit être exécuté avant `vite build` pour générer `.gwen/manifest.json`.

---

## Drawbacks

- Sourcemaps dégradées en mode compilé → désactivé par défaut en dev
- `gwen prepare` requis avant build

---

## Questions ouvertes

- Mode `debug-compiled` : compilation active + sourcemaps préservées ?
- Gestion des `api.component.get()` hors d'une boucle `entities` ?
