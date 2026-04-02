import { definePrefab, UIComponent } from '@gwenjs/core';
import { Position, Tag, PlayerState } from '../components/index.ts';

export const PLAYER_W = 24; // px — taille visuelle
export const PLAYER_H = 30; // px
export const PLAYER_HW = PLAYER_W / 2; // demi-largeur physique
export const PLAYER_HH = PLAYER_H / 2; // demi-hauteur physique

/**
 * PlayerPrefab
 * - extensions.physics : body dynamic, collider box exact
 * - Position en pixels, le hook divise par PIXELS_PER_METER (50)
 */
export const PlayerPrefab = definePrefab({
  name: 'Player',
  extensions: {
    physics: {
      bodyType: 'dynamic',
      ccdEnabled: true,
      linearDamping: 0.0,
      angularDamping: 999.0,
      gravityScale: 1.0,
      colliders: [
        {
          id: 'body',
          shape: 'box',
          hw: PLAYER_HW,
          hh: PLAYER_HH,
          friction: 0.0,
          restitution: 0.0,
          membershipLayers: ['player'],
          filterLayers: ['world', 'box'],
        },
      ],
    },
  },
  create(api, x: number, y: number) {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Tag, { value: 'player' });
    api.addComponent(id, PlayerState, {
      grounded: false,
      facingLeft: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumpHeld: false,
      dead: false,
      levelComplete: false,
    });
    api.addComponent(id, UIComponent, { uiName: 'PlayerUI' });
    return id;
  },
});

/**
 * FootSensorPrefab — sensor kinematic sous les pieds de Mario.
 * Détecte le contact avec le sol sans affecter la physique.
 */
export const FootSensorPrefab = definePrefab({
  name: 'FootSensor',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      colliders: [
        {
          id: 'foot',
          shape: 'box',
          hw: PLAYER_HW - 2,
          hh: 4,
          isSensor: true,
          friction: 0,
          restitution: 0,
          membershipLayers: ['sensor'],
          filterLayers: ['world', 'box'],
        },
      ],
    },
  },
  create(api, x: number, y: number) {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Tag, { value: 'player-foot' });
    return id;
  },
});

/**
 * HeadSensorPrefab — sensor kinematic au-dessus de Mario.
 * Sert à détecter les impacts sous les mystery boxes.
 */
export const HeadSensorPrefab = definePrefab({
  name: 'HeadSensor',
  extensions: {
    physics: {
      bodyType: 'kinematic',
      colliders: [
        {
          id: 'head',
          shape: 'box',
          hw: PLAYER_HW - 4,
          hh: 3,
          isSensor: true,
          friction: 0,
          restitution: 0,
          membershipLayers: ['sensor'],
          filterLayers: ['box'],
        },
      ],
    },
  },
  create(api, x: number, y: number) {
    const id = api.createEntity();
    api.addComponent(id, Position, { x, y });
    api.addComponent(id, Tag, { value: 'player-head' });
    return id;
  },
});
