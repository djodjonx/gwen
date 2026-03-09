import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'pathe';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        bin: resolve(__dirname, 'src/bin.ts'),
      },
      name: 'GwenCLI',
      formats: ['es'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    outDir: 'dist',
    rollupOptions: {
      external: (id) => {
        // Externalize all dependencies
        return (
          id.startsWith('citty') ||
          id.startsWith('consola') ||
          id.startsWith('c12') ||
          id.startsWith('pathe') ||
          id.startsWith('execa') ||
          id.startsWith('jiti') ||
          id.startsWith('oxlint') ||
          id.startsWith('oxfmt') ||
          id.startsWith('@djodjonx/gwen-') ||
          id.startsWith('node:') ||
          !id.startsWith('.')
        );
      },
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
    target: 'node18',
    minify: false,
    sourcemap: true,
  },
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['tests/**/*', 'node_modules/**/*', '**/*vite-config-builder*'],
      outDir: 'dist',
      rollupTypes: true,
    }),
  ],
});
