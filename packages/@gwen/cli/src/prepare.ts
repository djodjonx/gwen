/**
 * @gwen/cli — prepare
 *
 * Génère le dossier .gwen/ depuis gwen.config.ts :
 *
 *   .gwen/
 *     tsconfig.generated.json   ← tsconfig complet pour le projet
 *     gwen.d.ts                 ← types globaux (GwenServices auto-importé, etc.)
 *
 * Identique au pattern Nuxt : `nuxt prepare` → `.nuxt/tsconfig.json`
 *
 * Usage :
 *   gwen prepare          → génère .gwen/
 *   gwen dev / build      → appelle prepare automatiquement avant
 */

import fs from 'node:fs';
import path from 'node:path';
import { findConfigFile } from './config-parser.js';

export interface PrepareOptions {
  projectDir?: string;
  verbose?: boolean;
}

export interface PrepareResult {
  success: boolean;
  gwenDir: string;
  files: string[];
  errors: string[];
}

// ── Prépare le dossier .gwen/ ─────────────────────────────────────────────────

export async function prepare(options: PrepareOptions = {}): Promise<PrepareResult> {
  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const verbose    = options.verbose ?? false;
  const gwenDir    = path.join(projectDir, '.gwen');
  const result: PrepareResult = { success: false, gwenDir, files: [], errors: [] };

  const log = (msg: string) => { if (verbose) console.log(msg); };

  // Vérifier que gwen.config.ts existe
  const configPath = findConfigFile(projectDir);
  if (!configPath) {
    result.errors.push(`gwen.config.ts not found in ${projectDir}`);
    return result;
  }

  log(`[gwen prepare] Config: ${configPath}`);
  log(`[gwen prepare] Output: ${gwenDir}`);

  fs.mkdirSync(gwenDir, { recursive: true });

  // ── 1. Générer tsconfig.generated.json ──────────────────────────────────────
  const tsconfigPath = path.join(gwenDir, 'tsconfig.generated.json');
  const tsconfigContent = generateTsconfig(projectDir);
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigContent, null, 2), 'utf-8');
  result.files.push(tsconfigPath);
  log(`[gwen prepare] ✅ ${path.relative(projectDir, tsconfigPath)}`);

  // ── 2. Générer gwen.d.ts ────────────────────────────────────────────────────
  const dtspath = path.join(gwenDir, 'gwen.d.ts');
  const dtsContent = generateDts(projectDir, configPath);
  fs.writeFileSync(dtspath, dtsContent, 'utf-8');
  result.files.push(dtspath);
  log(`[gwen prepare] ✅ ${path.relative(projectDir, dtspath)}`);

  // ── 3. Générer .gwen/scenes.ts si src/scenes/ existe ───────────────────────
  const scenesDir = path.join(projectDir, 'src', 'scenes');
  if (fs.existsSync(scenesDir)) {
    const scenesPath = path.join(gwenDir, 'scenes.ts');
    const scenesContent = generateScenesLoader(projectDir, scenesDir, configPath);
    fs.writeFileSync(scenesPath, scenesContent, 'utf-8');
    result.files.push(scenesPath);
    log(`[gwen prepare] ✅ ${path.relative(projectDir, scenesPath)}`);
  }

  // ── 4. S'assurer que le tsconfig.json du projet étend .gwen/ ───────────────
  ensureProjectTsconfig(projectDir, gwenDir, verbose);

  // ── 5. Ajouter .gwen/ dans .gitignore ──────────────────────────────────────
  ensureGitignore(projectDir);

  result.success = true;
  console.log(`[gwen prepare] ✅ .gwen/ generated (${result.files.length} files)`);
  return result;
}

// ── Génération du tsconfig ────────────────────────────────────────────────────

function generateTsconfig(projectDir: string): object {
  // Détecter si on est dans un monorepo (packages/@gwen/ présent)
  const isMonorepo = fs.existsSync(path.join(projectDir, '..', 'packages'));
  const isPlayground = path.basename(projectDir) === 'playground';

  // Résoudre les alias de packages
  const paths: Record<string, string[]> = {};

  // Dans un monorepo de dev, on pointe vers les sources
  if (isPlayground || isMonorepo) {
    const packagesDir = path.resolve(projectDir, '..', 'packages', '@gwen');
    const packageMap: Record<string, string> = {
      '@gwen/engine-core':      'engine-core/src/index.ts',
      '@gwen/renderer-canvas2d':'renderer-canvas2d/src/index.ts',
      '@gwen/plugin-input':     'plugin-input/src/index.ts',
      '@gwen/plugin-audio':     'plugin-audio/src/index.ts',
      '@gwen/vite-plugin':      'vite-plugin/src/index.ts',
    };

    for (const [pkg, rel] of Object.entries(packageMap)) {
      const abs = path.join(packagesDir, rel);
      if (fs.existsSync(abs)) {
        paths[pkg] = [path.relative(projectDir, abs)];
      }
    }
  }

  return {
    // Ce fichier est généré automatiquement par `gwen prepare`.
    // NE PAS MODIFIER — vos modifications seront écrasées.
    // Modifiez gwen.config.ts à la place.
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      // PAS de "types" avec chemin relatif — gwen.d.ts est inclus via "include"
      // Alias de packages
      ...(Object.keys(paths).length > 0 ? { baseUrl: '..', paths } : {}),
    },
    include: [
      '../src',
      '../*.ts',
      './*.d.ts',
    ],
    exclude: [
      '../node_modules',
      '../dist',
    ],
  };
}

