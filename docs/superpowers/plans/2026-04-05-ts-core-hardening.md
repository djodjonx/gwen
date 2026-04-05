# TypeScript Engine Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 4 issues critiques dans le core TypeScript : appliquer `targetFPS`, ajouter un error boundary sur le frame loop, isoler les utilitaires de test hors de l'API publique, et fixer l'adressage multi-canal du `WasmRingBuffer`.

**Architecture:** Les fixes sont indépendants et peuvent être mergés séparément. `targetFPS` utilise un throttle timestamp dans le RAF loop sans changer la signature publique. L'error boundary s'appuie sur le hook system `hookable` déjà en place en ajoutant `'engine:error'` à `GwenRuntimeHooks`. Les utilitaires de test migrent vers un sub-path export `@gwenjs/core/test-utils` via le champ `exports` de `package.json`. `WasmRingBuffer` reçoit `byteOffset` comme champ de `WasmChannelOptions`.

**Tech Stack:** TypeScript, Vitest, hookable, wasm-bindgen

---

## Fichiers modifiés

| Fichier | Action |
|---|---|
| `packages/core/src/engine/runtime-hooks.ts` | Ajouter `'engine:error'` hook |
| `packages/core/src/engine/gwen-engine.ts` | Appliquer `targetFPS`, ajouter error boundary, `startExternal` fix |
| `packages/core/src/engine/wasm-module-handle.ts` | Ajouter `byteOffset` à `WasmChannelOptions` et `WasmRingBuffer` |
| `packages/core/src/engine/test-utils.ts` | Nouveau fichier — exports de test isolés |
| `packages/core/src/index.ts` | Retirer `_resetWasmBridge` etc. du barrel |
| `packages/core/package.json` | Ajouter sub-path `./test-utils` dans `exports` |
| `packages/core/tests/frame-loop.test.ts` | Tests targetFPS, error boundary |
| `packages/core/tests/wasm-bridge.test.ts` | Migrer imports vers `@gwenjs/core/test-utils` |

---

## Task 1 : Ajouter `'engine:error'` au hook system (prérequis Task 2)

**Files:**
- Modify: `packages/core/src/engine/runtime-hooks.ts`

- [ ] **Étape 1 : Ajouter le hook dans l'interface**

Dans `packages/core/src/engine/runtime-hooks.ts`, après `'engine:afterTick'` :

```typescript
/**
 * Fired when an unhandled error is thrown during a frame tick.
 *
 * If no handler is registered, the error is re-thrown and becomes an
 * unhandled Promise rejection. Register a handler via `engine.hook('engine:error', ...)`
 * to recover gracefully (e.g. log, pause, show an error overlay).
 *
 * @example
 * ```typescript
 * engine.hook('engine:error', (err) => {
 *   console.error('[Game] Frame error, pausing:', err);
 *   engine.stop();
 * });
 * ```
 */
'engine:error': (error: unknown) => void;
```

- [ ] **Étape 2 : Vérifier que TypeScript compile**

```bash
pnpm --filter @gwenjs/core exec tsc --noEmit 2>&1 | head -20
```

Résultat attendu : aucune erreur liée au hook.

- [ ] **Étape 3 : Commit**

