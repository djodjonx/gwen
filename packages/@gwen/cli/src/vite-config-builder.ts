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

// On évite l'import type de Vite au top-level — jiti v2 ne le résout pas bien
// Le type est inféré dynamiquement à runtime
type InlineConfig = Record<string, unknown>;

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

  // Construire les alias de packages (monorepo dev ou node_modules)  // Headers COOP/COEP requis pour SharedArrayBuffer (WASM threads)
  const securityHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };

  // Détecter si le projet a un crate Rust custom (pas juste le workspace monorepo)
  // Un crate valide doit avoir [package] dans son Cargo.toml (pas seulement [workspace])
  const hasCustomCrate = parsed.rustCratePath !== null && isRustPackage(parsed.rustCratePath);

  const config: InlineConfig = {
    root: projectDir,
    configFile: false, // On passe la config inline — pas de vite.config.ts
    mode: options.mode,

    define: {
      __GWEN_VERSION__: JSON.stringify('0.1.0'),
      __GWEN_DEV__: options.mode === 'development' ? 'true' : 'false',
    },

    plugins: gwenPlugin
      ? [
          gwenPlugin({
            // cratePath seulement si un crate Rust custom est présent dans le projet
            // Sans ça, le vite-plugin cherche Cargo.toml dans les parents et
            // tombe sur le workspace monorepo (sans [package]) → erreur wasm-pack
            ...(hasCustomCrate ? { cratePath: parsed.rustCratePath! } : {}),
            watch: options.mode === 'development',
            wasmMode: options.mode === 'development' ? 'debug' : 'release',
            verbose: false,
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
      if (fs.existsSync(candidate)) {
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
    return (mod as any).gwen ?? null;
  } catch {
    /* pas installé */
  }

  return null;
}

// ── Aliases monorepo / node_modules ──────────────────────────────────────────

// ── Détection crate Rust valide ───────────────────────────────────────────────

/**
 * Retourne true si le dossier contient un Cargo.toml avec [package].
 * Un dossier avec seulement [workspace] (monorepo racine) retourne false.
 */
function isRustPackage(dir: string): boolean {
  const cargoPath = path.join(dir, 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) return false;
  const content = fs.readFileSync(cargoPath, 'utf-8');
  return content.includes('[package]');
}
