/**
 * `gwen init` command
 *
 * Scaffolds a new GWEN game project in a new directory.
 * Prompts the user for a project name and optional starter modules.
 *
 * Created files:
 *  - package.json
 *  - gwen.config.ts
 *  - src/scenes/game.ts
 *
 * No `index.html` or `src/main.ts` are needed — the framework generates
 * a virtual entry point (`/@gwenjs/gwen-entry`) and serves its own HTML.
 *
 * @example
 * ```bash
 * gwen init
 * gwen init my-game
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { readPackageJSON } from 'pkg-types';
import { consola } from 'consola';
import { defineCommand } from 'citty';
import { logger } from '../utils/logger.js';

/** Read the CLI's own published version to stamp into scaffolded package.json. */
async function getGwenVersion(): Promise<string> {
  try {
    const pkg = await readPackageJSON(new URL('..', import.meta.url).pathname);
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/** Built-in starter modules offered during `gwen init`. */
const STARTER_MODULES = [
  { value: '@gwenjs/physics2d', label: 'Physics 2D', hint: 'Rapier-based 2D physics' },
  { value: '@gwenjs/physics3d', label: 'Physics 3D', hint: 'Rapier-based 3D physics' },
  { value: '@gwenjs/input', label: 'Input', hint: 'Keyboard, mouse, gamepad' },
  { value: '@gwenjs/audio', label: 'Audio', hint: 'Web Audio API integration' },
  { value: '@gwenjs/r3f', label: 'React Three Fiber', hint: 'R3F renderer adapter' },
  { value: '@gwenjs/debug', label: 'Debug overlay', hint: 'Performance HUD and inspector' },
];

/** Starter scene scaffold. */
function starterSceneTemplate(): string {
  return `import { defineScene } from '@gwenjs/core'\n\nexport const GameScene = defineScene('Game', () => ({\n  systems: [],\n}))\n`;
}

/** Named export consumed by bin.ts and tests. */
export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description: 'Scaffold a new GWEN game project',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Project directory name',
      required: false,
    },
  },
  async run({ args }) {
    let name = (args.name as string | undefined)?.trim() ?? '';

    if (!name) {
      name = (await consola.prompt('Project name:', {
        type: 'text',
        default: 'my-game',
      })) as string;
      name = name.trim();
    }

    if (!name) {
      logger.error('[GWEN:init] Project name cannot be empty.');
      process.exit(1);
    }

    const selectedModules: string[] = (await consola.prompt('Select modules:', {
      type: 'multiselect',
      options: STARTER_MODULES,
    })) as unknown as string[];

    const projectDir = path.join(process.cwd(), name);

    logger.info(`Creating project in ${projectDir} …`);

    // Create directory tree.
    await fs.mkdir(path.join(projectDir, 'src', 'scenes'), { recursive: true });

    // --- package.json ---
    const gwenVersion = await getGwenVersion();
    const moduleDeps = Object.fromEntries(selectedModules.map((m) => [m, `^${gwenVersion}`]));
    const packageJson = {
      name,
      type: 'module',
      scripts: {
        dev: 'gwen dev',
        build: 'gwen build',
        postinstall: 'gwen prepare',
      },
      dependencies: {
        '@gwenjs/core': `^${gwenVersion}`,
        '@gwenjs/app': `^${gwenVersion}`,
        ...moduleDeps,
      },
      devDependencies: {
        '@gwenjs/cli': `^${gwenVersion}`,
        '@gwenjs/vite': `^${gwenVersion}`,
        vite: '^8.0.0',
      },
    };
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2) + '\n',
      'utf8',
    );

    // --- gwen.config.ts ---
    const modulesArray =
      selectedModules.length === 0
        ? '[]'
        : `[\n${selectedModules.map((m) => `    '${m}'`).join(',\n')},\n  ]`;
    await fs.writeFile(
      path.join(projectDir, 'gwen.config.ts'),
      `import { defineConfig } from '@gwenjs/app'\nexport default defineConfig({ modules: ${modulesArray} })\n`,
      'utf8',
    );

    // --- src/scenes/game.ts ---
    await fs.writeFile(
      path.join(projectDir, 'src', 'scenes', 'game.ts'),
      starterSceneTemplate(),
      'utf8',
    );

    logger.success(`✓ Project "${name}" created successfully.`);
    logger.info(`  cd ${name} && pnpm install && pnpm dev`);
  },
});
