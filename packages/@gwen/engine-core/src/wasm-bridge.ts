/**
 * WASM Bridge — pont entre @gwen/engine-core (TypeScript) et gwen_core.wasm (Rust)
 *
 * Le cœur Rust/WASM est OBLIGATOIRE. Il n'existe pas de fallback TS.
 * Appeler `await initWasm()` AVANT de créer l'Engine — une erreur est levée sinon.
 *
 * ```typescript
 * await initWasm();          // résolution automatique depuis @gwen/engine-core/wasm/
 * const engine = getEngine();
 * engine.start();
 * ```
 */

// ── Types du module wasm-bindgen généré ──────────────────────────────────────

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
let _initPromise: Promise<void> | null = null;
let _maxEntities = 10_000;

// URL de base pour les artefacts WASM.
//
// Stratégie de résolution (par ordre de priorité) :
//  1. En navigateur : /wasm/ relatif à l'origine courante.
//     Le @gwen/vite-plugin sert ce dossier via son middleware (dev)
//     et le CLI le copie dans dist/wasm/ (build).
//  2. En Node (SSR / tests) : null — initWasm() doit recevoir une URL explicite.
//
// On n'utilise PAS new URL('../wasm/', import.meta.url) car en mode dev Vite
// cela génère un chemin @fs/.../.../engine-core/wasm sans le slash final,
// ce qui produit une URL invalide.
const _pkgWasmBase: string | null = (() => {
  if (typeof window !== 'undefined' && typeof location !== 'undefined') {
    // Navigateur — les artefacts sont toujours servis depuis /wasm/ par le plugin Vite
    return `${location.origin}/wasm/`;
  }
  return null;
})();

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Charge et initialise le module WASM gwen_core. **Obligatoire** avant tout
 * usage de l'Engine.
 *
 * **Sans argument** : résout automatiquement depuis `@gwen/engine-core/wasm/`
 * (artefacts pré-compilés, publiés dans le package — pas besoin de Rust).
 *
 * ```typescript
 * // Usage standard — zéro configuration
 * await initWasm();
 *
 * // Usage explicite (chemin custom, CDN, etc.)
 * await initWasm('/wasm/gwen_core.js', '/wasm/gwen_core_bg.wasm');
 * ```
 *
 * @throws {Error} Si le WASM ne peut pas être chargé.
 */
export async function initWasm(
  jsUrl?: string,
  wasmUrl?: string,
  maxEntities = 10_000,
): Promise<void> {
  if (_wasmEngine) return;
  if (_initPromise) return _initPromise;

  _maxEntities = maxEntities;

  const resolvedJsUrl = jsUrl ?? (_pkgWasmBase ? `${_pkgWasmBase}gwen_core.js` : null);
  const resolvedWasmUrl = wasmUrl ?? (_pkgWasmBase ? `${_pkgWasmBase}gwen_core_bg.wasm` : null);

  if (!resolvedJsUrl) {
    throw new Error(
      '[GWEN] initWasm(): impossible de résoudre l\'URL du glue WASM.\n' +
      'Assurez-vous que @gwen/engine-core est correctement installé.'
    );
  }

  _initPromise = (async () => {
    const glue = await loadWasmGlue(resolvedJsUrl);

    const wasmInput = resolvedWasmUrl ? fetch(resolvedWasmUrl) : undefined;

    if (typeof glue.default === 'function') {
      await glue.default(wasmInput);
    } else if (typeof glue.initSync === 'function') {
      const buf = await (await fetch(resolvedWasmUrl!)).arrayBuffer();
      glue.initSync(buf);
    } else {
      throw new Error('[GWEN] Le glue WASM ne contient pas de fonction init() — fichier corrompu ?');
    }

    if (typeof glue.Engine !== 'function') {
      throw new Error('[GWEN] Le glue WASM est chargé mais la classe Engine est introuvable.');
    }

    _wasmModule = glue as GwenCoreWasm;
    _wasmEngine = new glue.Engine(maxEntities);

    console.log('[GWEN] WASM core loaded — Rust ECS active');
  })().catch(err => {
    // Nettoyer pour permettre une nouvelle tentative
    _initPromise = null;
    _wasmEngine = null;
    _wasmModule = null;
    throw err;
  });

  return _initPromise;
}

/**
 * Charge un module ES via un <script type="module"> injecté dans le DOM.
 * Contourne la restriction Vite sur import() des fichiers /public.
 */
