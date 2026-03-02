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
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import type { Plugin, ViteDevServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ── Virtual module IDs ────────────────────────────────────────────────────────

const VIRTUAL_MANIFEST_ID = 'virtual:gwen-manifest';
const RESOLVED_VIRTUAL_MANIFEST = '\0' + VIRTUAL_MANIFEST_ID;

// /@gwen/ prefix — résolu comme un vrai chemin HTTP par le navigateur,
// intercepté par resolveId avant que Vite ne le cherche sur disque.
// Pattern identique à /@vite/ et /@fs/ utilisés par Vite lui-même.
const GWEN_ENTRY_ID = '/@gwen/entry';
const GWEN_SCENES_ID = '/@gwen/scenes';
const RESOLVED_ENTRY = '\0/@gwen/entry';
const RESOLVED_SCENES = '\0/@gwen/scenes';

// ── Scan src/scenes/ ──────────────────────────────────────────────────────────

interface SceneInfo {
  file: string;
  className: string;
  sceneName: string;
  isDefault: boolean;
  isFactory: boolean; // defineScene forme 2 — factory callable
  isConst: boolean; // defineScene forme 1 — objet direct (export const)
  relPath: string;
}

function scanScenes(projectRoot: string): SceneInfo[] {
  const scenesDir = path.join(projectRoot, 'src', 'scenes');
  if (!fs.existsSync(scenesDir)) return [];

  return fs.readdirSync(scenesDir)
    .filter(f => f.endsWith('.ts') && !f.startsWith('_') && !f.startsWith('.'))
    .sort()
    .map(file => {
      const base = file.replace(/\.ts$/, '');
      const source = fs.readFileSync(path.join(scenesDir, file), 'utf-8');

      const defaultMatch = source.match(/export\s+default\s+class\s+(\w+)/);
      const classMatch = source.match(/export\s+class\s+(\w+)/);
      const constMatch = source.match(/export\s+const\s+(\w+)/);
      const namedMatch = classMatch ?? constMatch;
      const className = defaultMatch?.[1] ?? namedMatch?.[1] ?? base;

      // defineScene forme 2 = export const + defineScene('string', factory)
      const isFactory =
        !!constMatch &&
        /defineScene\s*\(\s*['"`][^'"`,]+['"`]\s*,/.test(source) &&
        !classMatch;

      // defineScene forme 1 = export const + defineScene({ ... })
      const isConst =
        !!constMatch &&
        /defineScene\s*\(\s*\{/.test(source) &&
        !classMatch;

      const sceneName =
        source.match(/defineScene\s*\(\s*['"]([^'"]+)['"]/)?.[1] ??
        source.match(/readonly\s+name\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
        source.match(/\bname\s*=\s*['"]([^'"]+)['"]/)?.[1] ??
        className.replace(/Scene$/, '');

      return {
        file,
        className,
        sceneName,
        isDefault: !!defaultMatch,
        isFactory,
        isConst,
        relPath: `/src/scenes/${base}.ts`,
      };
    });
}

function resolveMainScene(scenes: SceneInfo[], fromConfig?: string): string | undefined {
  if (fromConfig) return fromConfig;
  const candidates = ['Main', 'MainMenu', 'Boot'];
  return (
    candidates.find(c => scenes.some(s => s.sceneName === c)) ??
    scenes[0]?.sceneName
  );
}

// ── Génération des virtual modules ────────────────────────────────────────────

function generateScenesModule(scenes: SceneInfo[], mainScene: string | undefined): string {
  if (scenes.length === 0) {
    return [
      'export function registerScenes(_scenes) {}',
      'export const mainScene = undefined;',
    ].join('\n');
  }

  const imports = scenes.map(s =>
    s.isDefault
      ? `import ${s.className} from ${JSON.stringify(s.relPath)};`
      : `import { ${s.className} } from ${JSON.stringify(s.relPath)};`
  ).join('\n');

  const registrations = scenes
    .map(s => {
      if (s.isFactory) {
        // defineScene forme 2 — factory callable avec dépendances
        return `  scenes.register(${s.className}(scenes));`;
      }
      if (s.isConst) {
        // defineScene forme 1 — objet direct, s'enregistre tel quel
        return `  scenes.register(${s.className});`;
      }
      // class (rétrocompat)
      return `  scenes.register(new ${s.className}(scenes));`;
    })
    .join('\n');

  const mainSceneValue = mainScene ? JSON.stringify(mainScene) : 'undefined';

  return [
    imports,
    '',
    'export function registerScenes(scenes) {',
    registrations,
    '}',
    '',
    `export const mainScene = ${mainSceneValue};`,
  ].join('\n');
}

function generateEntryModule(hasScenesDir: boolean): string {
  const lines = [
    'import { initWasm, createEngine } from "@gwen/engine-core";',
    'import gwenConfig from "/gwen.config.ts";',
  ];

  if (hasScenesDir) {
    lines.push('import { registerScenes, mainScene } from "/@gwen/scenes";');
  }

  lines.push(
    '',
    'async function bootstrap() {',
    '  await initWasm();',
    hasScenesDir
      ? '  const { engine } = createEngine(gwenConfig, registerScenes, mainScene);'
      : '  const { engine } = createEngine(gwenConfig);',
    '  engine.start();',
    '}',
    '',
    'bootstrap().catch(err => {',
    '  console.error("[GWEN] Fatal:", err);',
    '  document.body.innerHTML = `<pre style="color:red;padding:2rem">[GWEN] Fatal:\\n${err}</pre>`;',
    '});',
  );

  return lines.join('\n');
}

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
    // Walk up to find a Cargo.toml with a [package] section.
    // Stop as soon as we find ANY Cargo.toml — if it's workspace-only, we don't compile.
    let dir = root;
    for (let i = 0; i < 4; i++) {
      const cargo = path.join(dir, 'Cargo.toml');
      if (fs.existsSync(cargo)) {
        const content = fs.readFileSync(cargo, 'utf-8');
        if (content.includes('[package]')) return dir;
        // Found a workspace-only Cargo.toml → stop, no custom crate here
        return null;
      }
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

      (watchProcess as any).on('close', (code: number | null) => {
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

    // ── Résolution des virtual modules ───────────────────────────────────
    resolveId(id) {
      if (id === VIRTUAL_MANIFEST_ID) return RESOLVED_VIRTUAL_MANIFEST;
      if (id === GWEN_ENTRY_ID) return RESOLVED_ENTRY;
      if (id === GWEN_SCENES_ID) return RESOLVED_SCENES;
      return null;
    },

    load(id) {
      if (id === RESOLVED_VIRTUAL_MANIFEST) {
        const manifest = loadManifest();
        return `export default ${manifest};`;
      }

      if (id === RESOLVED_ENTRY) {
        const hasScenesDir = fs.existsSync(path.join(projectRoot, 'src', 'scenes'));
        return generateEntryModule(hasScenesDir);
      }

      if (id === RESOLVED_SCENES) {
        const scenes = scanScenes(projectRoot);
        const configPath = path.join(projectRoot, 'gwen.config.ts');
        let mainSceneFromConfig: string | undefined;
        if (fs.existsSync(configPath)) {
          const src = fs.readFileSync(configPath, 'utf-8');
          mainSceneFromConfig = src.match(/mainScene\s*:\s*['"]([^'"]+)['"]/)?.[1];
        }
        return generateScenesModule(scenes, resolveMainScene(scenes, mainSceneFromConfig));
      }

      return null;
    },

    // ── Injection du script entry dans le HTML servi ─────────────────────
    transformIndexHtml(html) {
      // Si le script est déjà présent, ne pas le dupliquer
      if (html.includes('/@gwen/entry')) return html;
      return html.replace(
        '</body>',
        '  <script type="module" src="/@gwen/entry"></script>\n</body>',
      );
    },

    // ── HMR : invalider les modules quand src/scenes/ change ─────────────
    configureServer(devServer) {
      server = devServer;
      projectRoot = devServer.config.root;
      cratePath = resolveCratePath(projectRoot);

      // Watcher sur src/scenes/ pour invalider les modules
      const scenesDir = path.join(projectRoot, 'src', 'scenes');
      if (fs.existsSync(scenesDir)) {
        fs.watch(scenesDir, () => {
          const mod = devServer.moduleGraph.getModuleById(RESOLVED_SCENES);
          if (mod) devServer.moduleGraph.invalidateModule(mod);
          const entryMod = devServer.moduleGraph.getModuleById(RESOLVED_ENTRY);
          if (entryMod) devServer.moduleGraph.invalidateModule(entryMod);
          devServer.ws.send({ type: 'full-reload' });
        });
      }

      if (options.watch !== false) {
        buildWasm(projectRoot);
        startWatcher(projectRoot);
      }

      // Middleware WASM + HTML généré si index.html absent
      devServer.middlewares.use((req, res, next) => {
        // Servir les fichiers WASM
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

        // Servir le .gwen/index.html (le fichier préparé par la CLI)
        if ((req.url === '/' || req.url === '/index.html') &&
          !fs.existsSync(path.join(projectRoot, 'index.html'))) {

          const gwenHtmlPath = path.join(projectRoot, '.gwen', 'index.html');

          // Fallback ultra mininal au cas où `gwen prepare` n'aurait pas encore fini
          let raw = `<!DOCTYPE html><html><body><script type="module" src="/@gwen/entry"></script></body></html>`;
          if (fs.existsSync(gwenHtmlPath)) {
            raw = fs.readFileSync(gwenHtmlPath, 'utf-8');
          }

          // Passer par le pipeline Vite : inject HMR client + transformIndexHtml hooks
          devServer.transformIndexHtml(req.url!, raw, req.originalUrl).then(html => {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(html);
          }).catch(next);
          return;
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

