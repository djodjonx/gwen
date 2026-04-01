import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'GwenPluginPhysics3D',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['@gwenengine/core', '@gwenengine/kit'],
      output: {
        globals: {
          '@gwenengine/core': 'GwenEngineCore',
          '@gwenengine/kit': 'GwenKit',
        },
      },
    },
  },
});
