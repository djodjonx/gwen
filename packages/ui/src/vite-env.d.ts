/**
 * @gwenjs/gwen-plugin-html-ui — type declarations for Vite imports
 *
 * Automatically injected into `.gwen/gwen.d.ts` via `/// <reference types="@gwenjs/gwen-plugin-html-ui/vite-env" />`
 * when this plugin is declared in `gwen.config.ts`.
 *
 * Allows using in UI files:
 * ```ts
 * import template from './my-ui.html?raw';   // ✅ string
 * import styles   from './my-ui.css?inline'; // ✅ string
 * ```
 */

// Support for importing HTML files with ?raw (defineUI templates)
declare module '*.html?raw' {
  const content: string;
  export default content;
}

// Support for importing text files with ?raw
declare module '*.txt?raw' {
  const content: string;
  export default content;
}

// Support for importing CSS files with ?inline (scoped styles)
declare module '*.css?inline' {
  const content: string;
  export default content;
}
