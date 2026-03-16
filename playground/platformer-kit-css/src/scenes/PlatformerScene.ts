import { UIComponent, unpackEntityId, defineComponent, Types } from '@djodjonx/gwen-engine-core';
import { createPlatformerScene, createPlayerPrefab, Position } from '@djodjonx/gwen-kit-platformer';
import { PlayerUI, BlockUI, HudUI, blockSizes } from '../ui/GameUI.ts';
import '../style.css';

const PPM = 50;

/**
 * Advanced Example:
 * Custom position component that extends the standard one with additional fields
 * (e.g., for custom interpolation or tracking).
 */
const AdvancedPosition = defineComponent({
  name: 'position', // Must keep 'position' for Physics2D compatibility
  schema: {
    x: Types.f32,
    y: Types.f32,
    lastX: Types.f32,
    lastY: Types.f32,
  },
});

/**
 * Platformer Kit CSS Playground
 *
 * Demonstrates:
 * 1. Automatic physical colliders (body + feet)
 * 2. Advanced Mode: Overriding kit components with custom schemas
 * 3. CSS rendering synchronized with authoritative physics
 */

// 1. Define the scene
export const PlatformerScene = createPlatformerScene({
  name: 'PlatformerScene',
  gravity: 35,

  // Register UI components for this scene
  ui: [PlayerUI, BlockUI, HudUI],

  async onEnter(api) {
    // Setup DOM containers
    const viewport = document.createElement('div');
    viewport.id = 'game-viewport';
    const world = document.createElement('div');
    world.id = 'game-world';
    viewport.appendChild(world);
    document.body.appendChild(viewport);

    // Register Prefabs
    api.prefabs.register(PlayerPrefab);

    // --- Create Level ---

    // Solid ground
    for (let i = 0; i < 20; i++) {
      createBlock(api, i * 64 + 32, 550, 64, 64);
    }

    // Floating platforms
    createBlock(api, 300, 420, 128, 32);
    createBlock(api, 550, 320, 128, 32);
    createBlock(api, 800, 220, 128, 32);

    // Spawn Player
    api.prefabs.instantiate('Player', 100, 450);

    // Spawn HUD
    const hud = api.createEntity();
    api.addComponent(hud, UIComponent, { uiName: 'HudUI' });
  },

  onExit() {
    document.getElementById('game-viewport')?.remove();
    blockSizes.clear();
  },
});

// 2. Create the player prefab
const PlayerPrefab = createPlayerPrefab({
  name: 'Player',
  speed: 400,
  jumpForce: 750,

  // Advanced Mode: Inject our custom position component
  // The kit will now use AdvancedPosition instead of the default Position.
  components: {
    position: AdvancedPosition,
  },

  colliders: {
    body: { w: 28, h: 28 },
    foot: { w: 24, h: 6, offset: 16 },
  },
  onCreated(api, entity) {
    api.addComponent(entity, UIComponent, { uiName: 'PlayerUI' });
  },
});

/**
 * Helper to create a static block with physics and UI
 */
function createBlock(api: any, x: number, y: number, w: number, h: number) {
  const block = api.createEntity();

  blockSizes.set(block as bigint, { w, h });
  api.addComponent(block, UIComponent, { uiName: 'BlockUI' });

  const physics = api.services.get('physics');
  const { index: slot } = unpackEntityId(block);

  const body = physics.addRigidBody(slot, 'static', x / PPM, y / PPM);
  physics.addBoxCollider(body, w / 2 / PPM, h / 2 / PPM, {
    friction: 0.5,
    restitution: 0.1,
  });

  return block;
}
