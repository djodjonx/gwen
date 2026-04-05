# Plan TS-05 — Tests unitaires pour `renderer-canvas2d` et `r3f`

## Objectif
- `@gwenjs/renderer-canvas2d` : 1065 LOC avec **1 seul test**. Ajouter des tests pour `ShapeRenderer` (shapes.ts) et le renderer principal.
- `@gwenjs/r3f` : **0 tests** pour les hooks React Three Fiber.

## Impact sur les autres packages
- Aucun. Ces tests sont internes à chaque package.

---

# Partie A — `@gwenjs/renderer-canvas2d`

## Contexte
`plugin/shapes.ts` (374 LOC) expose `ShapeRenderer` avec des méthodes statiques (`rect`, `circle`, `line`, `text`, `polygon`). Ces méthodes opèrent sur `CanvasRenderingContext2D` — on peut les tester avec un canvas headless via `OffscreenCanvas` ou via un mock de context.

`plugin/renderer.ts` (515 LOC) contient le renderer principal — plus difficile à tester car il est couplé au cycle de vie du plugin.

**Stratégie :** tester `ShapeRenderer` en isolation (pur CanvasAPI), puis ajouter des smoke tests pour le plugin renderer.

---

## Étape A1 — Setup : vérifier que `OffscreenCanvas` est disponible dans l'environnement de test

**Fichier :** `packages/renderer-canvas2d/vitest.config.ts` (ou créer si absent)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom', // fournit OffscreenCanvas dans la plupart des cas
    globals: true,
  },
});
```

Si `jsdom` ne fournit pas `OffscreenCanvas`, utiliser un mock manuel (voir Étape A2).

---

## Étape A2 — Créer un mock de CanvasRenderingContext2D

**Créer :** `packages/renderer-canvas2d/src/__tests__/canvas-mock.ts`

```typescript
/**
 * Minimal CanvasRenderingContext2D mock that tracks drawing calls.
 * Used in unit tests to verify that ShapeRenderer emits the correct draw commands.
 */
export interface CanvasCall {
  method: string;
  args: unknown[];
}

/**
 * Create a proxy that records every method call on a minimal ctx shape.
 * Returns the proxy and the call log.
 */
export function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  calls: CanvasCall[];
  reset(): void;
} {
  const calls: CanvasCall[] = [];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_, prop) {
      if (prop === 'save' || prop === 'restore' || prop === 'beginPath' ||
          prop === 'closePath' || prop === 'fill' || prop === 'stroke' ||
          prop === 'fillRect' || prop === 'arc' || prop === 'moveTo' ||
          prop === 'lineTo' || prop === 'fillText' || prop === 'translate' ||
          prop === 'rotate' || prop === 'scale') {
        return (...args: unknown[]) => {
          calls.push({ method: prop as string, args });
        };
      }
      // Writable properties
      return undefined;
    },
    set(_, prop, value) {
      calls.push({ method: `set:${String(prop)}`, args: [value] });
      return true;
    },
  };

  const ctx = new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D;

  return {
    ctx,
    calls,
    reset() { calls.length = 0; },
  };
}
```

---

## Étape A3 — Tests pour `ShapeRenderer`

**Créer :** `packages/renderer-canvas2d/src/__tests__/shapes.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ShapeRenderer } from '../plugin/shapes';
import { createMockCtx } from './canvas-mock';

describe('ShapeRenderer', () => {
  let ctx: CanvasRenderingContext2D;
  let calls: ReturnType<typeof createMockCtx>['calls'];
  let reset: () => void;

  beforeEach(() => {
    ({ ctx, calls, reset } = createMockCtx());
    reset();
  });

  // ── rect ────────────────────────────────────────────────────────────────────

  describe('rect()', () => {
    it('calls save() and restore() around drawing', () => {
      ShapeRenderer.rect(ctx, { x: 0, y: 0, width: 100, height: 50 });
      const methods = calls.map(c => c.method);
      expect(methods[0]).toBe('save');
      expect(methods[methods.length - 1]).toBe('restore');
    });

    it('calls fillRect when color is provided', () => {
      ShapeRenderer.rect(ctx, { x: 10, y: 20, width: 30, height: 40, color: 'red' });
      expect(calls.some(c => c.method === 'fillRect')).toBe(true);
    });

    it('does not call fillRect when color is omitted', () => {
      ShapeRenderer.rect(ctx, { x: 0, y: 0, width: 10, height: 10, strokeColor: 'blue' });
      expect(calls.some(c => c.method === 'fillRect')).toBe(false);
    });

    it('applies rotation via translate + rotate', () => {
      ShapeRenderer.rect(ctx, { x: 50, y: 50, width: 20, height: 20, rotation: Math.PI / 4 });
      expect(calls.some(c => c.method === 'translate')).toBe(true);
      expect(calls.some(c => c.method === 'rotate')).toBe(true);
    });

    it('sets globalAlpha when alpha is provided', () => {
      ShapeRenderer.rect(ctx, { x: 0, y: 0, width: 10, height: 10, alpha: 0.5 });
      expect(calls.some(c => c.method === 'set:globalAlpha' && c.args[0] === 0.5)).toBe(true);
    });
  });

  // ── circle ──────────────────────────────────────────────────────────────────

  describe('circle()', () => {
    it('calls save() and restore()', () => {
      ShapeRenderer.circle(ctx, { x: 50, y: 50, radius: 20 });
      const methods = calls.map(c => c.method);
      expect(methods[0]).toBe('save');
      expect(methods[methods.length - 1]).toBe('restore');
    });

    it('calls arc() with correct radius', () => {
      ShapeRenderer.circle(ctx, { x: 50, y: 50, radius: 25, color: 'green' });
      const arcCall = calls.find(c => c.method === 'arc');
      expect(arcCall).toBeDefined();
      expect(arcCall!.args[2]).toBe(25); // radius is 3rd arg to arc()
    });

    it('calls beginPath() before arc()', () => {
      ShapeRenderer.circle(ctx, { x: 0, y: 0, radius: 10 });
      const methods = calls.map(c => c.method);
      const beginIdx = methods.indexOf('beginPath');
      const arcIdx = methods.indexOf('arc');
      expect(beginIdx).toBeGreaterThan(-1);
      expect(arcIdx).toBeGreaterThan(beginIdx);
    });
  });

  // ── line ────────────────────────────────────────────────────────────────────

  describe('line()', () => {
    it('calls moveTo and lineTo', () => {
      ShapeRenderer.line(ctx, { x1: 0, y1: 0, x2: 100, y2: 100 });
      expect(calls.some(c => c.method === 'moveTo')).toBe(true);
      expect(calls.some(c => c.method === 'lineTo')).toBe(true);
    });

    it('wraps in save/restore', () => {
      ShapeRenderer.line(ctx, { x1: 0, y1: 0, x2: 10, y2: 10 });
      expect(calls[0].method).toBe('save');
      expect(calls[calls.length - 1].method).toBe('restore');
    });
  });

  // ── text ────────────────────────────────────────────────────────────────────

  describe('text()', () => {
    it('calls fillText with the provided string', () => {
      ShapeRenderer.text(ctx, { x: 10, y: 10, text: 'Hello' });
      const textCall = calls.find(c => c.method === 'fillText');
      expect(textCall).toBeDefined();
      expect(textCall!.args[0]).toBe('Hello');
    });

    it('wraps in save/restore', () => {
      ShapeRenderer.text(ctx, { x: 0, y: 0, text: 'test' });
      expect(calls[0].method).toBe('save');
      expect(calls[calls.length - 1].method).toBe('restore');
    });
  });
});
```

---

## Étape A4 — Smoke test pour le plugin renderer

**Créer :** `packages/renderer-canvas2d/src/__tests__/renderer-plugin.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Canvas2DRendererPlugin } from '../plugin/renderer';

