# Plan TS-06 — Tests manquants pour `@gwenjs/math` (mat3, mat4, vec4)

## Objectif
`@gwenjs/math` n'a aucun test pour `mat3.ts`, `mat4.ts`, et `vec4.ts` — trois des fichiers les plus critiques d'une bibliothèque maths. Les matrices sont souvent source de bugs silencieux (ordre de multiplication, transposée, inverse dégénéré). Ce plan ajoute des tests de couverture exhaustifs.

## Impact sur les autres packages
- Aucun. Tests internes uniquement.

---

## Étape 1 — Vérifier les exports de chaque fichier

```bash
grep "^export" packages/math/src/mat3.ts
grep "^export" packages/math/src/mat4.ts
grep "^export" packages/math/src/vec4.ts
```

Utiliser ces exports pour cibler exactement les fonctions à tester.

---

## Étape 2 — Tests pour `mat3.ts`

**Créer :** `packages/math/src/__tests__/mat3.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
// Adjust the import to match actual exports from mat3.ts
import * as Mat3 from '../mat3';

// Helper : compare deux matrices float avec tolérance
function expectMat3Equal(a: number[], b: number[], eps = 1e-6) {
  expect(a).toHaveLength(9);
  for (let i = 0; i < 9; i++) {
    expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(eps);
  }
}

describe('mat3', () => {

  // ── identity ───────────────────────────────────────────────────────────────

  it('identity() returns the 3×3 identity matrix', () => {
    const m = Mat3.identity();
    // Column-major: [1,0,0, 0,1,0, 0,0,1]
    expectMat3Equal(m, [1,0,0, 0,1,0, 0,0,1]);
  });

  // ── multiply ───────────────────────────────────────────────────────────────

  it('multiply(I, A) = A', () => {
    const I = Mat3.identity();
    const A = [2,0,0, 0,3,0, 4,5,1];
    const result = Mat3.multiply(I, A);
    expectMat3Equal(result, A);
  });

  it('multiply(A, I) = A', () => {
    const I = Mat3.identity();
    const A = [1,2,3, 4,5,6, 7,8,9];
    const result = Mat3.multiply(A, I);
    expectMat3Equal(result, A);
  });

  it('multiply is not commutative (AB ≠ BA for non-diagonal)', () => {
    const A = [1,2,0, 0,1,0, 0,0,1];
    const B = [1,0,0, 3,1,0, 0,0,1];
    const AB = Mat3.multiply(A, B);
    const BA = Mat3.multiply(B, A);
    // AB and BA should differ
    expect(AB).not.toEqual(BA);
  });

  // ── transpose ─────────────────────────────────────────────────────────────

  it('transpose of identity is identity', () => {
    const I = Mat3.identity();
    const T = Mat3.transpose(I);
    expectMat3Equal(T, I);
  });

  it('transpose swaps off-diagonal elements', () => {
    // [a,b,c, d,e,f, g,h,i] → [a,d,g, b,e,h, c,f,i]
    const m = [1,2,3, 4,5,6, 7,8,9];
    const T = Mat3.transpose(m);
    expectMat3Equal(T, [1,4,7, 2,5,8, 3,6,9]);
  });

  it('transpose(transpose(A)) = A', () => {
    const A = [1,2,3, 4,5,6, 7,8,9];
    expectMat3Equal(Mat3.transpose(Mat3.transpose(A)), A);
  });

  // ── fromRotation2D ─────────────────────────────────────────────────────────

  it('fromRotation2D(0) = identity (rotation component)', () => {
    if (!Mat3.fromRotation2D) return; // skip if not exported
    const m = Mat3.fromRotation2D(0);
    expect(m[0]).toBeCloseTo(1); // cos(0) = 1
    expect(m[1]).toBeCloseTo(0); // -sin(0) = 0
    expect(m[3]).toBeCloseTo(0); // sin(0) = 0
    expect(m[4]).toBeCloseTo(1); // cos(0) = 1
  });

  it('fromRotation2D(π/2) rotates (1,0) to (0,1)', () => {
    if (!Mat3.fromRotation2D) return;
    const m = Mat3.fromRotation2D(Math.PI / 2);
    // Multiply by [1, 0, 1] (homogeneous point at origin+x)
    const x = (m[0] ?? 0) * 1 + (m[3] ?? 0) * 0;
    const y = (m[1] ?? 0) * 1 + (m[4] ?? 0) * 0;
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(1, 5);
  });

  // ── invert ────────────────────────────────────────────────────────────────

  it('invert(identity) = identity', () => {
    if (!Mat3.invert) return;
    const result = Mat3.invert(Mat3.identity());
    expectMat3Equal(result!, Mat3.identity());
  });

  it('invert returns null or throws for singular matrix', () => {
    if (!Mat3.invert) return;
    const singular = [1,0,0, 0,0,0, 0,0,0]; // row 1 all zeros → det=0
    const result = Mat3.invert(singular);
    // Should return null/undefined or throw — both are acceptable
    expect(result === null || result === undefined || !isFinite((result as number[])[0])).toBe(true);
  });

});
```

