import { definePrefab, UIComponent } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import { Position, Tag, TileSize, BoxState } from '../components/index.ts';

/**
 * FloorPrefab — sol / plateforme statique.
 * Appelé avec le centre de la tuile (x+w/2, y+h/2) et les demi-dimensions.
 * Le hook extensions.physics lit hw/hh ici pour construire le collider exact.
 *
 * IMPORTANT : hw/hh sont des placeholders — on les surcharge à l'instantiate
 * via createFloorPrefab(hw, hh) qui génère un prefab avec les bonnes valeurs.
 */
export function createFloorPrefab(
  hw: number,
  hh: number,
  uiName = 'FloorUI',
  tagValue = 'floor',
  prefabName = 'Floor',
) {
  return definePrefab({
    name: prefabName,
    extensions: {
      physics: {
        bodyType: 'fixed',
        hw,
        hh,
        friction: 0.5,
        restitution: 0.0,
      },
    },
    create(api, cx: number, cy: number): EntityId {
      const id = api.createEntity();
      api.addComponent(id, Position, { x: cx, y: cy });
      api.addComponent(id, Tag, { value: tagValue });
      api.addComponent(id, TileSize, { hw, hh });
      api.addComponent(id, UIComponent, { uiName });
      return id;
    },
  });
}

/**
 * PipePrefab — tuyau statique.
 */
export function createPipePrefab(
  hw: number,
  hh: number,
  uiName = 'PipeUI',
  tagValue = 'pipe',
  prefabName = 'Pipe',
) {
  return definePrefab({
    name: prefabName,
    extensions: {
      physics: {
        bodyType: 'fixed',
        hw,
        hh,
        friction: 0.0,
        restitution: 0.0,
      },
    },
    create(api, cx: number, cy: number): EntityId {
      const id = api.createEntity();
      api.addComponent(id, Position, { x: cx, y: cy });
      api.addComponent(id, Tag, { value: tagValue });
      api.addComponent(id, TileSize, { hw, hh });
      api.addComponent(id, UIComponent, { uiName });
      return id;
    },
  });
}

/**
 * BoxPrefab — mystery box (32×32), position = coin supérieur gauche.
 */
export const BoxPrefab = definePrefab({
  name: 'Box',
  extensions: {
    physics: {
      bodyType: 'fixed',
      hw: 16,
      hh: 16,
      friction: 0.0,
      restitution: 0.0,
    },
  },
  create(api, x: number, y: number): EntityId {
    const id = api.createEntity();
    // Centre = coin + demi-taille
    api.addComponent(id, Position, { x: x + 16, y: y + 16 });
    api.addComponent(id, Tag, { value: 'box' });
    api.addComponent(id, TileSize, { hw: 16, hh: 16 });
    api.addComponent(id, BoxState, { hit: false });
    api.addComponent(id, UIComponent, { uiName: 'BoxUI' });
    return id;
  },
});

/**
 * FlagPrefab — poteau de fin de niveau (sensor).
 */
export const FlagPrefab = definePrefab({
  name: 'Flag',
  extensions: {
    physics: {
      bodyType: 'fixed',
      hw: 12,
      hh: 176,
      isSensor: true,
      friction: 0,
      restitution: 0,
    },
  },
  create(api, x: number, y: number, _w: number, h: number): EntityId {
    const hh = h / 2;
    const id = api.createEntity();
    api.addComponent(id, Position, { x: x + 12, y: y + hh });
    api.addComponent(id, Tag, { value: 'flag' });
    api.addComponent(id, TileSize, { hw: 12, hh });
    api.addComponent(id, UIComponent, { uiName: 'FlagUI' });
    return id;
  },
});
