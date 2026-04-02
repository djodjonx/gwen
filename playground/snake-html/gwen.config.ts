import { defineConfig } from '@gwenjs/kit';
import { InputPlugin } from '@gwenjs/input';
import { HtmlUIPlugin } from '@gwenjs/ui';

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
  plugins: [InputPlugin(), HtmlUIPlugin()],
});
