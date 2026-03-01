/**
 * @gwen/vite-plugin — Plugin Vite pour les projets GWEN
 *
 * Fonctionnalités :
 *  1. **WASM hot-reload** : surveille les fichiers `.rs` du crate Rust,
 *     relance `wasm-pack build` en arrière-plan et déclenche un HMR
 *     complet quand le `.wasm` change.
 *  2. **Copie des artefacts WASM** : copie `dist/wasm/*.wasm` et `*.js`
 *     vers le dossier public de Vite en mode dev.
 *  3. **Injection du manifeste** : injecte `gwen-manifest.json` comme
 *     variable virtuelle `__GWEN_MANIFEST__` accessible dans le code.
 *
 * Usage dans vite.config.ts :
 * ```typescript
 * import { gwen } from '@gwen/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     gwen({
 *       cratePath: '../crates/gwen-core',
 *       wasmOutDir: 'public/wasm',
 *       watch: true,
 *     })
 *   ]
 * });
 * ```
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import type { Plugin, ViteDevServer } from 'vite';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GwenPluginOptions {
  /**
   * Chemin vers le crate Rust à compiler (dossier contenant Cargo.toml).
   * Si omis, le plugin cherche Cargo.toml dans les dossiers parents.
   */
  cratePath?: string;
  /**
   * Dossier de sortie WASM relatif à la racine du projet Vite.
   * Défaut : 'public/wasm'
   */
  wasmOutDir?: string;
  /**
   * Active le watch des fichiers .rs pour le hot-reload WASM.
   * Défaut : true en mode dev, false en mode build.
   */
  watch?: boolean;
  /**
   * Mode de compilation wasm-pack ('release' | 'debug').
   * Défaut : 'debug' en mode dev pour des rebuilds plus rapides.
   */
  wasmMode?: 'release' | 'debug';
  /**
   * Chemin vers le manifeste gwen-manifest.json.
   * Si fourni, son contenu est injecté comme `__GWEN_MANIFEST__`.
   */
  manifestPath?: string;
  /** Active les logs détaillés. */
  verbose?: boolean;
}

// ── Virtual module ID pour le manifeste ──────────────────────────────────────

const VIRTUAL_MANIFEST_ID = 'virtual:gwen-manifest';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_MANIFEST_ID;

// ── Plugin principal ──────────────────────────────────────────────────────────

