# RFC-003 — External Loop Control

**Statut:** Draft  
**Priorité:** P1 — Milestone 1  
**Packages impactés:** `@djodjonx/engine-core`

---

## Résumé

Permettre à un renderer externe (R3F, Three.js pur) de piloter la boucle GWEN.
Ajouter `loop: 'internal' | 'external'` à `EngineConfig` et exposer `engine.advance(delta)`.

---

## Motivation

GWEN et R3F ont chacun leur `requestAnimationFrame`. Les deux en parallèle = frames dupliquées,
états incohérents. La solution : GWEN délègue sa boucle au renderer quand demandé.

```typescript
// Avant — deux RAF en conflit
engine.start();
useFrame((_, delta) => { engine.tick(...); }); // unsafe

// Après
const engine = await createEngine({ loop: 'external', ... });
function GwenLoop() {
  useFrame((_, delta) => { engine.advance(delta); });
  return null;
}
```

---

## Design détaillé

### 1. `EngineConfig.loop`

```typescript
export interface EngineConfig {
  // ...existant...
  /**
   * 'internal' (défaut) : GWEN gère son propre RAF.
   * 'external' : pas de RAF. Consumer appelle engine.advance(delta) chaque frame.
   */
  loop?: 'internal' | 'external';
}
```

### 2. `engine.advance(delta)` — synchrone, safe

```typescript
/**
 * Avance la simulation d'un delta (secondes).
 * Uniquement en mode loop: 'external'.
 */
public advance(delta: number): void {
  if (this._loopMode !== 'external') {
    throw new Error('[GWEN] engine.advance() requires loop: "external"');
  }
  this._advancing = true;
  try {
    this._executeFrame(Math.min(delta, 0.1)); // cap 100ms
  } finally {
    this._advancing = false;
  }
}

private _executeFrame(dt: number): void {
  this.pluginManager.onBeforeUpdate(this.api, dt);
  if (this.wasmBridge.isActive()) this.wasmBridge.step(dt);
  this.pluginManager.onUpdate(this.api, dt);
  this.pluginManager.onRender(this.api);
  if (this._statsEnabled) this._updateStats(dt);
}
```

### 3. `engine.init()` — sépare init de start

```typescript
/** Initialise WASM + plugins sans démarrer la boucle. */
public async init(): Promise<void> {
  if (this._initialized) return;
  await this.wasmBridge.init();
  await this.pluginManager.onInit(this.api);
  this._initialized = true;
}

public async start(): Promise<void> {
  await this.init(); // auto-init si pas encore fait
  this.hooks.call('engine:start', undefined);
  if (this._loopMode === 'internal') this._startRAF();
  // En mode 'external' : init seulement, pas de RAF
}
```

### 4. Cycle de vie en mode external

```
createEngine({ loop: 'external' })
  → await engine.init()          WASM + plugins initialisés
  → <GwenProvider engine={engine}>
      → engine.start()           hooks fired, pas de RAF
      → <GwenLoop />             useFrame → engine.advance(delta)
```

### 5. Cas d'usage : tests unitaires sans RAF

```typescript
const engine = await createEngine({ loop: 'external', debug: true });
await engine.init();
engine.advance(1/60); // simule une frame
expect(api.component.get(id, Position).x).toBeCloseTo(5.0);
```

---

## Drawbacks

- `advance()` est synchrone — les plugins async perdent leurs awaits en mode external
- `engine.tick(now)` existant (timestamp absolu) vs `engine.advance(delta)` — deux APIs

---

## Questions ouvertes

- Renommer `engine.tick()` en `engine.advance()` ou garder les deux ?
- Mode `'worker'` (GWEN dans un Web Worker) : RFC séparé ou extension de ce RFC ?