```bash
git add packages/core/src/engine/runtime-hooks.ts
git commit -m "feat(core): add engine:error hook to GwenRuntimeHooks

Enables plugins and game code to handle frame-loop errors gracefully
instead of relying on the browser's unhandled rejection handler.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2 : Appliquer `targetFPS` et ajouter l'error boundary dans le frame loop (T-C1, T-C2)

**Files:**
- Modify: `packages/core/src/engine/gwen-engine.ts`
- Modify: `packages/core/tests/frame-loop.test.ts`

- [ ] **Étape 1 : Écrire les tests avant de modifier le code**

Dans `packages/core/tests/frame-loop.test.ts`, ajouter :

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEngine } from '../src';

describe('Frame loop — targetFPS', () => {
  it('skips frames that arrive too early', async () => {
    const engine = await createEngine({ targetFPS: 30 });
    let frameCalls = 0;
    engine.hook('engine:tick', () => { frameCalls++; });

    // Simuler 3 RAF callbacks espacées de 10ms (< 1000/30 ≈ 33ms)
    // → seule la première frame doit passer
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementationOnce((cb) => { cb(0); return 1; })
      .mockImplementationOnce((cb) => { cb(10); return 2; })  // trop tôt
      .mockImplementationOnce((cb) => { cb(20); return 3; }); // trop tôt

    await engine.start();
    await new Promise((r) => setTimeout(r, 50));
    await engine.stop();

    expect(frameCalls).toBe(1);
    rafSpy.mockRestore();
  });
});

describe('Frame loop — error boundary', () => {
  it('calls engine:error hook when a plugin throws in onUpdate', async () => {
    const engine = await createEngine();
    const errors: unknown[] = [];
    engine.hook('engine:error', (err) => errors.push(err));

    engine.hook('engine:tick', () => {
      throw new Error('plugin exploded');
    });

    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementationOnce((cb) => { cb(0); return 1; })
      .mockImplementation(() => 0);

    await engine.start();
    await new Promise((r) => setTimeout(r, 50));
    await engine.stop();
    rafSpy.mockRestore();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('plugin exploded');
  });

  it('re-throws if no engine:error handler is registered', async () => {
    const engine = await createEngine();
    engine.hook('engine:tick', () => { throw new Error('unhandled'); });

    const rejections: unknown[] = [];
    const handler = (ev: PromiseRejectionEvent) => rejections.push(ev.reason);
    globalThis.addEventListener('unhandledrejection', handler);

    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementationOnce((cb) => { cb(0); return 1; })
      .mockImplementation(() => 0);

    await engine.start();
    await new Promise((r) => setTimeout(r, 50));
    await engine.stop();
    rafSpy.mockRestore();
    globalThis.removeEventListener('unhandledrejection', handler);

    expect(rejections.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Étape 2 : Lancer les tests pour confirmer l'échec**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/frame-loop.test.ts 2>&1 | tail -20
```

Résultat attendu : `FAILED`.

- [ ] **Étape 3 : Modifier le frame loop dans `gwen-engine.ts`**

Trouver la méthode `start()` (ligne ~697) et remplacer le corps de la fonction `loop` :

```typescript
async start(): Promise<void> {
  if (this._running) return;
  this._running = true;
  this._lastFrameTime = performance.now();

  // Intervalle minimum entre deux frames selon targetFPS (ms)
  const minFrameInterval = 1000 / this.targetFPS;

  const loop = async (now: number) => {
    if (!this._running) return;

    const rawDt = now - this._lastFrameTime;

    // Throttle : ignorer les frames trop rapides
    if (rawDt < minFrameInterval) {
      this._rafHandle = requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(rawDt, this.maxDeltaSeconds * 1000);
    this._lastFrameTime = now;
    this._deltaTime = dt;

    try {
      await this._runFrame(dt);
    } catch (err) {
      // Propager via le hook engine:error pour permettre la récupération.
      // Si aucun handler n'est enregistré, hookable re-throw l'erreur.
      if (this.hooks.hasHooks('engine:error' as any)) {
        await this.hooks.callHook('engine:error' as any, err);
      } else {
        throw err;
      }
    } finally {
      if (this._running) this._rafHandle = requestAnimationFrame(loop);
    }
  };

  this._rafHandle = requestAnimationFrame(loop);
}
```

- [ ] **Étape 4 : Corriger `startExternal()` — setter `_running = true`**

Trouver `startExternal()` (ligne ~742) et ajouter `this._running = true` :

```typescript
async startExternal(): Promise<void> {
  if (this._running) return;   // idempotency guard
  this._running = true;        // ← manquait
  await this.hooks.callHook('engine:init');
  await this.hooks.callHook('engine:start');
}
```