export function gwen(options: GwenPluginOptions = {}): Plugin {
  const {
    wasmOutDir = 'public/wasm',
    wasmMode = 'debug',
    verbose = false,
    manifestPath,
  } = options;

  let projectRoot = process.cwd();
  let cratePath: string | null = options.cratePath ?? null;
  let watchProcess: ChildProcess | null = null;
  let server: ViteDevServer | null = null;
  let lastWasmMtime = 0;

  function log(msg: string) {
    if (verbose) console.log(`[gwen-vite] ${msg}`);
  }

  function resolveCratePath(root: string): string | null {
    if (cratePath) return path.resolve(root, cratePath);
    // Walk up to find Cargo.toml
    let dir = root;
    for (let i = 0; i < 4; i++) {
      if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return dir;
      dir = path.dirname(dir);
    }
    return null;
  }

  function findWasmPack(): string | null {
    const candidates = [
      'wasm-pack',
      `${process.env.HOME}/.cargo/bin/wasm-pack`,
    ];
    for (const c of candidates) {
      try {
        spawnSync(c, ['--version'], { stdio: 'ignore' });
        return c;
      } catch { /* not found */ }
    }
    return null;
  }

  function copyPrecompiledWasm(root: string): boolean {
    const outDir = path.resolve(root, wasmOutDir);

    // Chercher les artefacts pré-compilés dans @gwen/engine-core/wasm/
    const candidates = [
      path.resolve(root, 'node_modules/@gwen/engine-core/wasm'),
      path.resolve(root, '../packages/@gwen/engine-core/wasm'),
      path.resolve(__dirname, '../../engine-core/wasm'),
      path.resolve(__dirname, '../../../@gwen/engine-core/wasm'),
    ];

    let sourceDir: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) { sourceDir = c; break; }
    }

    if (!sourceDir) {
      log('No pre-compiled WASM found in @gwen/engine-core/wasm/');
      return false;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const files = fs.readdirSync(sourceDir).filter(f =>
      f.endsWith('.wasm') || f.endsWith('.js') || f.endsWith('.d.ts')
    );
    if (files.length === 0) return false;

    for (const file of files) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(outDir, file));
    }
    log(`Copied ${files.length} pre-compiled WASM artifacts from ${sourceDir} → ${outDir}`);
    return true;
  }

  function buildWasm(root: string): boolean {
    const crate = resolveCratePath(root);

    // Pas de crate Rust custom → copier les artefacts pré-compilés
    if (!crate) {
      log('No Cargo.toml found — copying pre-compiled WASM from @gwen/engine-core');
      return copyPrecompiledWasm(root);
    }

    const wasmPack = findWasmPack();
    if (!wasmPack) {
      console.warn('[gwen-vite] wasm-pack not found — copying pre-compiled WASM from @gwen/engine-core');
      return copyPrecompiledWasm(root);
    }

    const outDir = path.resolve(root, wasmOutDir);
    fs.mkdirSync(outDir, { recursive: true });

    log(`Building WASM: ${crate} → ${outDir}`);
    const result = spawnSync(wasmPack, [
      'build', '--target', 'web',
      '--out-dir', outDir,
      wasmMode === 'release' ? '--release' : '--dev',
      crate,
    ], { stdio: verbose ? 'inherit' : 'pipe', encoding: 'utf-8' });

    if (result.status !== 0) {
      console.error('[gwen-vite] wasm-pack build failed:', result.stderr);
      return false;
    }

    log('WASM build succeeded');
    return true;
  }

  function startWatcher(root: string): void {
    const crate = resolveCratePath(root);
    if (!crate) return;

    const wasmPack = findWasmPack();
    if (!wasmPack) return;

    const srcDir = path.join(crate, 'src');
    if (!fs.existsSync(srcDir)) return;

    log(`Watching Rust sources in ${srcDir}`);

    // Use fs.watch to monitor .rs file changes
    fs.watch(srcDir, { recursive: true }, (event, filename) => {
      if (!filename?.endsWith('.rs')) return;
      log(`Rust file changed: ${filename} — rebuilding WASM...`);

      // Debounce: ignore if already building
      if (watchProcess?.exitCode === null) return;

      const outDir = path.resolve(root, wasmOutDir);
      watchProcess = spawn(wasmPack, [
        'build', '--target', 'web',
        '--out-dir', outDir,
        '--dev', crate,
      ], { stdio: 'pipe' });

      watchProcess.on('close', (code) => {
        if (code === 0) {
          log('WASM rebuilt — triggering HMR full reload');
          server?.ws.send({ type: 'full-reload' });
        } else {
          console.error('[gwen-vite] WASM rebuild failed (exit ' + code + ')');
        }
      });
    });
  }

  function loadManifest(): string {
    if (manifestPath && fs.existsSync(manifestPath)) {
      return fs.readFileSync(manifestPath, 'utf-8');
    }
    // Try common locations
    for (const loc of ['dist/gwen-manifest.json', 'gwen-manifest.json']) {
      const p = path.resolve(projectRoot, loc);
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    }
    return JSON.stringify({ version: '0.1.0', plugins: [], engine: {} });
  }

  return {
    name: 'gwen',
    enforce: 'pre',

    // ── Résolution du module virtuel ─────────────────────────────────────
    resolveId(id) {
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        const manifest = loadManifest();
        return `export default ${manifest};`;
      }
      return null;
    },

    // ── Build initial ─────────────────────────────────────────────────────
    buildStart() {
      projectRoot = (this as any).meta?.watchMode ? projectRoot : process.cwd();
    },

    // ── Mode dev : watch Rust sources + HMR ──────────────────────────────
    configureServer(devServer) {
      server = devServer;
      projectRoot = devServer.config.root;
      cratePath = resolveCratePath(projectRoot);

      // Initial build
      if (options.watch !== false) {
        buildWasm(projectRoot);
        startWatcher(projectRoot);
      }

      // Serve WASM files from public/wasm/
      devServer.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/wasm/')) {
          const filePath = path.join(projectRoot, 'public', req.url);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            if (ext === '.wasm') res.setHeader('Content-Type', 'application/wasm');
            if (ext === '.js') res.setHeader('Content-Type', 'application/javascript');
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },

    // ── Build production : injecter le manifeste ──────────────────────────
    generateBundle() {
      const manifest = loadManifest();
      this.emitFile({
        type: 'asset',
        fileName: 'gwen-manifest.json',
        source: manifest,
      });
    },
  };
}

// Export par défaut pour la compat CommonJS
export default gwen;

