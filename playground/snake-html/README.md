# Snake HTML/CSS Playground

Playground GWEN: Snake rendu en HTML/CSS (sans canvas), avec logique TypeScript minimale.

## Scripts

```bash
pnpm gwen:prepare
pnpm dev
pnpm build
pnpm preview
```

## Controles

- Fleches ou `WASD`: deplacement
- `R`: recommencer apres game over

## Structure

- `src/scenes/MainScene.ts`: scene principale
- `src/systems/SnakeSystem.ts`: logique de jeu (tick, collisions, score)
- `src/ui/SnakeUI.ts`: montage + rendu DOM
- `src/ui/snake.html`: layout HTML
- `src/ui/snake.css`: style CSS

