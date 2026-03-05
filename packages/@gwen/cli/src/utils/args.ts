/**
 * Global CLI arguments (available on all commands)
 */

export const GLOBAL_ARGS = {
  verbose: {
    type: 'boolean' as const,
    alias: 'v',
    description: 'Show detailed logs',
  },
  debug: {
    type: 'boolean' as const,
    description: 'Show debug information (very verbose)',
  },
} as const;
