/**
 * @file GWEN Module for @gwenjs/ui.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import ui from '@gwenjs/ui/module'
 * export default defineConfig({ modules: [ui()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenjs/kit';

/**
 * GWEN module for the HTML UI plugin.
 *
 * Note: HtmlUIPlugin is imported lazily inside setup() to avoid a circular
 * dependency between index.ts (which re-exports this module's default) and
 * module.ts (which needs HtmlUIPlugin from index.ts). In CJS contexts (jiti)
 * circular deps at the top level can cause unresolvable undefined values.
 */
export default defineGwenModule({
  meta: { name: '@gwenjs/ui' },
  defaults: {},
  async setup(_options, kit) {
    // Lazy import breaks the index.ts ↔ module.ts circular dependency.
    const { HtmlUIPlugin } = await import('./index.js');
    kit.addPlugin(HtmlUIPlugin());

    kit.addAutoImports([{ name: 'useHtmlUI', from: '@gwenjs/ui' }]);

    kit.addTypeTemplate({
      filename: 'ui.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { HtmlUI } from '@gwenjs/ui'"],
          provides: { htmlUI: 'HtmlUI' },
        }),
    });
  },
});