- [ ] **Étape 5 : Lancer les tests**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/frame-loop.test.ts 2>&1 | tail -20
```

Résultat attendu : tous `✓`.

- [ ] **Étape 6 : Lancer tous les tests core pour détecter les régressions**

```bash
pnpm --filter @gwenjs/core test 2>&1 | tail -20
```

Résultat attendu : pas de nouveau `FAILED`.

- [ ] **Étape 7 : Commit**

```bash
git add packages/core/src/engine/gwen-engine.ts packages/core/tests/frame-loop.test.ts
git commit -m "fix(core): enforce targetFPS throttle and add engine:error boundary in frame loop

targetFPS was stored but never enforced — games ran at native refresh rate
regardless of the configured value. A timestamp-based guard now skips frames
that arrive before 1000/targetFPS ms have elapsed.

Unhandled errors in _runFrame now route through engine:error hook instead of
becoming silent unhandled Promise rejections. If no handler is registered,
the error is re-thrown (same behavior as before, but now auditable).

Also fixes startExternal() which never set _running=true, making stop() non-idempotent.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3 : Isoler les utilitaires de test dans un sub-path export (T-C3)

**Files:**
- Create: `packages/core/src/engine/test-utils.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/core/tests/wasm-bridge.test.ts` (et autres fichiers de test impactés)

- [ ] **Étape 1 : Créer `test-utils.ts`**

Créer `packages/core/src/engine/test-utils.ts` :

```typescript
/**
 * @internal Test utilities for @gwenjs/core.
 *
 * Import via: `import { _resetWasmBridge } from '@gwenjs/core/test-utils'`
 *
 * ⚠️  Never import these in production code. They manipulate module-level
 * singletons and will corrupt the engine state in non-test environments.
 */
export {
  _resetWasmBridge,
  _injectMockWasmEngine,
  _injectMockWasmExports,
} from './wasm-bridge';
```

- [ ] **Étape 2 : Retirer ces exports du barrel `index.ts`**

Dans `packages/core/src/index.ts`, trouver le bloc :

```typescript
export {
  initWasm, getWasmBridge,
  _resetWasmBridge,
  _injectMockWasmEngine,
} from './engine/wasm-bridge';
```

Et le remplacer par :

```typescript
export { initWasm, getWasmBridge } from './engine/wasm-bridge';
// _resetWasmBridge and _injectMockWasmEngine are available via @gwenjs/core/test-utils
```

- [ ] **Étape 3 : Ajouter le sub-path dans `package.json`**

Dans `packages/core/package.json`, dans le champ `exports` :

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./test-utils": "./src/engine/test-utils.ts"
  }
}
```

> **Note :** vérifier la forme exacte du champ `exports` existant et conserver tous les champs déjà présents (dist, types, etc.).

- [ ] **Étape 4 : Mettre à jour les imports dans les tests**

```bash
grep -rn "_resetWasmBridge\|_injectMockWasmEngine\|_injectMockWasmExports" packages/core/tests/ | cut -d: -f1 | sort -u
```

Pour chaque fichier listé, changer :

```typescript
// AVANT
import { _resetWasmBridge, _injectMockWasmEngine } from '../src';
// ou
import { _resetWasmBridge } from '@gwenjs/core';

// APRÈS
import { _resetWasmBridge, _injectMockWasmEngine } from '@gwenjs/core/test-utils';
// ou pour les imports relatifs dans le package lui-même :
import { _resetWasmBridge } from '../src/engine/test-utils';
```

- [ ] **Étape 5 : Vérifier que les tests passent toujours**

```bash
pnpm --filter @gwenjs/core test 2>&1 | tail -20
```

Résultat attendu : tous `✓`, aucun import cassé.

- [ ] **Étape 6 : Vérifier que l'API publique ne contient plus les exports privés**

```bash
pnpm --filter @gwenjs/core exec tsc --noEmit 2>&1 | head -20
node -e "const c = require('./packages/core/src/index.ts'); console.log(Object.keys(c).filter(k => k.startsWith('_')))"
```

Résultat attendu : aucun export `_*` dans le barrel principal.

- [ ] **Étape 7 : Commit**

```bash
git add packages/core/src/engine/test-utils.ts packages/core/src/index.ts packages/core/package.json packages/core/tests/
git commit -m "refactor(core): isolate test utilities behind @gwenjs/core/test-utils sub-path

