import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: false })],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
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