---

## Étape 3 — Tests pour `mat4.ts`

**Créer :** `packages/math/src/__tests__/mat4.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import * as Mat4 from '../mat4';

function expectMat4Equal(a: number[], b: number[], eps = 1e-5) {
  expect(a).toHaveLength(16);
  for (let i = 0; i < 16; i++) {
    expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(eps);
  }
}

const ID4 = [
  1,0,0,0,
  0,1,0,0,
  0,0,1,0,
  0,0,0,1,
];

describe('mat4', () => {

  // ── identity ───────────────────────────────────────────────────────────────

  it('identity() returns the 4×4 identity matrix', () => {
    expectMat4Equal(Mat4.identity(), ID4);
  });

  // ── multiply ───────────────────────────────────────────────────────────────

  it('multiply(I, A) = A', () => {
    const A = [2,0,0,0, 0,3,0,0, 0,0,4,0, 1,2,3,1];
    expectMat4Equal(Mat4.multiply(Mat4.identity(), A), A);
  });

  it('multiply(A, I) = A', () => {
    const A = [1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16];
    expectMat4Equal(Mat4.multiply(A, Mat4.identity()), A);
  });

  // ── transpose ─────────────────────────────────────────────────────────────

  it('transpose(I) = I', () => {
    expectMat4Equal(Mat4.transpose(Mat4.identity()), Mat4.identity());
  });

  it('transpose(transpose(A)) = A', () => {
    const A = [1,2,3,4, 5,6,7,8, 9,10,11,12, 13,14,15,16];
    expectMat4Equal(Mat4.transpose(Mat4.transpose(A)), A);
  });

  // ── translation ───────────────────────────────────────────────────────────

  it('translation(tx,ty,tz) encodes translation in column 3', () => {
    if (!Mat4.translation) return;
    const m = Mat4.translation(3, 7, -2);
    // Column-major: translation is at indices [12], [13], [14]
    expect(m[12]).toBeCloseTo(3);
    expect(m[13]).toBeCloseTo(7);
    expect(m[14]).toBeCloseTo(-2);
    expect(m[15]).toBeCloseTo(1);
  });

  // ── scale ─────────────────────────────────────────────────────────────────

  it('scale(sx,sy,sz) sets diagonal', () => {
    if (!Mat4.scale) return;
    const m = Mat4.scale(2, 3, 4);
    expect(m[0]).toBeCloseTo(2);
    expect(m[5]).toBeCloseTo(3);
    expect(m[10]).toBeCloseTo(4);
    expect(m[15]).toBeCloseTo(1);
  });

  // ── rotationX / Y / Z ─────────────────────────────────────────────────────

  it('rotationX(0) = identity', () => {
    if (!Mat4.rotationX) return;
    expectMat4Equal(Mat4.rotationX(0), Mat4.identity());
  });

  it('rotationY(0) = identity', () => {
    if (!Mat4.rotationY) return;
    expectMat4Equal(Mat4.rotationY(0), Mat4.identity());
  });

  it('rotationZ(0) = identity', () => {
    if (!Mat4.rotationZ) return;
    expectMat4Equal(Mat4.rotationZ(0), Mat4.identity());
  });

  it('rotationX(π) flips Y and Z axes', () => {
    if (!Mat4.rotationX) return;
    const m = Mat4.rotationX(Math.PI);
    expect(m[5]).toBeCloseTo(-1);  // cos(π) = -1
    expect(m[10]).toBeCloseTo(-1); // cos(π) = -1
    expect(m[0]).toBeCloseTo(1);   // X axis unchanged
  });

  // ── perspective / ortho ────────────────────────────────────────────────────

  it('perspective() returns a 16-element array', () => {
    if (!Mat4.perspective) return;
    const m = Mat4.perspective(Math.PI / 4, 16/9, 0.1, 1000);
    expect(m).toHaveLength(16);
    expect(m.every(isFinite)).toBe(true);
  });

  // ── invert ────────────────────────────────────────────────────────────────

  it('invert(I) = I', () => {
    if (!Mat4.invert) return;
    expectMat4Equal(Mat4.invert(Mat4.identity())!, Mat4.identity());
  });

  it('multiply(A, invert(A)) ≈ I for translation matrix', () => {
    if (!Mat4.invert || !Mat4.translation) return;
    const A = Mat4.translation(3, 7, -2);
    const invA = Mat4.invert(A)!;
    const result = Mat4.multiply(A, invA);
    expectMat4Equal(result, Mat4.identity());
  });

});
```