_resetWasmBridge and _injectMockWasmEngine were exported in the public API
barrel, making module-level singleton manipulation available to all consumers.
Now gated behind ./test-utils sub-path export in package.json.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4 : Fixer `WasmRingBuffer.byteOffset` — multi-channel (T-C4)

**Files:**
- Modify: `packages/core/src/engine/wasm-module-handle.ts`
- Modify: `packages/core/tests/wasm-bridge.test.ts` (ou nouveau fichier de test)

- [ ] **Étape 1 : Lire la définition actuelle de `WasmChannelOptions`**

```bash
grep -n "WasmChannelOptions\|byteOffset\|_byteOffset" packages/core/src/engine/wasm-module-handle.ts | head -20
```

- [ ] **Étape 2 : Écrire le test**

Dans `packages/core/tests/wasm-bridge.test.ts` (ou `wasm-module-handle.test.ts`), ajouter :

```typescript
import { WasmRingBuffer } from '../src/engine/wasm-module-handle';

describe('WasmRingBuffer — multi-channel addressing', () => {
  it('uses byteOffset from WasmChannelOptions instead of always 0', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    // Channel A commence à offset 0, channel B à offset 64
    const bufA = new WasmRingBuffer(memory, { name: 'commands', direction: 'js-to-wasm', capacity: 4, itemByteSize: 8, byteOffset: 0 });
    const bufB = new WasmRingBuffer(memory, { name: 'events',   direction: 'wasm-to-js', capacity: 4, itemByteSize: 8, byteOffset: 64 });

    // Écrire dans bufA, vérifier que ça n'écrase pas bufB
    const itemA = new Uint8Array(8).fill(0xAA);
    bufA.push(itemA);

    const view = new Uint8Array(memory.buffer);
    // L'écriture de bufA doit être à offset 0..8, pas à offset 64..72
    expect(view[0]).toBe(0xAA);
    expect(view[64]).toBe(0x00); // bufB non touché
  });

  it('writes to correct offset when byteOffset > 0', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const buf = new WasmRingBuffer(memory, { name: 'events', direction: 'wasm-to-js', capacity: 4, itemByteSize: 8, byteOffset: 128 });

    const item = new Uint8Array(8).fill(0xBB);
    buf.push(item);

    const view = new Uint8Array(memory.buffer);
    expect(view[128]).toBe(0xBB);
    expect(view[0]).toBe(0x00); // offset 0 non touché
  });
});
```

- [ ] **Étape 3 : Vérifier que les tests échouent (byteOffset toujours 0)**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/wasm-bridge.test.ts 2>&1 | grep -E "FAIL|PASS|✓|✗" | head -10
```

- [ ] **Étape 4 : Ajouter `byteOffset` à `WasmChannelOptions`**

Dans `packages/core/src/engine/wasm-module-handle.ts` :

```typescript
// AVANT
export interface WasmChannelOptions {
  readonly name: string;
  readonly direction: 'js-to-wasm' | 'wasm-to-js';
  readonly capacity: number;
  readonly itemByteSize: number;
}

// APRÈS
export interface WasmChannelOptions {
  readonly name: string;
  readonly direction: 'js-to-wasm' | 'wasm-to-js';
  readonly capacity: number;
  readonly itemByteSize: number;
  /**
   * Byte offset within the module's WebAssembly.Memory where this ring buffer
   * begins. Defaults to 0 for single-channel modules.
   *
   * When a module exposes multiple channels, each must have a distinct
   * byteOffset so they don't overlap in memory.
   */
  readonly byteOffset?: number;
}
```

- [ ] **Étape 5 : Utiliser `byteOffset` dans le constructeur de `WasmRingBuffer`**

```typescript
// AVANT
constructor(memory: WebAssembly.Memory, opts: WasmChannelOptions) {
  this._memory = memory;
  this._byteOffset = 0; // ← toujours 0
  this._capacity = opts.capacity;
  this._itemByteSize = opts.itemByteSize;
}

