import { defineConfig } from '@gwen/kit';
import { InputPlugin } from '@gwen/plugin-input';
import { HtmlUIPlugin } from '@gwen/plugin-html-ui';

export default defineConfig({
  engine: {
    targetFPS: 60,
    maxEntities: 100,
    debug: false,
  },
  html: {
    title: 'GWEN — Snake HTML/CSS',
    background: '#0b1020',
  },
  plugins: [new InputPlugin(), new HtmlUIPlugin()],
});
