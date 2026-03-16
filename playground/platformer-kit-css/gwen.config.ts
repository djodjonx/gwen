import { defineConfig } from '@djodjonx/gwen-kit';
import { Physics2DPlugin } from '@djodjonx/gwen-plugin-physics2d';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { HtmlUIPlugin } from '@djodjonx/gwen-plugin-html-ui';
import { PlatformerDefaultInputMap } from '@djodjonx/gwen-kit-platformer';

/**
 * GWEN Project Configuration
 * Platformer Kit Playground with CSS rendering
 */
export default defineConfig({
  engine: {
    maxEntities: 5000,
    targetFPS: 60,
    debug: true,
  },

  html: {
    title: 'Platformer Kit CSS — GWEN',
    background: '#1a1a1a',
  },

  mainScene: 'PlatformerScene',

  plugins: [
    new Physics2DPlugin({
      gravity: 25,
      debug: true,
    }),
    new InputPlugin({
      actionMap: PlatformerDefaultInputMap,
    }),
    new AudioPlugin({ masterVolume: 0.5 }),
    new HtmlUIPlugin(),
  ],
});
