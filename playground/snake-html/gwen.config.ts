import { defineConfig } from '@gwenengine/kit';
import { InputPlugin } from '@gwenengine/input';
import { HtmlUIPlugin } from '@gwenengine/ui';

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
