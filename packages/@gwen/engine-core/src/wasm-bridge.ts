/**
 * WASM Bridge — pont entre @gwen/engine-core (TypeScript) et gwen_core.wasm (Rust)
 *
 * Stratégie : chargement optionnel et transparent.
 *  - Si le .wasm est fourni via `initWasm(url)`, le bridge délègue les opérations
 *    ECS intensives au core Rust (entity lifecycle, queries, component CRUD).
 *  - Sinon l'engine fonctionne entièrement en TS pur (mode fallback).
 *
 * L'API exposée est identique dans les deux cas — le reste du framework
 * n'a pas besoin de savoir si le WASM est actif ou non.
 *
 * Utilisation :
 * ```typescript
 * import { initWasm, getWasmBridge } from '@gwen/engine-core';
 *
 * await initWasm('/assets/gwen_core.wasm');  // une seule fois au démarrage
 *
 * const bridge = getWasmBridge();
 * if (bridge.isActive()) {
 *   console.log(bridge.stats()); // stats depuis le core Rust
 * }
 * ```
 */

// ── Types du module wasm-bindgen généré ──────────────────────────────────────
// On importe via un chemin dynamique pour ne pas bloquer si le .wasm est absent.

/** Handle opaque d'une entité Rust (index + generation). */
export interface WasmEntityId {
  readonly index: number;
  readonly generation: number;
}

/** Interface minimale du module wasm-bindgen gwen_core */
export interface GwenCoreWasm {
  Engine: {
    new(maxEntities: number): WasmEngine;
  };
}

export interface WasmEngine {
  // Entity
  create_entity(): WasmEntityId;
  delete_entity(index: number, generation: number): boolean;
  is_alive(index: number, generation: number): boolean;
  count_entities(): number;

  // Component
  register_component_type(): number;
  add_component(index: number, generation: number, typeId: number, data: Uint8Array): boolean;
  remove_component(index: number, generation: number, typeId: number): boolean;
  has_component(index: number, generation: number, typeId: number): boolean;
  get_component_raw(index: number, generation: number, typeId: number): Uint8Array;

  // Query
  update_entity_archetype(index: number, typeIds: Uint32Array): void;
  query_entities(typeIds: Uint32Array): Uint32Array;

  // GameLoop
  tick(deltaMs: number): void;
  frame_count(): bigint;
  delta_time(): number;
  total_time(): number;

  // Stats
  stats(): string;
}

// ── État interne ──────────────────────────────────────────────────────────────

let _wasmEngine: WasmEngine | null = null;
let _wasmModule: GwenCoreWasm | null = null;
let _initPromise: Promise<boolean> | null = null;
let _maxEntities = 10_000;

// URL de base résolue au moment du bundling — pointe vers wasm/ co-publié dans @gwen/engine-core.
// import.meta.url fonctionne avec Vite, Rollup, esbuild (ESM natif).
// Null en environnement sans support ESM (ex: Jest CJS legacy).
const _pkgWasmBase: string | null = (() => {
  try {
    return new URL('../wasm/', import.meta.url).href;
  } catch {
    return null;
  }
})();

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Charge et initialise le module WASM gwen_core.
 *
 * **Sans argument** : résout automatiquement les artefacts depuis le dossier
 * `wasm/` co-publié dans `@gwen/engine-core`. L'utilisateur final n'a pas
 * besoin de connaître les chemins ou d'avoir Rust installé.
 *
 * ```typescript
 * // Usage minimal — zéro configuration
 * await initWasm();
 *
 * // Usage explicite (playground dev, chemin custom)
 * await initWasm('/wasm/gwen_core.js', '/wasm/gwen_core_bg.wasm');
 * ```
 *
 * Les fichiers wasm-bindgen (.js + .wasm) servis statiquement ne peuvent pas
 * être importés via import() dynamique sous Vite (erreur "file is in /public").
 * On les charge via :
 *   1. Un <script type="module"> injecté dans le DOM pour le glue JS
 *   2. fetch() + WebAssembly pour le .wasm
 *
 * @param jsUrl    URL du glue JS wasm-bindgen. Si omis, résolu depuis le package.
 * @param wasmUrl  URL du binaire .wasm. Si omis, résolu depuis le package.
 * @param maxEntities  Capacité maximale d'entités (défaut: 10 000)
 * @returns `true` si le WASM a été chargé avec succès, `false` sinon
 */
