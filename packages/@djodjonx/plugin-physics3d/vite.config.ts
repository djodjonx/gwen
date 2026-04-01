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
      external: ['@djodjonx/gwen-engine-core', '@djodjonx/gwen-kit'],
      output: {
        globals: {
          '@djodjonx/gwen-engine-core': 'GwenEngineCore',
          '@djodjonx/gwen-kit': 'GwenKit',
        },
      },
    },
  },
});
