/**
 * `gwen scaffold` command group
 *
 * Sub-commands for scaffolding artefacts:
 *  - `gwen scaffold plugin [name]` — creates a runtime plugin stub
 *  - `gwen scaffold module [name]` — creates a build-time module stub
 *
 * @example
 * ```bash
 * gwen scaffold plugin my-renderer
 * gwen scaffold module my-module
 * ```
 */

import { defineCommand } from 'citty';
import { scaffoldPluginCommand } from './plugin.js';
import { scaffoldModuleCommand } from './module.js';

/**
 * The `scaffold` command exposes sub-commands for code generation.
 * Exported as a default so bin.ts can register it under `scaffold`.
 */
export default defineCommand({
  meta: {
    name: 'scaffold',
    description: 'Scaffold artefacts (plugin, module)',
  },
  subCommands: {
    plugin: scaffoldPluginCommand,
    module: scaffoldModuleCommand,
  },
});