export async function initWasm(
  jsUrl?: string,
  wasmUrl?: string,
  maxEntities = 10_000,
): Promise<boolean> {
  if (_wasmEngine) return true;
  if (_initPromise) return _initPromise;

  _maxEntities = maxEntities;

  // Résolution automatique depuis le package si pas de chemin fourni
  const resolvedJsUrl = jsUrl ?? (_pkgWasmBase ? `${_pkgWasmBase}gwen_core.js` : null);
  const resolvedWasmUrl = wasmUrl ?? (_pkgWasmBase ? `${_pkgWasmBase}gwen_core_bg.wasm` : null);

  if (!resolvedJsUrl) {
    console.warn('[GWEN] initWasm(): impossible de résoudre l\'URL du glue WASM — mode TS-only');
    _initPromise = Promise.resolve(false);
    return false;
  }

  _initPromise = (async () => {
    try {
      // ── Charger le glue JS wasm-bindgen via un module script tag ──────
      // On ne peut pas faire import() sur un fichier /public sous Vite,
      // mais on peut l'injecter comme <script type="module"> et exposer
      // son export via une promesse sur window.__gwenWasmGlue.

      const glue = await loadWasmGlue(resolvedJsUrl);

      // ── Initialiser le module WASM ─────────────────────────────────────
      // glue.default est la fonction init() générée par wasm-bindgen.
      // On lui passe soit l'URL du .wasm soit un fetch() Response.
      const wasmInput = resolvedWasmUrl
        ? fetch(resolvedWasmUrl)
        : undefined;

      if (typeof glue.default === 'function') {
        await glue.default(wasmInput);
      } else if (typeof glue.initSync === 'function') {
        // fallback synchrone (rare)
        const buf = await (await fetch(resolvedWasmUrl!)).arrayBuffer();
        glue.initSync(buf);
      }

      // ── Instancier l'Engine Rust ───────────────────────────────────────
      if (typeof glue.Engine !== 'function') {
        throw new Error('[GWEN] wasm glue loaded but Engine class not found');
      }

      _wasmModule = glue as GwenCoreWasm;
      _wasmEngine = new glue.Engine(maxEntities);

      console.log('[GWEN] WASM core loaded — Rust ECS active');
      return true;
    } catch (err) {
      console.warn('[GWEN] WASM core unavailable — running in TS-only mode', err);
      _wasmEngine = null;
      _wasmModule = null;
      return false;
    }
  })();

  return _initPromise;
}

/**
 * Charge un module ES via un <script type="module"> injecté dans le DOM.
 * Contourne la restriction Vite sur import() des fichiers /public.
 * Compatible navigateur et SSR (dans SSR on ne peut pas faire ça — retourne {}).
 */
async function loadWasmGlue(jsUrl: string): Promise<any> {
  // Environnement Node / SSR — pas de DOM
  if (typeof document === 'undefined') {
    throw new Error('[GWEN] WASM requires a browser environment');
  }

  return new Promise<any>((resolve, reject) => {
    // Clé unique par URL pour éviter les doublons
    const key = `__gwenGlue_${jsUrl.replace(/\W/g, '_')}`;

    if ((window as any)[key]) {
      resolve((window as any)[key]);
      return;
    }

    // Créer un script wrapper qui importe le glue et l'expose sur window
    const blob = new Blob([
      `import * as glue from '${new URL(jsUrl, location.href).href}';`,
      `window['${key}'] = glue;`,
      `window['${key}__resolve']?.();`,
    ], { type: 'text/javascript' });

    const blobUrl = URL.createObjectURL(blob);

    // Exposer le resolve pour que le script blob puisse l'appeler
    (window as any)[`${key}__resolve`] = () => {
      URL.revokeObjectURL(blobUrl);
      script.remove();
      resolve((window as any)[key]);
    };

    const script = document.createElement('script');
    script.type = 'module';
    script.src = blobUrl;
    script.onerror = (e) => {
      URL.revokeObjectURL(blobUrl);
      script.remove();
      reject(new Error(`[GWEN] Failed to load wasm glue: ${jsUrl} — ${e}`));
    };

    document.head.appendChild(script);
  });
}


// ── Bridge public ─────────────────────────────────────────────────────────────

/**
 * Interface unifiée exposée au reste du framework.
 * Toutes les méthodes sont présentes qu'on soit en mode WASM ou TS pur.
 */
