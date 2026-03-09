/**
 * TypeScript configuration generation for GWEN projects
 */

/**
 * Generate tsconfig.generated.json content
 * This file is auto-generated and should not be manually edited
 */
export function generateTsconfig(_projectDir: string): object {
  return {
    // Ce fichier est généré automatiquement par `gwen prepare`.
    // NE PAS MODIFIER — vos modifications seront écrasées.
    // Modifiez gwen.config.ts à la place.
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      customConditions: ['development'],
    },
    include: ['../src', '../*.ts', './*.d.ts'],
    exclude: ['../node_modules', '../dist'],
  };
}
