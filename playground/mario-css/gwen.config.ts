import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { HtmlUIPlugin } from '@djodjonx/gwen-plugin-html-ui';
import { physics2D } from '@djodjonx/gwen-plugin-physics2d';

/**
 * GWEN Project Configuration
 */
export default defineConfig({
  engine: {
    maxEntities: 10_000,
    targetFPS: 60,
    debug: true,
  },

  html: {
    title: 'Mario CSS — GWEN',
    background: '#5c94fc', // Mario Sky
  },

  mainScene: 'MainScene',

  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.5 }),
    new HtmlUIPlugin(),
    physics2D({
      gravity: 20, // Y+ vers le bas pour coller au rendu CSS de mario-css
      debug: true,
    }),
  ],
});
