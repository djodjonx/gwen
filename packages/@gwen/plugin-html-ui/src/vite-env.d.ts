/**
 * @gwen/plugin-html-ui — Vite type augmentations
 *
 * Déclare le type pour l'import de fichiers HTML bruts via Vite (?raw).
 * Automatiquement disponible quand @gwen/plugin-html-ui est installé
 * et référencé dans tsconfig via "types" ou "typeRoots".
 *
 * @example
 * ```ts
 * import scoreHtml from './score.html?raw';
 * // scoreHtml: string ✅
 *
 * api.services.get('htmlUI').mount(entityId, scoreHtml);
 * ```
 */
declare module '*.html?raw' {
  const content: string;
  export default content;
}
