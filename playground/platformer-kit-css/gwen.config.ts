import { defineConfig } from '@gwenengine/kit';
import { Physics2DPlugin } from '@gwenengine/physics2d';
import { InputPlugin } from '@gwenengine/input';
import { AudioPlugin } from '@gwenengine/audio';
import { HtmlUIPlugin } from '@gwenengine/ui';
import { PlatformerDefaultInputMap } from '@gwenengine/kit-platformer';

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
      gravity: 35,
      debug: true,
    }),
    new InputPlugin({
      actionMap: PlatformerDefaultInputMap,
    }),
    new AudioPlugin({ masterVolume: 0.5 }),
    new HtmlUIPlugin(),
  ],
});
