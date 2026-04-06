/**
 * `gwen scaffold package` command
 *
 * Generates a complete community plugin package following the canonical
 * structure defined in specs/plugin-package-architecture.md.
 *
 * @example
 * ```bash
 * gwen scaffold package my-plugin
 * ```
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { defineCommand } from 'citty';
import { logger } from '../../utils/logger.js';

// ─── Name helpers ─────────────────────────────────────────────────────────────

/** "my-plugin" → "MyPlugin" */
export function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** "my-plugin" → "myPlugin" */
export function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function packageJsonTemplate(name: string, gwenVersion: string): string {
  return JSON.stringify(
    {
      name: `@community/gwen-${name}`,
      version: '0.1.0',
      description: `${toPascalCase(name)} plugin for GWEN`,
      type: 'module',
      files: ['dist'],
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
        },
        './module': {
          types: './dist/module.d.ts',
          import: './dist/module.js',
        },
      },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      scripts: {
        dev: 'vite build --watch',
        build: 'vite build',
        test: 'vitest run',
        typecheck: 'tsc --noEmit',
        lint: 'oxlint src/',
        format: 'oxfmt src/',
      },
      dependencies: {
        '@gwenjs/core': gwenVersion,
        '@gwenjs/kit': gwenVersion,
      },
      devDependencies: {
        typescript: '^6.0.0',
        vite: '^8.0.0',
        'vite-plugin-dts': '^4.0.0',
        vitest: '^4.0.0',
      },
    },
    null,
    2,
  );
}

export function tsconfigTemplate(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        outDir: './dist',
        rootDir: './src',
        skipLibCheck: true,
      },
      include: ['src'],
    },
    null,
    2,
  );
}

export function viteConfigTemplate(name: string): string {
  return `import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      outDir: 'dist',
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        module: resolve(__dirname, 'src/module.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@gwenjs/core',
        '@gwenjs/kit',
        /^@gwenjs\\/.*/,
      ],
    },
  },
})
`;
}

export function typesTemplate(name: string): string {
  const Pascal = toPascalCase(name);
  return `/**
 * Public types for @community/gwen-${name}.
 */

export interface ${Pascal}Config {
  // Add your plugin configuration options here
}

export interface ${Pascal}Service {
  // Add your service methods here
}
`;
}

export function augmentTemplate(name: string): string {
  const Pascal = toPascalCase(name);
  return `/**
 * Declaration merging — types engine.inject('${name}') as ${Pascal}Service.
 * Activated as a side-effect when importing from '@community/gwen-${name}'.
 */

import type { ${Pascal}Service } from './types.js'

declare module '@gwenjs/core' {
  interface GwenProvides {
    ${name}: ${Pascal}Service
  }
}

export {}
`;
}

export function pluginTemplate(name: string): string {
  const Pascal = toPascalCase(name);
  return `import { definePlugin } from '@gwenjs/kit'
import type { GwenEngine } from '@gwenjs/core'
import type { ${Pascal}Config, ${Pascal}Service } from './types.js'

export const ${Pascal}Plugin = definePlugin((config: ${Pascal}Config = {}) => {
  let service: ${Pascal}Service | null = null

  return {
    name: '@community/gwen-${name}',

    setup(engine: GwenEngine) {
      // TODO: implement your service
      service = {} as ${Pascal}Service
      engine.provide('${name}', service)
    },

    teardown() {
      service = null
    },
  }
})
`;
}

export function composablesTemplate(name: string): string {
  const Pascal = toPascalCase(name);
  const camel = toCamelCase(name);
  return `import { useEngine, GwenPluginNotFoundError } from '@gwenjs/core'
import type { ${Pascal}Service } from './types.js'
import './augment.js'

/**
 * Returns the ${Pascal} service registered by ${Pascal}Plugin.
 *
 * @throws {GwenPluginNotFoundError} If ${Pascal}Plugin is not registered.
 */
export function use${Pascal}(): ${Pascal}Service {
  const engine = useEngine()
  const ${camel} = engine.tryInject('${name}')
  if (${camel}) return ${camel}
  throw new GwenPluginNotFoundError({
    pluginName: '@community/gwen-${name}',
    hint: "Add '@community/gwen-${name}' to modules in gwen.config.ts",
  })
}
`;
}

