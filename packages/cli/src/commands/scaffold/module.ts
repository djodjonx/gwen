/**
 * `gwen scaffold module` command
 *
 * Generates a minimal build-time module stub using the `defineGwenModule`
 * pattern at `src/modules/<name>/index.ts`.
 *
 * @example
 * ```bash
 * gwen scaffold module my-module
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { defineCommand } from 'citty';
import { logger } from '../../utils/logger.js';

/**
 * Prompts the user for a module name via stdin.
 *
 * @returns The trimmed name entered by the user.
 */
async function promptModuleName(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write('Module name: ');
    rl.once('line', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Generates the module stub source code.
 *
 * @param name - The module name (used as the module identifier and export name).
 */
function moduleTemplate(name: string): string {
  const exportName = `${name}Module`;
  return `import { defineGwenModule } from '@gwenengine/app'

/**
 * ${name} module
 *
 * TODO: implement your build-time module here.
 */
export const ${exportName} = defineGwenModule({
  name: '${name}',

  async setup(_options) {
    // Called during engine setup — register Vite plugins, transforms, etc.
  },
})
`;
}

/** Named export consumed by scaffold/index.ts and tests. */
export const scaffoldModuleCommand = defineCommand({
  meta: {
    name: 'module',
    description: 'Scaffold a build-time module stub',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Module name',
      required: false,
    },
  },
  async run({ args }) {
    let name = (args.name as string | undefined)?.trim() ?? '';

    if (!name) {
      name = await promptModuleName();
    }

    if (!name) {
      logger.error('[GWEN:scaffold:module] Module name cannot be empty.');
      process.exit(1);
    }

    const outputDir = path.join(process.cwd(), 'src', 'modules', name);
    const outputFile = path.join(outputDir, 'index.ts');

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputFile, moduleTemplate(name), 'utf8');

    logger.success(`✓ Module stub created at src/modules/${name}/index.ts`);
  },
});
