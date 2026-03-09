/**
 * @gwen/cli — vite-config-builder
 *
 * Génère une InlineConfig Vite complète depuis gwen.config.ts.
 * C'est le cœur de l'offuscation Vite : l'utilisateur ne voit jamais vite.config.ts.
 *
 * Ce module est utilisé par `gwen dev` et `gwen build`.
 */

import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { InlineConfig } from 'vite';
import { VERSION } from './utils/constants.js';

export interface ViteConfigOptions {
  mode: 'development' | 'production';
  port?: number;
  open?: boolean;
  outDir?: string;
}

export async function buildViteConfig(
  projectDir: string,
  configPath: string,
  options: ViteConfigOptions,
): Promise<InlineConfig> {
  // On charge la config au cas où on en aurait besoin dans le futur (ex: alias customs)
  // Mais pour l'instant on ne s'en sert plus suite au retrait de Rust.
  // const { config } = await loadGwenConfig(projectDir);

  // Chercher le vite-plugin gwen dans node_modules ou le monorepo
  const gwenPlugin = await loadGwenVitePlugin(projectDir);

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
            verbose: true,
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
      entries: ['/@gwen/entry'],
    },

    assetsInclude: ['**/*.wasm'],
  };

  return config;
}

// ── Chargement dynamique du vite-plugin gwen ──────────────────────────────────

async function loadGwenVitePlugin(projectDir: string): Promise<Function | null> {
  const candidates = [
    // Monorepo dev — dist compilé (Node ESM ne peut pas importer du .ts natif)
    path.resolve(projectDir, '..', 'packages', '@gwen', 'vite-plugin', 'dist', 'index.js'),
    // node_modules standard — pointer vers dist/index.js explicitement
    path.resolve(projectDir, 'node_modules', '@gwen', 'vite-plugin', 'dist', 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        const mod = await import(candidate);
        return mod.gwen ?? mod.default?.gwen ?? null;
      }
    } catch {
      /* essayer le suivant */
    }
  }

  // Fallback — importer depuis @gwen/vite-plugin (si installé)
  try {
    // @ts-ignore - Prevent tsc from pulling the vite-plugin workspace into the cli compilation scope
    const mod = await import('@gwen/vite-plugin');
    const gwenPlugin = (mod as { gwen?: unknown }).gwen;
    return (gwenPlugin && typeof gwenPlugin === 'function' ? gwenPlugin : null) as Function | null;
  } catch {
    /* pas installé */
  }

  return null;
}

// ── Aliases monorepo / node_modules ──────────────────────────────────────────