export function moduleTemplate(name: string): string {
  const Pascal = toPascalCase(name);
  return `/**
 * Build-time module for @community/gwen-${name}.
 *
 * Add to gwen.config.ts:
 *   modules: ['@community/gwen-${name}']
 *
 * IMPORTANT: This file must never import from './index.js'.
 * Always import from './plugin.js' or './types.js' directly.
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit'
import type { ${Pascal}Config } from './types.js'

export default defineGwenModule<${Pascal}Config>({
  meta: { name: '@community/gwen-${name}' },
  defaults: {},
  async setup(options, kit) {
    // Direct import from plugin.ts — never from index.ts
    const { ${Pascal}Plugin } = await import('./plugin.js')

    kit.addPlugin(${Pascal}Plugin(options))

    kit.addAutoImports([
      { name: 'use${Pascal}', from: '@community/gwen-${name}' },
    ])

    kit.addTypeTemplate({
      filename: '${name}.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { ${Pascal}Service } from '@community/gwen-${name}'"],
          provides: { '${name}': '${Pascal}Service' },
        }),
    })
  },
})
`;
}

export function indexTemplate(name: string): string {
  const Pascal = toPascalCase(name);
  return `// Side-effect: activates typed engine.inject('${name}') in manual mode
import './augment.js'

// Plugin factory — for manual registration in plugins: []
export { ${Pascal}Plugin } from './plugin.js'

// Composables — use${Pascal}() for runtime access
export { use${Pascal} } from './composables.js'

// Public types
export type { ${Pascal}Config, ${Pascal}Service } from './types.js'

// The build-time module is exported via the './module' package export.
// Do NOT re-export it here — that would create a circular dependency.
`;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

async function promptPackageName(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    process.stdout.write('Package name (e.g. my-plugin): ');
    rl.once('line', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── Command ─────────────────────────────────────────────────────────────────

export const scaffoldPackageCommand = defineCommand({
  meta: {
    name: 'package',
    description: 'Scaffold a complete community plugin package',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Package name (kebab-case, e.g. my-plugin)',
      required: false,
    },
    'gwen-version': {
      type: 'string',
      description: 'GWEN peer dependency version range',
      default: '^0.1.0',
    },
  },
  async run({ args }) {
    let name = (args.name as string | undefined)?.trim() ?? '';

    if (!name) {
      name = await promptPackageName();
    }

    if (!name) {
      logger.error('[GWEN:scaffold:package] Package name cannot be empty.');
      process.exit(1);
    }

    const gwenVersion = (args['gwen-version'] as string) ?? '^0.1.0';
    const outputDir = path.join(process.cwd(), name);
    const srcDir = path.join(outputDir, 'src');

    await fs.mkdir(srcDir, { recursive: true });

    const files: Array<[string, string]> = [
      [path.join(outputDir, 'package.json'), packageJsonTemplate(name, gwenVersion)],
      [path.join(outputDir, 'tsconfig.json'), tsconfigTemplate()],
      [path.join(outputDir, 'vite.config.ts'), viteConfigTemplate(name)],
      [path.join(srcDir, 'types.ts'), typesTemplate(name)],
      [path.join(srcDir, 'augment.ts'), augmentTemplate(name)],
      [path.join(srcDir, 'plugin.ts'), pluginTemplate(name)],
      [path.join(srcDir, 'composables.ts'), composablesTemplate(name)],
      [path.join(srcDir, 'module.ts'), moduleTemplate(name)],
      [path.join(srcDir, 'index.ts'), indexTemplate(name)],
    ];

    for (const [filePath, content] of files) {
      await fs.writeFile(filePath, content, 'utf8');
    }

    logger.success(`✓ Package scaffolded at ${name}/`);
    logger.info('');
    logger.info('Next steps:');
    logger.info(`  cd ${name}`);
    logger.info('  pnpm install');
    logger.info('  pnpm dev');
    logger.info('');
    logger.info('Implement your logic in:');
    logger.info('  src/types.ts   — config & service interface');
    logger.info('  src/plugin.ts  — runtime plugin logic');
  },
});
