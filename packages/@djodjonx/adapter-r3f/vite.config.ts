import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ include: ['src'], outDir: 'dist', rollupTypes: true })],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'GwenAdapterR3F',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@react-three/fiber', '@djodjonx/gwen-engine-core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@react-three/fiber': 'ReactThreeFiber',
          '@djodjonx/gwen-engine-core': 'GwenEngineCore',
        },
      },
    },
  },
});