async function loadWasmGlue(jsUrl: string): Promise<any> {
  if (typeof document === 'undefined') {
    throw new Error('[GWEN] initWasm() requiert un environnement navigateur (pas de DOM détecté).');
  }

  return new Promise<any>((resolve, reject) => {
    const key = `__gwenGlue_${jsUrl.replace(/\W/g, '_')}`;

    if ((window as any)[key]) {
      resolve((window as any)[key]);
      return;
    }

    const blob = new Blob([
      `import * as glue from '${new URL(jsUrl, location.href).href}';`,
      `window['${key}'] = glue;`,
      `window['${key}__resolve']?.();`,
    ], { type: 'text/javascript' });

    const blobUrl = URL.createObjectURL(blob);

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
      reject(new Error(`[GWEN] Impossible de charger le glue WASM: ${jsUrl}\n${e}`));
    };

    document.head.appendChild(script);
  });
}

// ── Bridge public ─────────────────────────────────────────────────────────────

/**
 * Interface du bridge WASM. Toutes les méthodes lèvent une erreur si
 * `initWasm()` n'a pas été appelé au préalable.
 */
export interface WasmBridge {
  /** True si le core Rust/WASM est initialisé et prêt. */
  isActive(): boolean;

  /** Accès direct au WasmEngine Rust. Throw si non initialisé. */
  engine(): WasmEngine;

  // ── Entity ──
  createEntity(): WasmEntityId;
  deleteEntity(index: number, generation: number): boolean;
  isAlive(index: number, generation: number): boolean;
  countEntities(): number;

  // ── Component ──
  registerComponentType(): number;
  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean;
  removeComponent(index: number, generation: number, typeId: number): boolean;
  hasComponent(index: number, generation: number, typeId: number): boolean;
  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array;

  // ── Query ──
  updateEntityArchetype(index: number, typeIds: number[]): void;
  queryEntities(typeIds: number[]): number[];

  // ── GameLoop ──
  tick(deltaMs: number): void;

  // ── Stats ──
  stats(): string;
}

function requireWasm(): WasmEngine {
  if (!_wasmEngine) {
    throw new Error(
      '[GWEN] Le core WASM n\'est pas initialisé.\n' +
      'Appelez `await initWasm()` avant de démarrer l\'Engine.'
    );
  }
  return _wasmEngine;
}

class WasmBridgeImpl implements WasmBridge {
  isActive(): boolean {
    return _wasmEngine !== null;
  }

  engine(): WasmEngine {
    return requireWasm();
  }

  createEntity(): WasmEntityId {
    return requireWasm().create_entity();
  }

  deleteEntity(index: number, generation: number): boolean {
    return requireWasm().delete_entity(index, generation);
  }

  isAlive(index: number, generation: number): boolean {
    return requireWasm().is_alive(index, generation);
  }

  countEntities(): number {
    return requireWasm().count_entities();
  }

  registerComponentType(): number {
    return requireWasm().register_component_type();
  }

  addComponent(index: number, generation: number, typeId: number, data: Uint8Array): boolean {
    return requireWasm().add_component(index, generation, typeId, data);
  }

  removeComponent(index: number, generation: number, typeId: number): boolean {
    return requireWasm().remove_component(index, generation, typeId);
  }

  hasComponent(index: number, generation: number, typeId: number): boolean {
    return requireWasm().has_component(index, generation, typeId);
  }

  getComponentRaw(index: number, generation: number, typeId: number): Uint8Array {
    return requireWasm().get_component_raw(index, generation, typeId);
  }

  updateEntityArchetype(index: number, typeIds: number[]): void {
    requireWasm().update_entity_archetype(index, new Uint32Array(typeIds));
  }

  queryEntities(typeIds: number[]): number[] {
    return Array.from(requireWasm().query_entities(new Uint32Array(typeIds)));
  }

  tick(deltaMs: number): void {
    requireWasm().tick(deltaMs);
  }

  stats(): string {
    return requireWasm().stats();
  }
}

// Singleton
const _bridge = new WasmBridgeImpl();

/** Retourne le singleton WasmBridge. */
export function getWasmBridge(): WasmBridge {
  return _bridge;
}

/**
 * Injecte un WasmEngine mock directement — réservé aux tests unitaires.
 * Permet de tester l'Engine sans navigateur réel.
 */
export function _injectMockWasmEngine(mock: WasmEngine): void {
  _wasmEngine = mock;
  _initPromise = Promise.resolve();
}

/** Reset complet — réservé aux tests unitaires. */
export function _resetWasmBridge(): void {
  _wasmEngine = null;
  _wasmModule = null;
  _initPromise = null;
}

