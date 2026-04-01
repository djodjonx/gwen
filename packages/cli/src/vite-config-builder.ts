/**
 * @gwenengine/cli — vite-config-builder
 *
 * Génère une InlineConfig Vite complète depuis gwen.config.ts.
 * C'est le cœur de l'offuscation Vite : l'utilisateur ne voit jamais vite.config.ts.
 *
 * Ce module est utilisé par `gwen dev` et `gwen build`.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InlineConfig } from 'vite';
import { VERSION } from './utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ViteConfigOptions {
  mode: 'development' | 'production';
  port?: number;
  open?: boolean;
  outDir?: string;
  debug?: boolean;
}

export async function buildViteConfig(
  projectDir: string,
  configPath: string,
  options: ViteConfigOptions,
): Promise<InlineConfig> {
  // Chercher le vite-plugin gwen dans node_modules ou le monorepo
  const gwenPlugin = await loadGwenVitePlugin(projectDir);

  if (!gwenPlugin) {
    console.warn(
      '[gwen-cli] WARNING: Could not find @gwenengine/vite. Virtual modules and WASM serving may not work.',
    );
  }

  // Headers COOP/COEP requis pour SharedArrayBuffer (WASM threads)
  const securityHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };

  const config: InlineConfig = {
    root: projectDir,
    configFile: false, // On passe la config inline — pas de vite.config.ts
    mode: options.mode,

    define: {
      __GWEN_VERSION__: JSON.stringify(VERSION),
      __GWEN_DEV__: String(options.mode === 'development'),
    },

    plugins: gwenPlugin
      ? [
          gwenPlugin({
            watch: options.mode === 'development',
            wasmMode: options.mode === 'development' ? 'debug' : 'release',
            // gwen-vite internal logs are shown only in CLI debug mode.
            verbose: options.debug === true,
          }),
        ]
      : [],

    resolve: {},

    server: {
      port: options.port ?? 3000,
      open: options.open ?? false,
      headers: securityHeaders,
    },

    preview: {
      port: options.port ?? 4173,
      headers: securityHeaders,
    },

    build: {
      target: 'esnext',
      outDir: options.outDir ?? path.join(projectDir, 'dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.join(projectDir, '.gwen', 'index.html'),
        },
      },
    },

    optimizeDeps: {
      entries: ['/@gwenengine/gwen-entry'],
    },

    assetsInclude: ['**/*.wasm'],
  };

  return config;
}

// ── Chargement dynamique du vite-plugin gwen ──────────────────────────────────

async function loadGwenVitePlugin(_projectDir: string): Promise<Function | null> {
  // Try to load from @gwenengine/vite using standard resolution
  try {
    // In Node.js ESM, dynamic import() uses standard resolution logic.
    // It will look into node_modules of the project, or follow pnpm workspace links.
    const mod = (await import('@gwenengine/vite')) as any;

    // Support ESM: export function gwen, export default gwen
    // Support CJS: module.exports = { gwen: ... }
    const gwenPlugin =
      mod.gwen ?? mod.default?.gwen ?? (typeof mod.default === 'function' ? mod.default : null);

    if (gwenPlugin && typeof gwenPlugin === 'function') {
      return gwenPlugin as Function;
    }
  } catch {
    // If not found, it might be that the package is not installed or linked yet.
  }

  return null;
}

// ── Aliases monorepo / node_modules ──────────────────────────────────────────
