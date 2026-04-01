#!/usr/bin/env node
/**
 * @gwenengine/cli — Main entry point
 *
 * CLI entry point using Citty framework.
 * All commands are defined in src/commands/*.ts
 *
 * Supports graceful shutdown via SIGINT/SIGTERM.
 *
 * Usage:
 *   gwen [command] [options]
 *
 * Global options:
 *   --verbose (-v)  Show detailed logs
 *   --debug         Show debug information
 *
 * Commands:
 *   prepare         Generate .gwen/ (tsconfig + types)
 *   dev             Start development server
 *   build           Production build
 *   preview         Preview production build
 *   lint            Lint source code
 *   format          Format source code
 *   info            Show parsed config
 *
 * @example
 * ```bash
 * gwen --help
 * gwen prepare --help
 * gwen dev --port 3001 --open
 * gwen build --verbose
 * ```
 */

import process from 'node:process';
import { defineCommand, runMain } from 'citty';
import { logger } from './utils/logger.js';
import { VERSION } from './utils/constants.js';

// Import commands
import devCommand from './commands/dev.js';
import buildCommand from './commands/build.js';
import prepareCommand from './commands/prepare.js';
import previewCommand from './commands/preview.js';
import lintCommand from './commands/lint.js';
import formatCommand from './commands/format.js';
import infoCommand from './commands/info.js';
import { initCommand } from './commands/init.js';
import { addCommand } from './commands/add.js';
import scaffoldCommand from './commands/scaffold/index.js';
import { doctorCommand } from './commands/doctor.js';

/**
 * Graceful shutdown handler
 * Stops any pending operations on SIGINT/SIGTERM
 */
const cleanup = () => {
  logger.info('Shutting down gracefully...');
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Main CLI command definition
 * Acts as a dispatcher to all subcommands
 */
const main = defineCommand({
  meta: {
    name: 'gwen',
    version: VERSION,
    description: 'GWEN Game Engine CLI — dev, build, and manage game projects',
  },
  subCommands: {
    init: initCommand,
    dev: devCommand,
    build: buildCommand,
    prepare: prepareCommand,
    preview: previewCommand,
    add: addCommand,
    scaffold: scaffoldCommand,
    lint: lintCommand,
    format: formatCommand,
    info: infoCommand,
    doctor: doctorCommand,
  },
});

/**
 * Run the CLI
 * runMain handles:
 * - Usage generation
 * - Error handling
 * - Process exit codes
 */
runMain(main).catch((error) => {
  logger.error('Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