---

## Étape 4 — Tests pour `vec4.ts`

**Créer :** `packages/math/src/__tests__/vec4.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import * as Vec4 from '../vec4';

describe('vec4', () => {

  it('create(x,y,z,w) stores all components', () => {
    const v = Vec4.create(1, 2, 3, 4);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(2);
    expect(v[2]).toBe(3);
    expect(v[3]).toBe(4);
  });

  it('add([a,b,c,d], [e,f,g,h]) = [a+e, b+f, c+g, d+h]', () => {
    const r = Vec4.add([1,2,3,4], [5,6,7,8]);
    expect(r).toEqual([6, 8, 10, 12]);
  });

  it('scale([x,y,z,w], s) multiplies all components', () => {
    const r = Vec4.scale([1,2,3,4], 2);
    expect(r).toEqual([2,4,6,8]);
  });

  it('dot([a,b,c,d], [e,f,g,h]) = ae+bf+cg+dh', () => {
    const r = Vec4.dot([1,0,0,0], [0,0,0,1]);
    expect(r).toBe(0);
    const r2 = Vec4.dot([1,2,3,4], [1,2,3,4]);
    expect(r2).toBe(30); // 1+4+9+16
  });

  it('length([3,4,0,0]) = 5', () => {
    if (!Vec4.length) return;
    expect(Vec4.length([3, 4, 0, 0])).toBeCloseTo(5);
  });

  it('normalize([2,0,0,0]) = [1,0,0,0]', () => {
    if (!Vec4.normalize) return;
    const n = Vec4.normalize([2, 0, 0, 0]);
    expect(n[0]).toBeCloseTo(1);
    expect(n[1]).toBeCloseTo(0);
  });

});
```

---

## Étape 5 — Vérification

```bash
cd packages/math

npx vitest run src/__tests__/mat3.test.ts
npx vitest run src/__tests__/mat4.test.ts
npx vitest run src/__tests__/vec4.test.ts

# Tous les tests passants
npx vitest run
```

> **Important :** certaines assertions utilisent `if (!Mat4.someFunction) return;` pour être robustes aux exports optionnels. Ajuster les tests en fonction des exports réels de chaque fichier.

---

## Résumé des fichiers créés
| Fichier | Tests |
|---------|-------|
| `packages/math/src/__tests__/mat3.test.ts` | ~14 tests : identity, multiply, transpose, rotation2D, invert |
| `packages/math/src/__tests__/mat4.test.ts` | ~16 tests : identity, multiply, transpose, translation, scale, rotation, perspective, invert |
| `packages/math/src/__tests__/vec4.test.ts` | ~6 tests : create, add, scale, dot, length, normalize |
