/**
 * @file GWEN Module for @gwenengine/ui.
 *
 * Default export — register this in `modules` inside `gwen.config.ts`:
 *
 * ```ts
 * import ui from '@gwenengine/ui/module'
 * export default defineConfig({ modules: [ui()] })
 * ```
 */

import { defineGwenModule, definePluginTypes } from '@gwenengine/kit';
import { HtmlUIPlugin } from './index.js';

/**
 * GWEN module for the HTML UI plugin.
 */
export default defineGwenModule({
  defaults: {},
  async setup(_options, kit) {
    kit.addPlugin(HtmlUIPlugin());

    kit.addAutoImports([{ name: 'useHtmlUI', from: '@gwenengine/ui' }]);

    kit.addTypeTemplate({
      filename: 'ui.d.ts',
      getContents: () =>
        definePluginTypes({
          imports: ["import type { HtmlUI } from '@gwenengine/ui'"],
          provides: { htmlUI: 'HtmlUI' },
        }),
    });
  },
});
