# Plan TS-08 — Tests unitaires pour `physics3d-utils.ts` (extrait du Plan TS-04)

## Objectif
Une fois que le Plan TS-04 a extrait les fonctions pures de `physics3d/plugin/index.ts` vers `physics3d/src/plugin/physics3d-utils.ts`, ce plan ajoute des tests unitaires pour ces fonctions.

**Dépendance :** ce plan doit être exécuté APRÈS le Plan TS-04.

## Impact sur les autres packages
Aucun. Tests internes à `@gwenjs/physics3d`.

---

## Étape 1 — Créer le fichier de tests

**Créer :** `packages/physics3d/src/plugin/__tests__/physics3d-utils.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  toEntityIndex,
  kindFromU8,
  kindToU8,
  parseBodyState,
  cloneBodyState,
  vec3,
  quat,
} from '../physics3d-utils';

// ─── toEntityIndex ────────────────────────────────────────────────────────────

describe('toEntityIndex', () => {
  it('extracts low 32 bits from bigint', () => {
    // High 32 bits = generation, low 32 bits = index
    const entityId = (100n << 32n) | 42n;
    expect(toEntityIndex(entityId)).toBe(42);
  });

  it('returns number as-is', () => {
    expect(toEntityIndex(17)).toBe(17);
  });

  it('parses string to integer', () => {
    expect(toEntityIndex('99')).toBe(99);
  });

  it('handles zero', () => {
    expect(toEntityIndex(0)).toBe(0);
    expect(toEntityIndex(0n)).toBe(0);
    expect(toEntityIndex('0')).toBe(0);
  });
});

// ─── kindFromU8 / kindToU8 ────────────────────────────────────────────────────

describe('kindFromU8', () => {
  it('0 → fixed', () => expect(kindFromU8(0)).toBe('fixed'));
  it('1 → dynamic', () => expect(kindFromU8(1)).toBe('dynamic'));
  it('2 → kinematic', () => expect(kindFromU8(2)).toBe('kinematic'));
  it('255 (sentinel) → dynamic', () => expect(kindFromU8(255)).toBe('dynamic'));
  it('unknown value → dynamic (fallback)', () => expect(kindFromU8(99)).toBe('dynamic'));
});

describe('kindToU8', () => {
  it('fixed → 0', () => expect(kindToU8('fixed')).toBe(0));
  it('dynamic → 1', () => expect(kindToU8('dynamic')).toBe(1));
  it('kinematic → 2', () => expect(kindToU8('kinematic')).toBe(2));
});

describe('kindFromU8 / kindToU8 roundtrip', () => {
  it('roundtrip: kindToU8(kindFromU8(0)) = 0', () => {
    expect(kindToU8(kindFromU8(0))).toBe(0);
  });
  it('roundtrip: kindToU8(kindFromU8(1)) = 1', () => {
    expect(kindToU8(kindFromU8(1))).toBe(1);
  });
  it('roundtrip: kindToU8(kindFromU8(2)) = 2', () => {
    expect(kindToU8(kindFromU8(2))).toBe(2);
  });
});

// ─── parseBodyState ───────────────────────────────────────────────────────────

describe('parseBodyState', () => {
  it('parses a 13-element array into structured state', () => {
    const arr = new Float32Array([
      // position
      1, 2, 3,
      // rotation (quaternion)
      0, 0, 0.7071, 0.7071,
      // linear velocity
      4, 5, 6,
      // angular velocity
      0.1, 0.2, 0.3,
    ]);

    const state = parseBodyState(arr);

    expect(state.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(state.rotation.x).toBeCloseTo(0);
    expect(state.rotation.w).toBeCloseTo(0.7071);
    expect(state.linearVelocity).toEqual({ x: 4, y: 5, z: 6 });
    expect(state.angularVelocity.x).toBeCloseTo(0.1);
  });

  it('defaults to 0 / 1 for missing values (short array)', () => {
    const arr = new Float32Array(13); // all zeros
    const state = parseBodyState(arr);
    expect(state.rotation.w).toBe(1); // w defaults to 1 (identity rotation)
  });

  it('does not throw on an empty array', () => {
    const arr = new Float32Array(0);
    expect(() => parseBodyState(arr)).not.toThrow();
  });
});

// ─── cloneBodyState ───────────────────────────────────────────────────────────

describe('cloneBodyState', () => {
  it('produces a deep clone — modifying original does not affect clone', () => {
    const arr = new Float32Array([1,2,3, 0,0,0,1, 4,5,6, 0,0,0]);
    const original = parseBodyState(arr);
    const clone = cloneBodyState(original);

    original.position.x = 999;
    expect(clone.position.x).toBe(1); // clone is unaffected
  });

  it('produces a deep clone — modifying clone does not affect original', () => {
    const arr = new Float32Array([1,2,3, 0,0,0,1, 4,5,6, 0,0,0]);
    const original = parseBodyState(arr);
    const clone = cloneBodyState(original);

    clone.linearVelocity.z = 999;
    expect(original.linearVelocity.z).toBe(6); // original unaffected
  });
});

// ─── vec3 ─────────────────────────────────────────────────────────────────────

describe('vec3', () => {
  it('defaults to (0,0,0) with no args', () => {
    expect(vec3()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('fills missing fields with 0', () => {
    expect(vec3({ x: 5 })).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('preserves all provided values', () => {
    expect(vec3({ x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
  });
});

// ─── quat ─────────────────────────────────────────────────────────────────────

describe('quat', () => {
  it('defaults to identity quaternion (0,0,0,1) with no args', () => {
    expect(quat()).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it('fills missing fields with 0 (except w=1)', () => {
    expect(quat({ z: 0.5 })).toEqual({ x: 0, y: 0, z: 0.5, w: 1 });
  });

  it('allows overriding w', () => {
    expect(quat({ x: 0, y: 0, z: 0.7071, w: 0.7071 }).w).toBeCloseTo(0.7071);
  });
});
```

---

## Étape 2 — Vérification

```bash
cd packages/physics3d

npx vitest run src/plugin/__tests__/physics3d-utils.test.ts

# Résultat attendu :
# ✓ toEntityIndex (4 tests)
# ✓ kindFromU8 (5 tests)
# ✓ kindToU8 (3 tests)
# ✓ kindFromU8 / kindToU8 roundtrip (3 tests)
# ✓ parseBodyState (3 tests)
# ✓ cloneBodyState (2 tests)
# ✓ vec3 (3 tests)
# ✓ quat (3 tests)
# Total : 26 tests
```

---

## Résumé des fichiers créés
| Fichier | Tests |
|---------|-------|
| `packages/physics3d/src/plugin/__tests__/physics3d-utils.test.ts` | 26 tests unitaires pour les 7 fonctions pures |
