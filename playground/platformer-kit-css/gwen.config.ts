import { defineConfig } from '@gwenjs/kit';
import { Physics2DPlugin } from '@gwenjs/physics2d';
import { InputPlugin } from '@gwenjs/input';
import { AudioPlugin } from '@gwenjs/audio';
import { HtmlUIPlugin } from '@gwenjs/ui';
import { PlatformerDefaultInputMap } from '@gwenjs/kit-platformer';

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
    Physics2DPlugin({
      gravity: 35,
      debug: true,
    }),
    InputPlugin({
      actionMap: PlatformerDefaultInputMap,
    }),
    AudioPlugin({ masterVolume: 0.5 }),
    HtmlUIPlugin(),
  ],
});
