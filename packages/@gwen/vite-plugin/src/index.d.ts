/**
 * @gwen/vite-plugin — Plugin Vite pour les projets GWEN
 *
 * Fonctionnalités :
 *  1. **WASM hot-reload** : surveille les fichiers `.rs` du crate Rust,
 *     relance `wasm-pack build` en arrière-plan et déclenche un HMR
 *     complet quand le `.wasm` change.
 *  2. **Injection WASM via middleware** : sert les fichiers WASM directement
 *     depuis les sources (sans copie vers public/) en mode dev.
 *     En build de prod, les émet comme assets Rollup dans dist/wasm/.
 *  3. **Injection du manifeste** : injecte `gwen-manifest.json` comme
 *     variable virtuelle `__GWEN_MANIFEST__` accessible dans le code.
 *
 * Usage dans vite.config.ts :
 * ```typescript
 * import { gwen } from '@gwen/vite-plugin';
 *
 * export default defineConfig({
 *   plugins: [
 *     gwen({
 *       cratePath: '../crates/gwen-core',
 *       watch: true,
 *     })
 *   ]
 * });
 * ```
 */
import type { Plugin } from 'vite';
export interface GwenPluginOptions {
    /**
     * Chemin vers le crate Rust à compiler (dossier contenant Cargo.toml).
     * Si omis, le plugin cherche Cargo.toml dans les dossiers parents.
     */
    cratePath?: string;
    /**
     * Préfixe URL sous lequel les fichiers WASM sont servis.
     * Défaut : '/wasm'
     */
    wasmPublicPath?: string;
    /**
     * Active le watch des fichiers .rs pour le hot-reload WASM.
     * Défaut : true en mode dev, false en mode build.
     */
    watch?: boolean;
    /**
     * Mode de compilation wasm-pack ('release' | 'debug').
     * Défaut : 'debug' en mode dev pour des rebuilds plus rapides.
     */
    wasmMode?: 'release' | 'debug';
    /**
     * Chemin vers le manifeste gwen-manifest.json.
     * Si fourni, son contenu est injecté comme `__GWEN_MANIFEST__`.
     */
    manifestPath?: string;
    /** Active les logs détaillés. */
    verbose?: boolean;
}
export declare function gwen(options?: GwenPluginOptions): Plugin;
export default gwen;
//# sourceMappingURL=index.d.ts.map