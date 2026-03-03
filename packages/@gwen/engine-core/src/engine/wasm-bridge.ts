/**
 * WASM Bridge — Interface between @gwen/engine-core (TypeScript) and gwen_core.wasm (Rust).
 *
 * The Rust/WASM core is MANDATORY — no TypeScript fallback exists.
 * Call `await initWasm()` BEFORE creating the Engine, or an error is thrown.
 *
 * @example
 * ```typescript
 * await initWasm();          // Auto-resolves from @gwen/engine-core/wasm/
 * const engine = getEngine();
 * engine.start();
 * ```
 */

// ── wasm-bindgen generated module types ───────────────────────────────────────

/**
 * Opaque entity handle from Rust (index + generation pair).
 * Both fields must be passed back to safely detect stale references.
 */
export interface WasmEntityId {
  readonly index: number;
  readonly generation: number;
}

/** Minimal interface for the wasm-bindgen generated gwen_core module */
export interface GwenCoreWasm {
  Engine: {
    new (maxEntities: number): WasmEngine;
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
  remove_entity_from_query(index: number): void;
  query_entities(typeIds: Uint32Array): Uint32Array;
  get_entity_generation(index: number): number;

  // GameLoop
  tick(deltaMs: number): void;
  frame_count(): bigint;
  delta_time(): number;
  total_time(): number;

  // Stats
  stats(): string;
}

// ── Internal state ────────────────────────────────────────────────────────────

let _wasmEngine: WasmEngine | null = null;
let _wasmModule: GwenCoreWasm | null = null;
let _initPromise: Promise<void> | null = null;
let _maxEntities = 10_000;

/**
 * Base URL for WASM artifacts (auto-resolved in browser, null in Node).
 *
 * Resolution strategy (in order):
 *  1. In browser: /wasm/ relative to current origin.
 *     @gwen/vite-plugin serves this via middleware (dev)
 *     and CLI copies it to dist/wasm/ (build).
 *  2. In Node (SSR/tests): null — initWasm() must receive explicit URL.
 *
 * We avoid new URL('../wasm/', import.meta.url) because in Vite dev mode
 * it produces an @fs/.../.../engine-core/wasm path without trailing slash,
 * resulting in an invalid URL.
 */
const _pkgWasmBase: string | null = (() => {
  if (typeof window !== 'undefined' && typeof location !== 'undefined') {
    // Browser — artifacts always served from /wasm/ by Vite plugin
    return `${location.origin}/wasm/`;
  }
  return null;
})();

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Load and initialize the gwen_core WASM module. **REQUIRED** before any Engine usage.
 *
 * **Without arguments**: Auto-resolves from `@gwen/engine-core/wasm/`
 * (pre-compiled artifacts published in the package — no Rust build needed).
 *
 * @param jsUrl Optional URL to the wasm-bindgen glue (gwen_core.js)
 * @param wasmUrl Optional URL to the WASM binary (gwen_core_bg.wasm)
 * @param maxEntities Max number of entities the engine can track (default: 10,000)
 * @throws {Error} If WASM cannot be loaded or has invalid format
 *
 * @example
 * ```typescript
 * // Standard usage — zero config
 * await initWasm();
 *
 * // Explicit URLs (custom path, CDN, etc.)
 * await initWasm('/custom/gwen_core.js', '/custom/gwen_core_bg.wasm');
 * ```
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
      '[GWEN] initWasm(): unable to resolve WASM glue URL.\n' +
        'Make sure @gwen/engine-core is correctly installed.',
    );
  }

  _initPromise = (async () => {
    const glue = await loadWasmGlue(resolvedJsUrl);

    const wasmInput = resolvedWasmUrl ? fetch(resolvedWasmUrl) : undefined;

    if (typeof glue.default === 'function') {
      await glue.default({ module_or_path: wasmInput });
    } else if (typeof glue.initSync === 'function') {
      const buf = await (await fetch(resolvedWasmUrl!)).arrayBuffer();
      glue.initSync({ module: buf });
    } else {
      throw new Error(
        '[GWEN] WASM glue has no init() function — corrupted file?',
      );
    }

    if (typeof glue.Engine !== 'function') {
      throw new Error('[GWEN] WASM glue loaded but Engine class not found.');
    }

    _wasmModule = glue as GwenCoreWasm;
    _wasmEngine = new glue.Engine(maxEntities);

    console.log('[GWEN] WASM core loaded — Rust ECS active');
  })().catch((err) => {
    // Clean up to allow retry
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

    const blob = new Blob(
      [
        `import * as glue from '${new URL(jsUrl, location.href).href}';`,
        `window['${key}'] = glue;`,
        `window['${key}__resolve']?.();`,
      ],
      { type: 'text/javascript' },
    );

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
      reject(new Error(`[GWEN] Unable to load WASM glue: ${jsUrl}\n${e}`));
    };

    document.head.appendChild(script);
  });
}

// ── Public Bridge ─────────────────────────────────────────────────────────────

/**
 * WASM bridge interface. All methods throw an error if
 * `initWasm()` was not called first.
 */
export interface WasmBridge {
  /** True if Rust/WASM core is initialized and ready. */
  isActive(): boolean;

  /** Direct access to Rust WasmEngine. Throws if not initialized. */
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
  removeEntityFromQuery(index: number): void;
  queryEntities(typeIds: number[]): number[];
  getEntityGeneration(index: number): number;

  // ── GameLoop ──
  tick(deltaMs: number): void;

  // ── Stats ──
  stats(): string;
}

function requireWasm(): WasmEngine {
  if (!_wasmEngine) {
    throw new Error(
      '[GWEN] WASM core not initialized.\n' +
        'Call `await initWasm()` before starting the Engine.',
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

  removeEntityFromQuery(index: number): void {
    requireWasm().remove_entity_from_query(index);
  }

  queryEntities(typeIds: number[]): number[] {
    const indices = Array.from(requireWasm().query_entities(new Uint32Array(typeIds)));
    // Reconstruct packed EntityIds: (generation << 20) | index
    return indices.map((idx) => {
      const gen = requireWasm().get_entity_generation(idx);
      return (gen << 20) | (idx & 0xfffff);
    });
  }

  getEntityGeneration(index: number): number {
    return requireWasm().get_entity_generation(index);
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

/** Returns the WasmBridge singleton. */
export function getWasmBridge(): WasmBridge {
  return _bridge;
}

/**
 * Injects a mock WasmEngine directly — reserved for unit tests.
 * Allows testing the Engine without a real browser.
 */
export function _injectMockWasmEngine(mock: WasmEngine): void {
  _wasmEngine = mock;
  _initPromise = Promise.resolve();
}

/** Complete reset — reserved for unit tests. */
export function _resetWasmBridge(): void {
  _wasmEngine = null;
  _wasmModule = null;
  _initPromise = null;
}