describe('Canvas2DRendererPlugin', () => {
  it('is exported and is a non-null object', () => {
    expect(Canvas2DRendererPlugin).toBeDefined();
  });

  it('can be constructed with default config', () => {
    // Smoke test: plugin factory should not throw when called with no args
    expect(() => Canvas2DRendererPlugin()).not.toThrow();
  });
});
```

> Note : si `Canvas2DRendererPlugin` prend un canvas element obligatoire, ajuster le test en passant un canvas mock : `document.createElement('canvas')`.

---

# Partie B — `@gwenjs/r3f`

## Contexte
`packages/r3f/src/hooks.ts` expose des React hooks utilisant `@react-three/fiber`. Tester des hooks React nécessite `@testing-library/react` et un contexte React simulé.

---

## Étape B1 — Ajouter les dépendances de test

**Fichier :** `packages/r3f/package.json`

Ajouter dans `devDependencies` :
```json
"@testing-library/react": "^14.0.0",
"@testing-library/react-hooks": "^8.0.0",
"react-test-renderer": "^18.0.0"
```

---

## Étape B2 — Créer un mock du contexte R3F

**Créer :** `packages/r3f/src/__tests__/r3f-context-mock.ts`

```typescript
/**
 * Minimal mock for @react-three/fiber context.
 * Allows testing hooks that call useFrame / useThree without a real Three.js renderer.
 */
import { vi } from 'vitest';

export const mockUseFrame = vi.fn();
export const mockUseThree = vi.fn(() => ({
  camera: { position: { set: vi.fn() } },
  scene: {},
  gl: {},
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: mockUseFrame,
  useThree: mockUseThree,
}));
```

---

## Étape B3 — Tests pour les hooks r3f

**Créer :** `packages/r3f/src/__tests__/hooks.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import './r3f-context-mock'; // mock avant les imports du module

describe('r3f hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('module exports are defined', async () => {
    const mod = await import('../hooks');
    expect(mod).toBeDefined();
    // Verify at minimum that the module doesn't throw on import
    expect(typeof mod).toBe('object');
  });

  // Add hook-specific tests here once you know the hook signatures.
  // Example for a hypothetical useSyncTransform hook:
  //
  // it('useSyncTransform registers a useFrame callback', () => {
  //   const { mockUseFrame } = await import('./r3f-context-mock');
  //   renderHook(() => useSyncTransform(entityId));
  //   expect(mockUseFrame).toHaveBeenCalledOnce();
  // });
});
```

> Note : compléter les tests en fonction des hooks effectivement exportés par `hooks.ts` (consulter `packages/r3f/src/hooks.ts` pour la liste exacte).

---

## Étape B4 — Vérification

```bash
# renderer-canvas2d
cd packages/renderer-canvas2d
npx vitest run
# Attendu : tests ShapeRenderer passent (rect, circle, line, text)

# r3f
cd packages/r3f
npx vitest run
# Attendu : smoke test passe sans erreur
```

---

## Résumé des fichiers créés
| Fichier | Description |
|---------|-------------|
| `packages/renderer-canvas2d/src/__tests__/canvas-mock.ts` | Mock proxy CanvasRenderingContext2D |
| `packages/renderer-canvas2d/src/__tests__/shapes.test.ts` | 12 tests ShapeRenderer |
| `packages/renderer-canvas2d/src/__tests__/renderer-plugin.test.ts` | 2 smoke tests |
| `packages/r3f/src/__tests__/r3f-context-mock.ts` | Mock @react-three/fiber |
| `packages/r3f/src/__tests__/hooks.test.ts` | Tests de base hooks r3f |
