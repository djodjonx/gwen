/**
 * Re-export `initCommand` from the refactored `init/` module.
 *
 * This shim preserves the import path used by `bin.ts`:
 *   `import { initCommand } from './commands/init.js'`
 *
 * All logic and templates now live under `commands/init/`.
 */
export { initCommand } from './init/index.js';