// ── Génération du gwen.d.ts ──────────────────────────────────────────────────

function generateDts(projectDir: string, configPath: string): string {
  const relConfig = path.relative(path.join(projectDir, '.gwen'), configPath)
    .replace(/\\/g, '/').replace(/\.ts$/, '');

  const source = fs.readFileSync(configPath, 'utf-8');
  const exportStyle = detectConfigExportStyle(source);

  // Import de la config selon le style d'export
  const configImport = exportStyle.type === 'default'
    ? `import type _cfg from '${relConfig}';`
    : `import type { ${exportStyle.name} as _cfg } from '${relConfig}';`;

  const displayName = exportStyle.type === 'default' ? 'default export' : exportStyle.name;

  return `/**
 * GWEN — Types globaux auto-générés
 * Généré par \`gwen prepare\` — NE PAS MODIFIER
 * Source : gwen.config.ts
 *
 * GwenServices est inféré automatiquement depuis le ${displayName}.
 * Vous n'avez pas besoin de l'exporter depuis gwen.config.ts.
 */

import type { GwenConfigServices } from '@gwen/engine-core';
${configImport}

type _GwenServices = GwenConfigServices<typeof _cfg>;

declare global {
  /**
   * Type global des services GWEN — inféré depuis gwen.config.ts.
   * Disponible partout dans le projet sans import.
   *
   * @example
   * onInit(api: EngineAPI<GwenServices>) {
   *   const kb = api.services.get('keyboard'); // ✅ KeyboardInput
   * }
   */
  type GwenServices = _GwenServices;

  const __GWEN_VERSION__: string;
  const __GWEN_DEV__: boolean;
}

export {};
`;
}

/**
 * Détecte le style d'export de defineConfig() dans gwen.config.ts.
 *
 *   export default defineConfig(...)          → { type: 'default' }
 *   export const gwenConfig = defineConfig(…) → { type: 'named', name: 'gwenConfig' }
 */
