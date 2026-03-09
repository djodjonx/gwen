import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { HtmlUIPlugin } from '@djodjonx/gwen-plugin-html-ui';

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
