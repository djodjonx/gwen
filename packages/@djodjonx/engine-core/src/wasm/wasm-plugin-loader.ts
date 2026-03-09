/**
 * Generic WASM plugin loader.
 *
 * Réplique exacte de la stratégie blob-script-tag de `wasm-bridge.ts`,
 * généralisée pour tous les plugins WASM de l'écosystème GWEN.
 *
 * ## Usage
 * ```typescript
 * const wasm = await loadWasmPlugin<PhysicsWasmModule>({
 *   jsUrl:   '/wasm/gwen_physics2d.js',
 *   wasmUrl: '/wasm/gwen_physics2d_bg.wasm',
 *   name:    'Physics2D',
 * });
 * const plugin = new wasm.Physics2DPlugin(gravity, ptr);
 * ```
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WasmPluginLoadOptions {
  /** URL to the wasm-bindgen JS glue file, e.g. `/wasm/gwen_physics2d.js` */
  jsUrl: string;
  /** URL to the binary `.wasm` file, e.g. `/wasm/gwen_physics2d_bg.wasm` */
  wasmUrl: string;
  /** Human-readable plugin name for error messages. */
  name: string;
}

/** Minimal shape of a wasm-bindgen generated module. */
interface WasmGlueModule {
  default?: (init?: { module_or_path?: Response }) => Promise<void>;
  initSync?: (init: { module: ArrayBuffer }) => void;
  [key: string]: unknown;
}

// Extended window interface for GWEN plugin glue caching
interface GwenWindow extends Window {
  [key: string]: unknown;
}
declare const window: GwenWindow;

// ─── Cache key helper ────────────────────────────────────────────────────────

function cacheKey(jsUrl: string): string {
  return `__gwenPlugin_${jsUrl.replace(/\W/g, '_')}`;
}

// ─── Blob-script-tag loader (same strategy as wasm-bridge.ts) ─────────────────

/**
 * Load a WASM plugin module via an injected `<script type="module">` blob.
 * This bypasses Vite's import() restrictions on `/public` assets.
 */
async function loadGlue(jsUrl: string): Promise<WasmGlueModule> {
  if (typeof document === 'undefined') {
    throw new Error('[GWEN] loadWasmPlugin() requires a browser environment (no DOM detected).');
  }

  const key = cacheKey(jsUrl);

  return new Promise<WasmGlueModule>((resolve, reject) => {
    // Return cached module if already loaded
    if (window[key]) {
      resolve(window[key] as WasmGlueModule);
      return;
    }

    const resolvedUrl = new URL(jsUrl, location.href).href;

    const blob = new Blob(
      [
        `import * as glue from '${resolvedUrl}';`,
        `window['${key}'] = glue;`,
        `window['${key}__resolve']?.();`,
      ],
      { type: 'text/javascript' },
    );
    const blobUrl = URL.createObjectURL(blob);

    window[`${key}__resolve`] = () => {
      URL.revokeObjectURL(blobUrl);
      resolve(window[key] as WasmGlueModule);
    };

    const script = document.createElement('script');
    script.type = 'module';
    script.src = blobUrl;
    script.onerror = (e) => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error(`[GWEN] Failed to load WASM plugin glue from '${jsUrl}': ${String(e)}`));
    };
    document.head.appendChild(script);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load and initialize a WASM plugin module.
 *
 * @param options  URLs and name for the plugin.
 * @returns The initialized wasm-bindgen module cast to `T`.
 *
 * @throws {Error} If the module cannot be fetched, parsed, or initialized.
 */
export async function loadWasmPlugin<T>(options: WasmPluginLoadOptions): Promise<T> {
  const { jsUrl, wasmUrl, name } = options;

  const glue = await loadGlue(jsUrl);

  // Initialize the WASM binary
  if (typeof glue.default === 'function') {
    const wasmResponse = await fetch(new URL(wasmUrl, location.href).href);
    if (!wasmResponse.ok) {
      throw new Error(
        `[GWEN:${name}] Failed to fetch .wasm binary from '${wasmUrl}': ${wasmResponse.status} ${wasmResponse.statusText}`,
      );
    }
    await glue.default({ module_or_path: wasmResponse });
  } else if (typeof glue.initSync === 'function') {
    const buf = await (await fetch(new URL(wasmUrl, location.href).href)).arrayBuffer();
    glue.initSync({ module: buf });
  } else {
    throw new Error(`[GWEN:${name}] WASM glue has no init() function — corrupted file?`);
  }

  return glue as unknown as T;
}
