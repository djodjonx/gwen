import { defineConfig } from '@djodjonx/gwen-kit';
import { InputPlugin } from '@djodjonx/gwen-plugin-input';
import { AudioPlugin } from '@djodjonx/gwen-plugin-audio';
import { Canvas2DRenderer } from '@djodjonx/gwen-renderer-canvas2d';

/**
 * GWEN Project Configuration
 *
 * Plugins are registered here. The services they expose are automatically
 * available with full autocompletion in your systems and scenes.
 *
 * Run `gwen prepare` to generate type definitions after adding plugins.
 */
export default defineConfig({
  engine: {
    maxEntities: 10_000,
    targetFPS: 60,
    debug: true,
  },

  html: {
    title: '{{PROJECT_NAME}} — GWEN',
    background: '#000000',
  },

  mainScene: 'MainScene',

  plugins: [
    new InputPlugin(),
    new AudioPlugin({ masterVolume: 0.5 }),
    new Canvas2DRenderer({
      width: 800,
      height: 600,
      background: '#000000',
    }),
  ],
});