function detectConfigExportStyle(source: string): { type: 'default' } | { type: 'named'; name: string } {
  if (/export\s+default\s+defineConfig\s*\(/.test(source)) return { type: 'default' };
  const match = source.match(/export\s+const\s+(\w+)\s*=\s*defineConfig\s*\(/);
  if (match) return { type: 'named', name: match[1] };
  return { type: 'default' }; // fallback
}

// ── S'assurer que tsconfig.json étend .gwen/tsconfig.generated.json ──────────

function ensureProjectTsconfig(projectDir: string, gwenDir: string, verbose: boolean): void {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');
  const relExtends   = './.gwen/tsconfig.generated.json';
  const log = (msg: string) => { if (verbose) console.log(msg); };

  if (!fs.existsSync(tsconfigPath)) {
    // Créer un tsconfig.json minimal qui étend le généré
    const minimal = {
      extends: relExtends,
      compilerOptions: {},
      include: ['src', '*.ts'],
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(minimal, null, 2), 'utf-8');
    log(`[gwen prepare] ✅ tsconfig.json created (extends .gwen/)`);
    return;
  }

  // Lire le tsconfig existant et s'assurer qu'il étend .gwen/
  const raw = fs.readFileSync(tsconfigPath, 'utf-8');
  let tsconfig: any;
  try {
    tsconfig = JSON.parse(raw);
  } catch {
    log(`[gwen prepare] ⚠ tsconfig.json is not valid JSON — skipping extends patch`);
    return;
  }

  if (tsconfig.extends !== relExtends) {
    tsconfig.extends = relExtends;
    // Supprimer les champs redondants maintenant couverts par le generated
    // On garde compilerOptions mais on nettoie les paths/baseUrl qui sont dans le generated
    if (tsconfig.compilerOptions) {
      delete tsconfig.compilerOptions.paths;
      delete tsconfig.compilerOptions.baseUrl;
      delete tsconfig.compilerOptions.target;
      delete tsconfig.compilerOptions.module;
      delete tsconfig.compilerOptions.moduleResolution;
      // Si compilerOptions est vide, on le retire
      if (Object.keys(tsconfig.compilerOptions).length === 0) {
        delete tsconfig.compilerOptions;
      }
    }
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');
    log(`[gwen prepare] ✅ tsconfig.json patched to extend .gwen/tsconfig.generated.json`);
  }
}

// ── Génération de .gwen/scenes.ts ─────────────────────────────────────────────

/**
 * Scanne src/scenes/*.ts (1 niveau, pas récursif) et génère .gwen/scenes.ts.
 *
 * Le fichier généré exporte :
 *   - `registerScenes(scenes: SceneManager): void` — enregistre toutes les scènes
 *   - `mainScene: string | undefined`               — scène principale (depuis config)
 *
 * Convention d'export attendue dans chaque fichier scène :
 *   export default class MainMenuScene implements Scene { ... }
 *   // ou
 *   export class MainMenuScene implements Scene { ... }  ← premier export nommé
 *
 * Les scènes reçoivent `scenes` en premier argument constructeur si leur
 * constructeur en a besoin (détecté par convention).
 */
function generateScenesLoader(
  projectDir: string,
  scenesDir: string,
  configPath: string,
): string {
  const files = fs.readdirSync(scenesDir)
    .filter(f => f.endsWith('.ts') && !f.startsWith('_') && !f.startsWith('.'))
    .sort();

  // Lire la config pour extraire mainScene
  let mainSceneFromConfig: string | undefined;
  try {
    const configSource = fs.readFileSync(configPath, 'utf-8');
    const match = configSource.match(/mainScene\s*:\s*['"]([^'"]+)['"]/);
    if (match) mainSceneFromConfig = match[1];
  } catch { /* ignore */ }

  // Construire les infos d'import pour chaque fichier scène
  const sceneInfos = files.map(file => {
    const base = file.replace(/\.ts$/, '');
    const source = fs.readFileSync(path.join(scenesDir, file), 'utf-8');

    // Détecter l'export : default class ou named class
    const defaultMatch = source.match(/export\s+default\s+class\s+(\w+)/);
    const namedMatch   = source.match(/export\s+(?:class|const)\s+(\w+)/);
    const className    = defaultMatch?.[1] ?? namedMatch?.[1] ?? base;

    // Lire la propriété `name` de la scène si déclarée inline
    // ex: readonly name = 'MainMenu'; ou name = "Game";
    const sceneName = source.match(/readonly\s+name\s*=\s*['"]([^'"]+)['"]/)?.[1]
      ?? source.match(/\bname\s*=\s*['"]([^'"]+)['"]/)?.[1]
      ?? className.replace(/Scene$/, '');

    // Chemin relatif depuis .gwen/ vers src/scenes/
    const relPath = `../src/scenes/${base}`;

    return {
      file,
      base,
      className,
      sceneName,
      isDefault: !!defaultMatch,
      relPath,
    };
  });

  if (sceneInfos.length === 0) {
    return [
      '/**',
      ' * GWEN - Scenes (auto-generated)',
      ' * Generated by `gwen prepare` - DO NOT EDIT',
      ' *',
      ' * No scenes found in src/scenes/.',
      ' * Create .ts files in src/scenes/ to auto-discover them.',
      ' */',
      "import type { SceneManager } from '@gwen/engine-core';",
      '',
      'export function registerScenes(_scenes: SceneManager): void {}',
      `export const mainScene: string | undefined = undefined;`,
      '',
    ].join('\n');
  }

  // Generer les imports
  const imports = sceneInfos
    .map(s =>
      s.isDefault
        ? `import ${s.className} from '${s.relPath}';`
        : `import { ${s.className} } from '${s.relPath}';`
    )
    .join('\n');

  // Generer les enregistrements
  const registrations = sceneInfos
    .map(s => `  scenes.register(new ${s.className}(scenes));`)
    .join('\n');

  // Resoudre la scene principale
  const candidates = ['Main', 'MainMenu', 'Boot'];
  const resolvedMain =
    mainSceneFromConfig ??
    candidates.find(c => sceneInfos.some(s => s.sceneName === c)) ??
    sceneInfos[0]?.sceneName ??
    undefined;

  const mainSceneValue = resolvedMain !== undefined
    ? `'${resolvedMain}'`
    : 'undefined';

  const sceneList = sceneInfos
    .map(s => ` *   - ${s.file} -> ${s.className} (name: '${s.sceneName}')`)
    .join('\n');

  return [
    '/**',
    ' * GWEN - Scenes (auto-generated)',
    ' * Generated by `gwen prepare` - DO NOT EDIT',
    ' *',
    ' * Scenes detected in src/scenes/:',
    sceneList,
    ' *',
    ' * To add a scene: create a .ts file in src/scenes/.',
    " * To set the main scene: set `mainScene` in gwen.config.ts.",
    ' */',
    '',
    "import type { SceneManager } from '@gwen/engine-core';",
    imports,
    '',
    '/**',
    ' * Registers all scenes discovered in src/scenes/.',
    ' * Called automatically by createEngine() when passed as argument.',
    ' */',
    'export function registerScenes(scenes: SceneManager): void {',
    registrations,
    '}',
    '',
    '/**',
    ' * Name of the scene to load on startup.',
    ' * Resolved from: config.mainScene -> convention (Main/MainMenu/Boot) -> first scene.',
    ' */',
    `export const mainScene: string | undefined = ${mainSceneValue};`,
    '',
  ].join('\n');
}

// ── .gitignore ────────────────────────────────────────────────────────────────

function ensureGitignore(projectDir: string): void {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const entry = '.gwen/';

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\nnode_modules/\ndist/\n`, 'utf-8');
    return;
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  if (!content.includes(entry)) {
    fs.appendFileSync(gitignorePath, `\n# GWEN generated\n${entry}\n`);
  }
}

