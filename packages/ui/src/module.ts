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
import { HtmlUIPlugin } from './index.js';

/**
 * GWEN module for the HTML UI plugin.
 */
export default defineGwenModule({
  meta: { name: '@gwenjs/ui' },
  defaults: {},
  async setup(_options, kit) {
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
