/**
 * @gwen/plugin-html-ui — déclarations de types pour imports Vite
 *
 * Injecté automatiquement dans `.gwen/gwen.d.ts` via `/// <reference types="@gwen/plugin-html-ui/vite-env" />`
 * lorsque ce plugin est déclaré dans `gwen.config.ts`.
 *
 * Permet d'utiliser dans les fichiers UI :
 * ```ts
 * import template from './my-ui.html?raw';   // ✅ string
 * import styles   from './my-ui.css?inline'; // ✅ string
 * ```
 */

// Support pour les imports de fichiers HTML avec ?raw (templates defineUI)
declare module '*.html?raw' {
  const content: string;
  export default content;
}

// Support pour les imports de fichiers texte avec ?raw
declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// Support pour les imports de fichiers CSS avec ?inline (styles scoped)
declare module '*.css?inline' {
  const content: string;
  export default content;
}
