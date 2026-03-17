import { UIComponent } from '@djodjonx/gwen-engine-core';
import { createPlayerPrefab } from '@djodjonx/gwen-kit-platformer';
import { PlayerTag } from '../components';

export const PlayerPrefab = createPlayerPrefab({
  name: 'Player',
  units: 'pixels',
  speed: 600,
  jumpVelocity: 750,
  jumpCoyoteMs: 130,
  jumpBufferWindowMs: 140,
  groundEnterFrames: 1,
  groundExitFrames: 4,
  postJumpLockMs: 55,
  colliders: {
    body: { w: 30, h: 30 },
    foot: { w: 26, h: 6 },
  },
  onCreated(api, entity) {
    api.addComponent(entity, PlayerTag, { value: 1 });
    api.addComponent(entity, UIComponent, { uiName: 'PlayerUI' });
  },
});
