# HTML UI Plugin

Package: `@gwenjs/ui`

DOM overlay plugin for HUD, menus, and HTML/CSS interfaces.

## Install

```bash
pnpm add @gwenjs/ui
```

## Register

```ts
import { defineConfig } from '@gwenjs/kit';
import { HtmlUIPlugin } from '@gwenjs/ui';

export default defineConfig({
  plugins: [HtmlUIPlugin()],
});
```

## API

Main export:
- `HtmlUIPlugin()`

Service provided:
- `htmlUI`

`HtmlUI` methods:
- `mount(entityId, template)`
- `unmount(entityId)`
- `el(entityId, id)`
- `text(entityId, id, value)`
- `style(entityId, id, prop, value)`

Notes:
- plugin manages a container with id `gwen-html-ui`
- style tags from templates are deduplicated

## Example

```ts
const htmlUI = api.services.get('htmlUI');

onMount(() => {
  htmlUI.mount(entityId, '<div id="score">0</div>');
});

onUpdate(() => {
  htmlUI.text(entityId, 'score', String(score));
});
```

## Source

- `packages/ui/src/index.ts`
