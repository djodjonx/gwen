import { defineConfig } from '@gwenengine/kit';
import { InputPlugin } from '@gwenengine/input';
import { AudioPlugin } from '@gwenengine/audio';
import { HtmlUIPlugin } from '@gwenengine/ui';
import { Physics2D } from '@gwenengine/physics2d';

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
    new Physics2D({
      gravity: 20, // Y+ vers le bas pour coller au rendu CSS de mario-css
      qualityPreset: 'high',
      ccdEnabled: true,
      debug: true,
      compat: {
        legacyPrefabColliderProps: false,
        legacyCollisionJsonParser: false,
      },
      layers: {
        player: 0,
        world: 1,
        box: 2,
        sensor: 3,
      },
    }),
  ],
});
