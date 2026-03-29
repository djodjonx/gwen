# RFC-004 — 3D Transform Support

**Statut:** Draft  
**Priorité:** P1 — Milestone 2  
**Packages impactés:** `@djodjonx/engine-core`, `gwen-core` (Rust)

---

## Résumé

Étendre le buffer de transforms partagé de 32 à 48 octets pour supporter les coordonnées 3D
(x, y, z), un quaternion (qx, qy, qz, qw), et une échelle 3D (sx, sy, sz).
Ajouter `Types.vec3` et `Types.quat` au schema DSL. Fournir un composant `Transform3D` officiel.

---

## Motivation

`TRANSFORM_STRIDE = 32` encode uniquement x, y, rotation, scaleX, scaleY (2D).
Pour Mario Kart sur R3F, `InstancedMesh` attend une Matrix4 par kart (position vec3 + quat + scale vec3).
Le buffer GWEN doit alimenter cette matrix sans conversion JS.

---

## Design détaillé

### 1. Nouveau layout — 48 bytes/entité

```
Offset  Field    Type   Notes
──────────────────────────────────
 0      x        f32
 4      y        f32
 8      z        f32
12      qx       f32    quaternion
16      qy       f32
20      qz       f32
24      qw       f32    (1.0 au repos)
28      scaleX   f32    (1.0 au repos)
32      scaleY   f32
36      scaleZ   f32
40      flags    u8     dirty bit, visible, etc.
41      pad      u8[7]
──────────────────────────────────
Total : 48 bytes
```

### 2. Constantes TypeScript

```typescript
export const TRANSFORM_STRIDE = 48; // was 32

export const TRANSFORM_OFFSETS = {
  X: 0, Y: 4, Z: 8,
  QX: 12, QY: 16, QZ: 20, QW: 24,
  SCALE_X: 28, SCALE_Y: 32, SCALE_Z: 36,
  FLAGS: 40,
} as const;
```

### 3. Rust — `gwen-core/src/transform.rs`

```rust
pub const TRANSFORM_STRIDE: usize = 48;

#[repr(C)]
pub struct Transform3D {
    pub x: f32, pub y: f32, pub z: f32,
    pub qx: f32, pub qy: f32, pub qz: f32, pub qw: f32,
    pub scale_x: f32, pub scale_y: f32, pub scale_z: f32,
    pub flags: u8,
    _pad: [u8; 7],
}
```

### 4. Types.vec3 et Types.quat

```typescript
export const Types = {
  // ...existant...
  vec3: {
    byteSize: 12,
    serialize(data: Vec3, view: DataView, offset: number) {
      view.setFloat32(offset,     data.x, true);
      view.setFloat32(offset + 4, data.y, true);
      view.setFloat32(offset + 8, data.z, true);
    },
    deserialize(view: DataView, offset: number): Vec3 {
      return {
        x: view.getFloat32(offset,     true),
        y: view.getFloat32(offset + 4, true),
        z: view.getFloat32(offset + 8, true),
      };
    },
  },
  quat: {
    byteSize: 16,
    serialize(data: Quat, view: DataView, offset: number) {
      view.setFloat32(offset,      data.x, true);
      view.setFloat32(offset + 4,  data.y, true);
      view.setFloat32(offset + 8,  data.z, true);
      view.setFloat32(offset + 12, data.w, true);
    },
    deserialize(view: DataView, offset: number): Quat {
      return {
        x: view.getFloat32(offset,      true),
        y: view.getFloat32(offset + 4,  true),
        z: view.getFloat32(offset + 8,  true),
        w: view.getFloat32(offset + 12, true),
      };
    },
  },
};
```

### 5. Composant `Transform3D` officiel

```typescript
// packages/@djodjonx/engine-core/src/components/transform3d.ts
export const Transform3D = defineComponent({
  name: 'Transform3D',
  schema: {
    position: Types.vec3,
    rotation: Types.quat,
    scale:    Types.vec3,
  },
  defaults: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale:    { x: 1, y: 1, z: 1 },
  },
});
```

### 6. Zero-copy pour InstancedMesh (R3F)

```typescript
// L'adapter R3F (RFC-006) lit directement le buffer WASM
const transformBuffer = engine.getTransformBuffer(); // Float32Array WASM
const instanceMatrix = new THREE.InstancedBufferAttribute(transformBuffer, 12);
// 0 copie — Three.js lit depuis WASM linear memory
```

---

## Compatibilité 2D

Les projets 2D ne sont pas impactés :
- `z`, `qx`, `qy`, `scaleZ` defaultent à 0/0/0/1 — le renderer Canvas2D les ignore
- `plugin-physics2d` continue d'utiliser x, y, rotation uniquement

---

## Drawbacks

- +50% mémoire par entité (32→48 bytes) même pour les projets 2D
- Mitigation : config `transformMode: '2d' | '3d'` avec deux builds WASM

---

## Questions ouvertes

- Un seul build WASM (48 bytes) ou deux builds séparés (32 et 48) ?
- `Types.mat4` pour les transforms pré-calculés ?