// APRÈS
constructor(memory: WebAssembly.Memory, opts: WasmChannelOptions) {
  this._memory = memory;
  this._byteOffset = opts.byteOffset ?? 0;
  this._capacity = opts.capacity;
  this._itemByteSize = opts.itemByteSize;
}
```

- [ ] **Étape 6 : Lancer les tests**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/wasm-bridge.test.ts 2>&1 | tail -10
pnpm --filter @gwenjs/core test 2>&1 | tail -10
```

Résultat attendu : tous `✓`.

- [ ] **Étape 7 : Commit**

```bash
git add packages/core/src/engine/wasm-module-handle.ts packages/core/tests/wasm-bridge.test.ts
git commit -m "fix(core): WasmRingBuffer now respects byteOffset from WasmChannelOptions

_byteOffset was hardcoded to 0 — any module using multiple channels would
have all ring buffers starting at offset 0, causing them to overwrite each
other. Now reads opts.byteOffset ?? 0 for correct multi-channel addressing.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5 : Ajouter un timeout à `initWasm()` (T-I1)

**Files:**
- Modify: `packages/core/src/engine/wasm-bridge.ts`
- Modify: `packages/core/tests/wasm-bridge.test.ts`

- [ ] **Étape 1 : Localiser `initWasm` et l'appel `fetch`**

```bash
grep -n "initWasm\|fetch.*wasm\|resolvedWasmUrl" packages/core/src/engine/wasm-bridge.ts | head -15
```

- [ ] **Étape 2 : Écrire le test**

```typescript
describe('initWasm — timeout', () => {
  it('rejects with a timeout error if fetch takes too long', async () => {
    // Simuler un fetch qui ne résout jamais
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}), // hang infini
    );

    await expect(
      initWasm('/fake.wasm', { timeoutMs: 100 })
    ).rejects.toThrow(/timeout/i);

    vi.restoreAllMocks();
  });
});
```

- [ ] **Étape 3 : Ajouter `timeoutMs` à la signature d'`initWasm` et l'implémenter**

```typescript
// Dans wasm-bridge.ts — modifier la signature d'initWasm :
export async function initWasm(
  wasmUrl?: string | URL,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  // Wrapper fetch avec AbortController
  async function fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      return resp;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(
          `[GwenBridge] WASM fetch timed out after ${timeoutMs}ms for URL: ${url}. ` +
          `Check that the file is served correctly.`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Remplacer l'appel fetch existant par fetchWithTimeout
  const wasmInput = resolvedWasmUrl ? await fetchWithTimeout(resolvedWasmUrl) : undefined;
  // ... reste du code inchangé ...
}
```

- [ ] **Étape 4 : Lancer les tests**

```bash
pnpm --filter @gwenjs/core exec vitest run tests/wasm-bridge.test.ts 2>&1 | tail -10
```

- [ ] **Étape 5 : Commit**

```bash
git add packages/core/src/engine/wasm-bridge.ts packages/core/tests/wasm-bridge.test.ts
git commit -m "fix(core): add configurable fetch timeout to initWasm (default 10s)

Without a timeout, initWasm() would hang indefinitely if the WASM binary
was unavailable (wrong path, network issue, offline). Now aborts after
10 seconds (configurable) with an actionable error message.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6 : Tests de régression globaux

- [ ] **Étape 1 : Typecheck complet**

```bash
pnpm typecheck 2>&1 | tail -20
```

Résultat attendu : 0 erreur.

- [ ] **Étape 2 : Tests complets du package core**

```bash
pnpm --filter @gwenjs/core test 2>&1 | tail -20
```

Résultat attendu : tous `✓`.

- [ ] **Étape 3 : Lint**

```bash
pnpm lint 2>&1 | tail -20
```

Résultat attendu : 0 erreur.