export interface WasmBridge {
  /** True si le core Rust/WASM est actif. */
  isActive(): boolean;

  /** Accès direct au WasmEngine (null si inactif). */
  engine(): WasmEngine | null;

  // ── Entity ──

  /** Crée une entité. Retourne le WasmEntityId si WASM actif, null sinon. */
  createEntity(): WasmEntityId | null;

  /** Supprime une entité. Retourne false si stale ou WASM inactif. */
  deleteEntity(index: number, generation: number): boolean;

  /** Vérifie si une entité est vivante (stale-ID safe). */
  isAlive(index: number, generation: number): boolean;

  /** Nombre d'entités vivantes dans le core Rust. */
  countEntities(): number;

  // ── Component ──

  /** Enregistre un nouveau type de composant. Retourne l'ID numérique. */
  registerComponentType(): number | null;

  /** Ajoute un composant (bytes) à une entité. */
  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean;

  /** Supprime un composant d'une entité. */
  removeComponent(index: number, generation: number, typeId: number): boolean;

  /** Vérifie si une entité possède un composant. */
  hasComponent(index: number, generation: number, typeId: number): boolean;

  /** Retourne les bytes bruts d'un composant (vide si absent). */
  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array;

  // ── Query ──

  /** Met à jour l'archétype d'une entité dans le query cache Rust. */
  updateEntityArchetype(index: number, typeIds: number[]): void;

  /** Interroge les entités ayant TOUS les typeIds spécifiés. */
  queryEntities(typeIds: number[]): number[];

  // ── GameLoop ──

  /** Avance le game loop Rust d'un delta en millisecondes. */
  tick(deltaMs: number): void;

  /** Statistiques JSON du core Rust. */
  stats(): string | null;
}

class WasmBridgeImpl implements WasmBridge {
  isActive(): boolean {
    return _wasmEngine !== null;
  }

  engine(): WasmEngine | null {
    return _wasmEngine;
  }

  // ── Entity ──

  createEntity(): WasmEntityId | null {
    if (!_wasmEngine) return null;
    return _wasmEngine.create_entity();
  }

  deleteEntity(index: number, generation: number): boolean {
    if (!_wasmEngine) return false;
    return _wasmEngine.delete_entity(index, generation);
  }

  isAlive(index: number, generation: number): boolean {
    if (!_wasmEngine) return false;
    return _wasmEngine.is_alive(index, generation);
  }

  countEntities(): number {
    if (!_wasmEngine) return 0;
    return _wasmEngine.count_entities();
  }

  // ── Component ──

  registerComponentType(): number | null {
    if (!_wasmEngine) return null;
    return _wasmEngine.register_component_type();
  }

  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean {
    if (!_wasmEngine) return false;
    return _wasmEngine.add_component(index, generation, typeId, data);
  }

  removeComponent(index: number, generation: number, typeId: number): boolean {
    if (!_wasmEngine) return false;
    return _wasmEngine.remove_component(index, generation, typeId);
  }

  hasComponent(index: number, generation: number, typeId: number): boolean {
    if (!_wasmEngine) return false;
    return _wasmEngine.has_component(index, generation, typeId);
  }

  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array {
    if (!_wasmEngine) return new Uint8Array(0);
    return _wasmEngine.get_component_raw(index, generation, typeId);
  }

  // ── Query ──

  updateEntityArchetype(index: number, typeIds: number[]): void {
    if (!_wasmEngine) return;
    _wasmEngine.update_entity_archetype(index, new Uint32Array(typeIds));
  }

  queryEntities(typeIds: number[]): number[] {
    if (!_wasmEngine) return [];
    const result = _wasmEngine.query_entities(new Uint32Array(typeIds));
    return Array.from(result);
  }

  // ── GameLoop ──

  tick(deltaMs: number): void {
    _wasmEngine?.tick(deltaMs);
  }

  stats(): string | null {
    if (!_wasmEngine) return null;
    return _wasmEngine.stats();
  }
}

// Singleton
const _bridge = new WasmBridgeImpl();

/** Retourne le singleton WasmBridge. Toujours disponible (pas de throw si WASM inactif). */
export function getWasmBridge(): WasmBridge {
  return _bridge;
}

/** Reset complet — utile pour les tests. */
export function _resetWasmBridge(): void {
  _wasmEngine = null;
  _wasmModule = null;
  _initPromise = null;
}

