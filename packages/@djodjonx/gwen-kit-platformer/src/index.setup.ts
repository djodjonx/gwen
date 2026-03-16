import type { GwenModuleContext } from '@djodjonx/gwen-cli/setup';
import { INPUT_PLUGIN_NAME } from '@djodjonx/gwen-plugin-input';

// Defined locally to avoid circular dependency on @djodjonx/gwen-plugin-physics2d
// Update if the physics plugin renames its plugin.name
const PHYSICS_2D_PLUGIN_NAME = 'Physics2DPlugin';

/**
 * Build-time validation for gwen-kit-platformer.
 * Executed by `gwen prepare` and `gwen dev` — never bundled for the browser.
 *
 * Checks:
 * 1. @djodjonx/gwen-plugin-physics2d is in config.plugins[] (error → stops build)
 * 2. InputPlugin is in config.plugins[] (warn → build continues)
 */
export async function setup(ctx: GwenModuleContext): Promise<void> {
  const hasPhysics = ctx.config.plugins.some((p) => p.name === PHYSICS_2D_PLUGIN_NAME);
  if (!hasPhysics) {
    ctx.logger.error(
      '[gwen-kit-platformer] @djodjonx/gwen-plugin-physics2d is missing from plugins[] in gwen.config.ts.',
    );
  }

  const hasInput = ctx.config.plugins.some((p) => p.name === INPUT_PLUGIN_NAME);
  if (!hasInput) {
    ctx.logger.warn(
      '[gwen-kit-platformer] InputPlugin not detected — default input wiring will be disabled.',
    );
  }
}
