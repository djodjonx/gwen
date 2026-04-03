/**
 * `gwen init` command
 *
 * Scaffolds a new GWEN game project in a new directory.
 * Prompts the user for a project name and optional starter modules.
 *
 * Generated files:
 *  - package.json           (Vite 8, TypeScript 6, oxlint, oxfmt, all scripts)
 *  - tsconfig.json          (strict, bundler moduleResolution)
 *  - oxlint.json            (no-explicit-any: error)
 *  - .oxfmtrc.json          (indent 2, lineWidth 100, singleQuote)
 *  - gwen.config.ts         (Canvas2DRenderer + InputPlugin enabled)
 *  - README.md              (quick-start guide with controls and commands)
 *  - src/components/game.ts (ECS component definitions)
 *  - src/systems/movement.ts
 *  - src/systems/input.ts
 *  - src/systems/collision.ts
 *  - src/systems/spawn.ts
 *  - src/systems/render.ts
 *  - src/scenes/game.ts     (scene wiring all systems together)
 *
 * @example
 * ```bash
 * gwen init
 * gwen init my-game
 * gwen init my-game --modules @gwenjs/physics2d,@gwenjs/audio
 * ```
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { readPackageJSON } from 'pkg-types'
import { consola } from 'consola'
import { defineCommand } from 'citty'
import { logger } from '../../utils/logger.js'
import { packageJsonTemplate } from './templates/package-json.js'
import { tsconfigTemplate } from './templates/tsconfig.js'
import { oxlintTemplate } from './templates/oxlint.js'
import { oxfmtTemplate } from './templates/oxfmt.js'
import { gwenConfigTemplate } from './templates/gwen-config.js'
import { readmeTemplate } from './templates/readme.js'
import { componentsTemplate } from './templates/game/components.js'
import { systemsTemplate } from './templates/game/systems.js'
import { sceneTemplate } from './templates/game/scene.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read the CLI's own published version to stamp into scaffolded package.json. */
async function getGwenVersion(): Promise<string> {
  try {
    const pkg = await readPackageJSON(new URL('../..', import.meta.url).pathname)
    return pkg.version ?? '1.0.0'
  } catch {
    return '1.0.0'
  }
}

/**
 * Write a file, creating all parent directories as needed.
 *
 * @param filePath - Absolute path to the target file.
 * @param content  - UTF-8 content to write.
 */
async function write(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

// ─── Module list ──────────────────────────────────────────────────────────────

/**
 * Built-in starter modules offered during `gwen init`.
 * `@gwenjs/renderer-canvas2d` and `@gwenjs/input` are always included
 * (they power the landing game) and therefore excluded from this list.
 */
const OPTIONAL_MODULES = [
  { value: '@gwenjs/physics2d', label: 'Physics 2D', hint: 'Rapier-based 2D physics' },
  { value: '@gwenjs/physics3d', label: 'Physics 3D', hint: 'Rapier-based 3D physics' },
  { value: '@gwenjs/audio', label: 'Audio', hint: 'Web Audio API integration' },
  { value: '@gwenjs/r3f', label: 'React Three Fiber', hint: 'R3F renderer adapter' },
  { value: '@gwenjs/debug', label: 'Debug overlay', hint: 'Performance HUD and inspector' },
]

const VALID_MODULE_VALUES = new Set(OPTIONAL_MODULES.map((m) => m.value))

// ─── Command ──────────────────────────────────────────────────────────────────

/** Named export consumed by commands/init.ts re-export and tests. */
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
    modules: {
      type: 'string',
      description:
        'Comma-separated list of optional modules to include (skips interactive prompt)',
      alias: 'm',
    },
  },
  async run({ args }) {
    // ── Project name ─────────────────────────────────────────────────────────
    let name = (args.name as string | undefined)?.trim() ?? ''

    if (!name) {
      name = (await consola.prompt('Project name:', {
        type: 'text',
        default: 'my-game',
      })) as string
      name = name.trim()
    }

    if (!name) {
      logger.error('[GWEN:init] Project name cannot be empty.')
      process.exit(1)
    }

    // ── Optional module selection ─────────────────────────────────────────────
    let extraModules: string[]
    const modulesArg = (args.modules as string | undefined)?.trim()

    if (modulesArg !== undefined) {
      extraModules = modulesArg
        ? modulesArg
            .split(',')
            .map((m) => m.trim())
            .filter((m) => {
              if (!VALID_MODULE_VALUES.has(m)) {
                logger.warn(`[GWEN:init] Unknown module "${m}" ignored.`)
                return false
              }
              return true
            })
        : []
    } else {
      extraModules = (await consola.prompt('Select optional modules:', {
        type: 'multiselect',
        options: OPTIONAL_MODULES,
      })) as unknown as string[]
    }

    const projectDir = path.join(process.cwd(), name)

    logger.info(`Creating project in ${projectDir} …`)

    // ── Generate files ────────────────────────────────────────────────────────
    const gwenVersion = await getGwenVersion()

    // Config files (project root)
    await write(path.join(projectDir, 'package.json'), packageJsonTemplate(name, gwenVersion, extraModules))
    await write(path.join(projectDir, 'tsconfig.json'), tsconfigTemplate())
    await write(path.join(projectDir, 'oxlint.json'), oxlintTemplate())
    await write(path.join(projectDir, '.oxfmtrc.json'), oxfmtTemplate())
    await write(path.join(projectDir, 'gwen.config.ts'), gwenConfigTemplate(extraModules))
    await write(path.join(projectDir, 'README.md'), readmeTemplate(name))

    // Game source — components
    await write(
      path.join(projectDir, 'src', 'components', 'game.ts'),
      componentsTemplate(),
    )

    // Game source — systems
    const systems = systemsTemplate()
    for (const [filename, content] of Object.entries(systems)) {
      await write(path.join(projectDir, 'src', 'systems', filename), content)
    }

    // Game source — scene
    await write(path.join(projectDir, 'src', 'scenes', 'game.ts'), sceneTemplate())

    // ── Done ──────────────────────────────────────────────────────────────────
    logger.success(`✓ Project "${name}" created successfully.`)
    logger.info('')
    logger.info('  Next steps:')
    logger.info(`    cd ${name}`)
    logger.info('    pnpm install')
    logger.info('    pnpm dev')
    logger.info('')
    logger.info('  Open http://localhost:5173 to play the Starfield Shooter landing game.')
  },
})
