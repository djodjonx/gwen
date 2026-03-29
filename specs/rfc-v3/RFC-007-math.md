# RFC-007 — Math Utilities

**Statut:** Draft  
**Priorité:** P2 — Milestone 3  
**Packages impactés:** `@gwen/math` (nouveau)

---

## Résumé

Créer `@gwen/math` : librairie mathématique légère, zero-allocation en hot loop,
compatible Three.js, exposant des utilitaires pour les jeux (damp, spring, vec3, quat).

---

## Motivation

Les développeurs GWEN importent Three.js pour la math, `glm-js`, ou réimplémentent leurs
propres helpers. Mario Kart 3.js utilise `damp()` de `maath` et `THREE.Vector3` manuellement.
`@gwen/math` standardise ces patterns avec zero-dep et zero-alloc en hot loop.

---

## Design détaillé

### Scalaires

```typescript
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential decay. Compatible maath.damp() */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function remap(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}
```

### Vec3 — pool zero-alloc

```typescript
export interface Vec3 { x: number; y: number; z: number }
export function vec3(x = 0, y = 0, z = 0): Vec3 { return { x, y, z }; }

// Pool de 32 Vec3 réutilisés chaque frame
const _pool = Array.from({ length: 32 }, () => ({ x: 0, y: 0, z: 0 }));
let _head = 0;
export const tmpVec3 = (): Vec3 => { const v = _pool[_head++ % 32]; v.x=0;v.y=0;v.z=0; return v; };

export const addVec3    = (a: Vec3, b: Vec3, o = tmpVec3()): Vec3 => { o.x=a.x+b.x; o.y=a.y+b.y; o.z=a.z+b.z; return o; };
export const subVec3    = (a: Vec3, b: Vec3, o = tmpVec3()): Vec3 => { o.x=a.x-b.x; o.y=a.y-b.y; o.z=a.z-b.z; return o; };
export const scaleVec3  = (a: Vec3, s: number, o = tmpVec3()): Vec3 => { o.x=a.x*s; o.y=a.y*s; o.z=a.z*s; return o; };
export const dotVec3    = (a: Vec3, b: Vec3): number => a.x*b.x + a.y*b.y + a.z*b.z;
export const lengthVec3 = (a: Vec3): number => Math.sqrt(dotVec3(a, a));
export const normalizeVec3 = (a: Vec3, o = tmpVec3()): Vec3 => {
  const l = lengthVec3(a); return l === 0 ? o : scaleVec3(a, 1/l, o);
};
export const lerpVec3  = (a: Vec3, b: Vec3, t: number, o = tmpVec3()): Vec3 => {
  o.x = a.x+(b.x-a.x)*t; o.y = a.y+(b.y-a.y)*t; o.z = a.z+(b.z-a.z)*t; return o;
};
export const dampVec3  = (curr: Vec3, target: Vec3, lambda: number, dt: number, o = tmpVec3()): Vec3 =>
  lerpVec3(curr, target, 1 - Math.exp(-lambda * dt), o);

// Interop Three.js (tree-shaked si non utilisé)
export const vec3FromTHREE = (v: {x:number;y:number;z:number}, o = tmpVec3()): Vec3 => { o.x=v.x;o.y=v.y;o.z=v.z; return o; };
export const vec3ToTHREE   = <T extends {set(x:number,y:number,z:number):T}>(a: Vec3, t: T): T => t.set(a.x, a.y, a.z);
```

### Quat

```typescript
export interface Quat { x: number; y: number; z: number; w: number }
export function quat(x=0,y=0,z=0,w=1): Quat { return {x,y,z,w}; }
export function quatFromEuler(ex: number, ey: number, ez: number, o: Quat): Quat { /* ZYX */ return o; }
export function slerpQuat(a: Quat, b: Quat, t: number, o: Quat): Quat { return o; }
export function dampQuat(curr: Quat, target: Quat, lambda: number, dt: number, o: Quat): Quat {
  return slerpQuat(curr, target, 1 - Math.exp(-lambda * dt), o);
}
```

### Spring — caméra de kart

```typescript
export interface Spring { value: number; velocity: number; stiffness: number; damping: number }
export function createSpring(init: number, stiffness = 100, damping = 20): Spring {
  return { value: init, velocity: 0, stiffness, damping };
}
export function stepSpring(s: Spring, target: number, dt: number): number {
  const force = -s.stiffness * (s.value - target) - s.damping * s.velocity;
  s.velocity += force * dt;
  s.value += s.velocity * dt;
  return s.value;
}

// Version Vec3
export interface Spring3 { value: Vec3; velocity: Vec3; stiffness: number; damping: number }
export function createSpring3(init: Vec3, stiffness=100, damping=20): Spring3 {
  return { value:{...init}, velocity:{x:0,y:0,z:0}, stiffness, damping };
}
export function stepSpring3(s: Spring3, target: Vec3, dt: number): Vec3 {
  for (const axis of ['x','y','z'] as const) {
    const force = -s.stiffness*(s.value[axis]-target[axis]) - s.damping*s.velocity[axis];
    s.velocity[axis] += force*dt;
    s.value[axis] += s.velocity[axis]*dt;
  }
  return s.value;
}
```

### Exemple — CameraSystem Mario Kart

```typescript
export const KartCameraSystem = defineSystem('KartCameraSystem', () => {
  const camPos    = createSpring3({ x:0, y:5, z:10 }, 80, 15);
  const camTarget = createSpring3({ x:0, y:0, z:0 },  120, 20);
  return {
    query: { all: [Transform3D], tag: 'local-player' },
    onUpdate(api, dt, entities) {
      const [kart] = entities;
      if (!kart) return;
      const t = kart.get(Transform3D);
      const behind = addVec3(t.position, scaleVec3(rotateForward(t.rotation), -8));
      behind.y += 4;
      stepSpring3(camPos, behind, dt);
      stepSpring3(camTarget, t.position, dt);
      (api.services.get('camera') as CameraService).setPosition(camPos.value).lookAt(camTarget.value);
    }
  };
});
```

---

## Questions ouvertes

- Exposer les calculs batch (slerp × 100) depuis Rust WASM ?
- Compatibilité avec `@react-three/drei` / `maath` math helpers ?
