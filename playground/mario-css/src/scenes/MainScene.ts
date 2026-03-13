import { defineScene, UIComponent } from '@djodjonx/gwen-engine-core';
import { unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import type { HtmlUI } from '@djodjonx/gwen-plugin-html-ui';
import {
  PlayerPrefab,
  FootSensorPrefab,
  HeadSensorPrefab,
  PLAYER_HH,
} from '../prefabs/PlayerPrefab.ts';
import {
  createFloorPrefab,
  createPipePrefab,
  BoxPrefab,
  FlagPrefab,
} from '../prefabs/TilePrefabs.ts';
import { LEVEL_1, GROUND_Y } from '../level/levelMap.ts';
import { PlayerState } from '../components/index.ts';
import { createPlayerSystem } from '../systems/PlayerSystem.ts';
import { createCameraSystem } from '../systems/CameraSystem.ts';
import { createCollisionSystem } from '../systems/CollisionSystem.ts';
import { PlayerUI } from '../ui/PlayerUI.ts';
import { HudUI } from '../ui/HudUI.ts';
import { FloorUI, PipeUI, BoxUI, FlagUI } from '../ui/TilesUI.ts';
import '../style.css';

const SPAWN_X = 80;
const SPAWN_Y = GROUND_Y - PLAYER_HH - 4;
const FOOT_OFFSET_PX = PLAYER_HH + 6; // > PLAYER_HH + sensor_hh pour eviter l'overlap avec le joueur
const HEAD_OFFSET_PX = PLAYER_HH + 6;

export const MainScene = defineScene('MainScene', () => {
  let viewport: HTMLDivElement | null = null;
  let world: HTMLDivElement | null = null;
  let parallaxClouds: HTMLDivElement | null = null;

  let playerEntity: EntityId | null = null;
  let footEntity: EntityId | null = null;
  let headEntity: EntityId | null = null;
  let hudEntityId: EntityId | null = null;
  let hudUI: HtmlUI | null = null;

  const playerSys = createPlayerSystem();
  const cameraSys = createCameraSystem();
  const collisionSys = createCollisionSystem();

  // Cache des prefabs de tuiles pour éviter register() en boucle avec même nom
  const floorPrefabBySize = new Map<string, string>();
  const pipePrefabBySize = new Map<string, string>();

  function buildDOM() {
    viewport = document.createElement('div');
    viewport.id = 'game-viewport';
    document.body.appendChild(viewport);

    const sky = document.createElement('div');
    sky.id = 'parallax-sky';
    viewport.appendChild(sky);

    parallaxClouds = document.createElement('div');
    parallaxClouds.id = 'parallax-clouds';
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('div');
      c.className = 'cloud';
      c.style.left = `${100 + i * 620}px`;
      c.style.top = `${30 + (i % 3) * 45}px`;
      parallaxClouds.appendChild(c);
    }
    viewport.appendChild(parallaxClouds);

    world = document.createElement('div');
    world.id = 'game-world';
    viewport.appendChild(world);
  }

  function spawnPlayer(api: any) {
    playerEntity = api.prefabs.instantiate('Player', SPAWN_X, SPAWN_Y);
    const { index: pSlot } = unpackEntityId(playerEntity!);

    footEntity = api.prefabs.instantiate('FootSensor', SPAWN_X, SPAWN_Y + FOOT_OFFSET_PX);
    const { index: fSlot } = unpackEntityId(footEntity!);

    headEntity = api.prefabs.instantiate('HeadSensor', SPAWN_X, SPAWN_Y - HEAD_OFFSET_PX);
    const { index: hSlot } = unpackEntityId(headEntity!);

    collisionSys.setSlots(fSlot, hSlot, pSlot, playerEntity!);
    playerSys.setup({
      playerSlot: pSlot,
      footSlot: fSlot,
      headSlot: hSlot,
      playerEntityId: playerEntity!,
      onRespawn: () => respawnPlayer(api),
      onLevelComplete: () => showLevelComplete(),
    });
    cameraSys.setup({
      playerSlot: pSlot,
      worldEl: world!,
      parallaxClouds: parallaxClouds ?? undefined,
    });
  }

  function respawnPlayer(api: any) {
    if (!playerEntity || !footEntity || !headEntity) return;

    // Evite destroy/recreate (qui déclenche des hooks async et peut inverser
    // dynamic/kinematic sur des slots réutilisés en boucle).
    const physics = api.services.get('physics') as Physics2DAPI;
    const { index: pSlot } = unpackEntityId(playerEntity);
    const { index: fSlot } = unpackEntityId(footEntity);
    const { index: hSlot } = unpackEntityId(headEntity);

    physics.removeBody(pSlot);
    physics.removeBody(fSlot);
    physics.removeBody(hSlot);

    const playerHandle = physics.addRigidBody(pSlot, 'dynamic', SPAWN_X / 50, SPAWN_Y / 50, {
      ccdEnabled: true,
      linearDamping: 0.0,
      angularDamping: 999.0,
      gravityScale: 1.0,
    });
    physics.addBoxCollider(playerHandle, 12 / 50, 15 / 50, {
      friction: 0.0,
      restitution: 0.0,
    });

    const footHandle = physics.addRigidBody(
      fSlot,
      'kinematic',
      SPAWN_X / 50,
      (SPAWN_Y + FOOT_OFFSET_PX) / 50,
    );
    physics.addBoxCollider(footHandle, 10 / 50, 4 / 50, {
      friction: 0,
      restitution: 0,
      isSensor: true,
    });

    const headHandle = physics.addRigidBody(
      hSlot,
      'kinematic',
      SPAWN_X / 50,
      (SPAWN_Y - HEAD_OFFSET_PX) / 50,
    );
    physics.addBoxCollider(headHandle, 8 / 50, 3 / 50, {
      friction: 0,
      restitution: 0,
      isSensor: true,
    });

    // Reset explicite de l'etat gameplay du joueur apres respawn
    api.addComponent(playerEntity, PlayerState, {
      grounded: false,
      facingLeft: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      jumpHeld: false,
      dead: false,
      levelComplete: false,
    });

    collisionSys.reset();
    collisionSys.setSlots(fSlot, hSlot, pSlot, playerEntity!);
    cameraSys.setup({
      playerSlot: pSlot,
      worldEl: world!,
      parallaxClouds: parallaxClouds ?? undefined,
    });
    playerSys.reset();
    playerSys.setup({
      playerSlot: pSlot,
      footSlot: fSlot,
      headSlot: hSlot,
      playerEntityId: playerEntity!,
      onRespawn: () => respawnPlayer(api),
      onLevelComplete: () => showLevelComplete(),
    });
  }

  function showLevelComplete() {
    if (hudUI && hudEntityId) {
      hudUI.text(hudEntityId, 'hud-status', '🎉 LEVEL CLEAR!');
    }
  }

  return {
    ui: [PlayerUI, HudUI, FloorUI, PipeUI, BoxUI, FlagUI],
    systems: [collisionSys.system, playerSys.system, cameraSys.system],

    onEnter(api) {
      hudUI = api.services.get('htmlUI') as HtmlUI;
      buildDOM();

      hudEntityId = api.createEntity() as EntityId;
      api.addComponent(hudEntityId, UIComponent, { uiName: 'HudUI' });

      api.prefabs.register(PlayerPrefab);
      api.prefabs.register(FootSensorPrefab);
      api.prefabs.register(HeadSensorPrefab);
      api.prefabs.register(BoxPrefab);
      api.prefabs.register(FlagPrefab);

      for (const tile of LEVEL_1) {
        if (tile.type === 'floor') {
          const hw = tile.w / 2;
          const hh = tile.h / 2;
          const key = `${hw}x${hh}`;
          let prefabName = floorPrefabBySize.get(key);
          if (!prefabName) {
            prefabName = `Floor_${hw}_${hh}`;
            const floorPrefab = createFloorPrefab(hw, hh, 'FloorUI', 'floor', prefabName);
            api.prefabs.register(floorPrefab);
            floorPrefabBySize.set(key, prefabName);
          }
          api.prefabs.instantiate(prefabName, tile.x + hw, tile.y + hh);
        } else if (tile.type === 'pipe') {
          const hw = tile.w / 2;
          const hh = tile.h / 2;
          const key = `${hw}x${hh}`;
          let prefabName = pipePrefabBySize.get(key);
          if (!prefabName) {
            prefabName = `Pipe_${hw}_${hh}`;
            const pipePrefab = createPipePrefab(hw, hh, 'PipeUI', 'pipe', prefabName);
            api.prefabs.register(pipePrefab);
            pipePrefabBySize.set(key, prefabName);
          }
          api.prefabs.instantiate(prefabName, tile.x + hw, tile.y + hh);
        } else if (tile.type === 'box') {
          const id = api.prefabs.instantiate('Box', tile.x, tile.y);
          const { index: slot } = unpackEntityId(id);
          collisionSys.registerBoxElement(slot, null);
        } else if (tile.type === 'flag') {
          api.prefabs.instantiate('Flag', tile.x, tile.y, tile.w, tile.h);
        }
      }

      spawnPlayer(api);
    },

    onExit() {
      viewport?.remove();
      viewport = null;
      world = null;
      parallaxClouds = null;
      playerEntity = null;
      footEntity = null;
      headEntity = null;
      hudEntityId = null;
      hudUI = null;
      floorPrefabBySize.clear();
      pipePrefabBySize.clear();
      playerSys.reset();
      cameraSys.reset();
      collisionSys.reset();
    },
  };
});
