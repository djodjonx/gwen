import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: true })],
  build: {
    lib: {
      // Deux entry points : index (runtime navigateur) + index.setup (CLI Node.js)
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'index.setup': resolve(__dirname, 'src/index.setup.ts'),
      },
      formats: ['es'],
      fileName: (_, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: [
        '@djodjonx/gwen-engine-core',
        '@djodjonx/gwen-kit',
        '@djodjonx/gwen-plugin-physics2d',
        '@djodjonx/gwen-plugin-input',
        '@djodjonx/gwen-cli',
      ],
    },
  },
});
