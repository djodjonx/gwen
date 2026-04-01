#@gwenengine/gwen-plugin-html-ui

Plugin GWEN pour le rendu UI via le DOM HTML.

## Installation

```ts
// gwen.config.ts
import { HtmlUIPlugin } from '@gwenengine/gwen-plugin-html-ui';

export default defineConfig({
  plugins: [new HtmlUIPlugin()],
});
```

## Types Vite — `*.html?raw`

Pour utiliser l'import de fichiers HTML bruts, ajouter une référence dans votre `tsconfig.json` :

```json
{
  "compilerOptions": {
    "types": ["@gwenengine/gwen-plugin-html-ui/vite-env"]
  }
}
```

Ou via un `/// <reference>` dans n'importe quel fichier `.d.ts` de votre projet :

```ts
/// <reference types="@gwenengine/gwen-plugin-html-ui/vite-env" />
```

Cela active l'autocomplétion pour :

```ts
import scoreHtml from './score.html?raw';
// scoreHtml: string ✅
```

## Usage

```ts
// src/ui/ScoreUI.ts
import { defineUI } from '@gwenengine/core';
import { Score } from '../components';
import scoreHtml from './score.html?raw';

export const ScoreUI = defineUI({
  name: 'ScoreUI',

  onMount(api, entityId) {
    api.services.get('htmlUI').mount(entityId, scoreHtml);
  },

  render(api, entityId) {
    const score = api.getComponent(entityId, Score);
    if (!score) return;
    const ui = api.services.get('htmlUI');
    ui.text(entityId, 'score', `SCORE: ${score.value}`);
    ui.text(entityId, 'lives', '♥ '.repeat(score.lives));
  },

  onUnmount(api, entityId) {
    api.services.get('htmlUI').unmount(entityId);
  },
});
```

```html
<!-- src/ui/score.html — vraie autocomplétion HTML/CSS dans l'IDE -->
<style>
  .hud {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
  }
  .hud-score {
    color: #4fffb0;
    font-size: 20px;
  }
  .hud-lives {
    color: #ff6b6b;
    font-size: 14px;
  }
</style>
<div class="hud">
  <div id="score" class="hud-score">SCORE: 0</div>
  <div id="lives" class="hud-lives">♥ ♥ ♥</div>
</div>
```

## Service `HtmlUI`

```ts
interface HtmlUI {
  mount(entityId: EntityId, template: string): void;
  unmount(entityId: EntityId): void;
  el(entityId: EntityId, id: string): HTMLElement | undefined;
  text(entityId: EntityId, id: string, value: string): void;
  style(entityId: EntityId, id: string, prop: string, value: string): void;
}
```
