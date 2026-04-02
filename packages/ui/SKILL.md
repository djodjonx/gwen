---
name: gwen-html-ui
description: Expert skill for hybrid DOM-ECS UI systems, handle dynamic templates, and reactive style/content updates.
---

# HTML UI Expert Skill

## Context
GWEN HTML UI is designed for complex interfaces (HUDs, Menus) where Canvas rendering is inefficient. Each entity gets an isolated DOM root in a global container.

## Instructions

### 1. Template Design & CSS Isolation
Templates are raw HTML with optional `<style>` tags. Styles are hashed and injected into `<head>` once to prevent redundancy.
```typescript
const template = `
  <style>
    .hp-bar { width: 100px; height: 10px; border: 1px solid white; }
    .hp-fill { background: green; transition: width 0.3s; }
  </style>
  <div class="hp-bar"><div id="hp" class="hp-fill"></div></div>
`;
api.services.get('htmlUI').mount(entityId, template);
```

### 2. High-Frequency Updates (`htmlUI` service)
- `text(entityId, elementId, value)`: Updates content only (prevents re-parsing).
- `style(entityId, elementId, property, value)`: Direct CSS access (camelCase, e.g., `backgroundColor`).
- `el(entityId, elementId)`: Returns raw `HTMLElement`. Useful for adding event listeners or complex DOM manipulations.

### 3. Lifecycle Management
- `mount(entityId, template)`: Creates DOM context. If already mounted, it automatically `unmounts` first.
- `unmount(entityId)`: Complete removal from DOM and memory.

## Available Resources
- `packages/@gwenjs/plugin-html-ui/src/index.ts`: The `HtmlUI` service implementation.

## Constraints
- **Deduplication**: Style hashing is based on content. Identical styles across different entities are only injected once.
- **IDs**: Element IDs must be unique within a single entity's template. They are mapped internally and accessed via `elementId`.
- **Event Listeners**: If adding manual listeners via `el(id).addEventListener`, ensure they are cleaned up or use `onUnmount` hook to prevent memory leaks.
- **Rendering Context**: GWEN HTML UI uses `pointer-events: none` on the main container but `pointer-events: auto` on entity roots by default.
