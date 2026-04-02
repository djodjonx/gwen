import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: false })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'GwenAdapterR3F',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@react-three/fiber', '@gwenjs/core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@react-three/fiber': 'ReactThreeFiber',
          '@gwenjs/core': 'GwenEngineCore',
        },
      },
    },
  },
});
