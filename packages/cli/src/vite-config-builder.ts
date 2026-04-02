/**
 * @gwenjs/cli — vite-config-builder
 *
 * Generates a complete Vite InlineConfig from gwen.config.ts.
 * This is the core of Vite abstraction: the user never sees vite.config.ts.
 *
 * Used by `gwen dev` and `gwen build`.
 */

import * as path from 'node:path';
import type { InlineConfig, PluginOption } from 'vite';
import { VERSION } from './utils/constants.js';

export interface ViteConfigOptions {
  mode: 'development' | 'production';
  port?: number;
  open?: boolean;
  outDir?: string;
  debug?: boolean;
}

export async function buildViteConfig(
  projectDir: string,
  _configPath: string,
  options: ViteConfigOptions,
): Promise<InlineConfig> {
  // Look for the gwen vite-plugin in node_modules or the monorepo
  const gwenPlugin = await loadGwenVitePlugin(projectDir);

  if (!gwenPlugin) {
    console.warn(
      '[gwen-cli] WARNING: Could not find @gwenjs/vite. Virtual modules and WASM serving may not work.',
    );
  }

  // COOP/COEP headers required for SharedArrayBuffer (WASM threads)
  const securityHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };

  const config: InlineConfig = {
    root: projectDir,
    configFile: false, // Passing the config inline — no vite.config.ts
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
      entries: ['/@gwenjs/gwen-entry'],
    },

    assetsInclude: ['**/*.wasm'],
  };

  return config;
}

// ── Dynamic loading of the gwen vite-plugin ───────────────────────────────────

interface GwenVitePluginOptions {
  watch: boolean;
  wasmMode: 'debug' | 'release';
  verbose: boolean;
}

type GwenVitePluginFactory = (options: GwenVitePluginOptions) => PluginOption;

interface GwenViteModule {
  gwen?: GwenVitePluginFactory;
  default?: GwenVitePluginFactory | { gwen?: GwenVitePluginFactory };
}

async function loadGwenVitePlugin(_projectDir: string): Promise<GwenVitePluginFactory | null> {
  // Try to load from @gwenjs/vite using standard resolution
  try {
    // In Node.js ESM, dynamic import() uses standard resolution logic.
    // It will look into node_modules of the project, or follow pnpm workspace links.
    const mod = (await import('@gwenjs/vite')) as GwenViteModule;

    let gwenPlugin: GwenVitePluginFactory | null = null;

    if (typeof mod.gwen === 'function') {
      gwenPlugin = mod.gwen;
    } else if (typeof mod.default === 'function') {
      gwenPlugin = mod.default;
    } else if (
      mod.default &&
      typeof mod.default === 'object' &&
      'gwen' in mod.default &&
      typeof mod.default.gwen === 'function'
    ) {
      gwenPlugin = mod.default.gwen;
    }

    if (gwenPlugin && typeof gwenPlugin === 'function') {
      return gwenPlugin;
    }
  } catch {
    // If not found, it might be that the package is not installed or linked yet.
  }

  return null;
}

// ── Monorepo / node_modules aliases ──────────────────────────────────────────
