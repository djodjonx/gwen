/**
 * @gwen/cli — vite-config-builder
 *
 * Génère une InlineConfig Vite complète depuis gwen.config.ts.
 * C'est le cœur de l'offuscation Vite : l'utilisateur ne voit jamais vite.config.ts.
 *
 * Ce module est utilisé par `gwen dev` et `gwen build`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseConfigFile } from './config-parser.js';
import type { InlineConfig } from 'vite';

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
  const parsed = parseConfigFile(configPath);

  // Chercher le vite-plugin gwen dans node_modules ou le monorepo
  const gwenPlugin = await loadGwenVitePlugin(projectDir);

  // Construire les alias de packages (monorepo dev ou node_modules)
  const alias = buildAliases(projectDir);

  // Résoudre le point d'entrée (src/main.ts par défaut)
  const entryPoint = resolveEntry(projectDir);

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
      __GWEN_VERSION__: JSON.stringify('0.1.0'),
      __GWEN_DEV__: options.mode === 'development' ? 'true' : 'false',
    },

    plugins: gwenPlugin
      ? [gwenPlugin({
          wasmOutDir: 'public/wasm',
          watch: options.mode === 'development',
          wasmMode: options.mode === 'development' ? 'debug' : 'release',
          verbose: false,
        })]
      : [],

    resolve: {
      alias,
    },

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
    },

    assetsInclude: ['**/*.wasm'],
  };

  return config;
}

// ── Chargement dynamique du vite-plugin gwen ──────────────────────────────────

async function loadGwenVitePlugin(projectDir: string): Promise<Function | null> {
  const candidates = [
    // Monorepo dev — chemin direct vers le source
    path.resolve(projectDir, '..', 'packages', '@gwen', 'vite-plugin', 'src', 'index.ts'),
    // node_modules standard
    path.resolve(projectDir, 'node_modules', '@gwen', 'vite-plugin'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const mod = await import(candidate);
        return mod.gwen ?? mod.default?.gwen ?? null;
      }
    } catch { /* essayer le suivant */ }
  }

  // Fallback — importer depuis @gwen/vite-plugin (si installé)
  try {
    const mod = await import('@gwen/vite-plugin');
    return (mod as any).gwen ?? null;
  } catch { /* pas installé */ }

  return null;
}

// ── Aliases monorepo / node_modules ──────────────────────────────────────────

function buildAliases(projectDir: string): Record<string, string> {
  const alias: Record<string, string> = {};

  // Dans un monorepo de développement, pointer vers les sources TypeScript
  const packagesDir = path.resolve(projectDir, '..', 'packages', '@gwen');
  if (fs.existsSync(packagesDir)) {
    const packageMap: Record<string, string> = {
      '@gwen/engine-core':       'engine-core/src/index.ts',
      '@gwen/renderer-canvas2d': 'renderer-canvas2d/src/index.ts',
      '@gwen/plugin-input':      'plugin-input/src/index.ts',
      '@gwen/plugin-audio':      'plugin-audio/src/index.ts',
    };
    for (const [pkg, rel] of Object.entries(packageMap)) {
      const abs = path.resolve(packagesDir, rel);
      if (fs.existsSync(abs)) {
        alias[pkg] = abs;
      }
    }
  }

  return alias;
}

// ── Point d'entrée ────────────────────────────────────────────────────────────

function resolveEntry(projectDir: string): string {
  const candidates = [
    path.join(projectDir, 'src', 'main.ts'),
    path.join(projectDir, 'src', 'index.ts'),
    path.join(projectDir, 'main.ts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(projectDir, 'src', 'main.ts');
}

