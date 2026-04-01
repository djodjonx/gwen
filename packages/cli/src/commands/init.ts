/**
 * `gwen init` command
 *
 * Scaffolds a new GWEN game project in a new directory.
 * Prompts the user for a project name and optional starter modules.
 *
 * Created files:
 *  - package.json
 *  - gwen.config.ts
 *  - src/main.ts
 *  - index.html
 *
 * @example
 * ```bash
 * gwen init
 * gwen init my-game
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { consola } from 'consola';
import { defineCommand } from 'citty';
import { logger } from '../utils/logger.js';

/** Built-in starter modules offered during `gwen init`. */
const STARTER_MODULES = [
  { value: '@gwenengine/physics2d', label: 'Physics 2D', hint: 'Rapier-based 2D physics' },
  { value: '@gwenengine/physics3d', label: 'Physics 3D', hint: 'Rapier-based 3D physics' },
  { value: '@gwenengine/input', label: 'Input', hint: 'Keyboard, mouse, gamepad' },
  { value: '@gwenengine/audio', label: 'Audio', hint: 'Web Audio API integration' },
  { value: '@gwenengine/r3f', label: 'React Three Fiber', hint: 'R3F renderer adapter' },
  { value: '@gwenengine/debug', label: 'Debug overlay', hint: 'Performance HUD and inspector' },
];

/**
 * Minimal `index.html` boilerplate that loads the TypeScript entry point.
 *
 * @param name - The project name used as the HTML `<title>`.
 */
function indexHtmlTemplate(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <canvas id="canvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
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
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });

    // --- package.json ---
    const moduleDeps = Object.fromEntries(selectedModules.map((m) => [m, '^1.0.0']));
    const packageJson = {
      name,
      type: 'module',
      scripts: {
        dev: 'gwen dev',
        build: 'gwen build',
        postinstall: 'gwen prepare',
      },
      dependencies: {
        '@gwenengine/core': '^1.0.0',
        '@gwenengine/app': '^1.0.0',
        ...moduleDeps,
      },
      devDependencies: {
        '@gwenengine/cli': '^1.0.0',
        '@gwenengine/vite': '^1.0.0',
        vite: '^5.0.0',
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
      `import { defineConfig } from '@gwenengine/app'\nexport default defineConfig({ modules: ${modulesArray} })\n`,
      'utf8',
    );

    // --- src/main.ts ---
    await fs.writeFile(
      path.join(projectDir, 'src', 'main.ts'),
      `import { createEngine } from '@gwenengine/core'\n\nconst engine = await createEngine()\nawait engine.run()\n`,
      'utf8',
    );

    // --- index.html ---
    await fs.writeFile(path.join(projectDir, 'index.html'), indexHtmlTemplate(name), 'utf8');

    logger.success(`✓ Project "${name}" created successfully.`);
    logger.info(`  cd ${name} && pnpm install && pnpm dev`);
  },
});
