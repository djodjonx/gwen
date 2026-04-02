import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: false })],
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
        '@gwenjs/core',
        '@gwenjs/kit',
        '@gwenjs/physics2d',
        '@gwenjs/physics2d/core',
        '@gwenjs/physics2d/helpers/static-geometry',
        '@gwenjs/input',
        '@gwenjs/cli',
      ],
    },
  },
});
