import { defineSystem, unpackEntityId } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';
import type { CollisionContact } from '@gwenjs/physics2d';
import { Tag, PlayerState, BoxState } from '../components/index.ts';

/**
 * CollisionSystem — source de vérité des contacts.
 * - grounded via foot sensor
 * - box bump via head sensor
 * - level complete via player <-> flag
 */
export function createCollisionSystem() {
  const DEBUG_COLLISIONS = false;

  let footSensorSlot = -1;
  let headSensorSlot = -1;
  let playerSlot = -1;
  let playerEntityId: EntityId | null = null;

  let groundContactCount = 0;
  const boxElements = new Map<number, HTMLElement | null>();

  const system = defineSystem('CollisionSystem', () => ({
    onInit(api) {
      api.hooks.hook('physics:collision', (contacts: ReadonlyArray<CollisionContact>) => {
        for (const contact of contacts) {
          const { slotA, slotB, started } = contact;

          if (DEBUG_COLLISIONS) {
            const touchesPlayer = slotA === playerSlot || slotB === playerSlot;
            const touchesFoot = slotA === footSensorSlot || slotB === footSensorSlot;
            const touchesHead = slotA === headSensorSlot || slotB === headSensorSlot;
            if (touchesPlayer || touchesFoot || touchesHead) {
              const side = (slot: number) => {
                if (slot === playerSlot) return 'player';
                if (slot === footSensorSlot) return 'foot';
                if (slot === headSensorSlot) return 'head';
                return `slot:${slot}`;
              };
              console.log(
                `[MarioDebug][collision] ${started ? 'START' : 'END'} ${side(slotA)} <-> ${side(slotB)} (A=${slotA}, B=${slotB}) groundedCount=${groundContactCount}`,
              );
            }
          }

          // Grounded via foot sensor.
          const isFootA = slotA === footSensorSlot;
          const isFootB = slotB === footSensorSlot;
          if (isFootA || isFootB) {
            const otherSlot = isFootA ? slotB : slotA;
            if (otherSlot === playerSlot) continue;

            if (started) groundContactCount++;
            else groundContactCount = Math.max(0, groundContactCount - 1);

            if (playerEntityId) {
              const ps = api.getComponent(playerEntityId, PlayerState);
              if (ps) {
                const nowGrounded = groundContactCount > 0;
                const armCoyote = ps.grounded && !nowGrounded && !ps.jumpHeld;
                api.addComponent(playerEntityId, PlayerState, {
                  ...ps,
                  grounded: nowGrounded,
                  coyoteTimer: armCoyote ? 110 : nowGrounded ? 0 : ps.coyoteTimer,
                });
              }
            }
          }

          // Head bump via head sensor.
          const isHeadA = slotA === headSensorSlot;
          const isHeadB = slotB === headSensorSlot;
          if (started && (isHeadA || isHeadB) && playerEntityId) {
            const otherSlot = isHeadA ? slotB : slotA;
            const ps = api.getComponent(playerEntityId, PlayerState);
            if (ps && !ps.grounded) {
              const boxEntities = api.query([Tag, BoxState]);
              for (const bid of boxEntities) {
                const btag = api.getComponent(bid, Tag);
                if (btag?.value !== 'box') continue;
                const { index: bSlot } = unpackEntityId(bid);
                if (bSlot !== otherSlot) continue;

                const bs = api.getComponent(bid, BoxState);
                if (bs && !bs.hit) {
                  api.addComponent(bid, BoxState, { hit: true });
                  const el = boxElements.get(bSlot);
                  if (el) {
                    el.classList.add('mario-box--hit');
                    setTimeout(() => el.classList.remove('mario-box--hit'), 300);
                  }
                }
                break;
              }
            }
          }

          // Level complete via player <-> flag.
          const isPlayerA = slotA === playerSlot;
          const isPlayerB = slotB === playerSlot;
          if (started && (isPlayerA || isPlayerB)) {
            const otherSlot = isPlayerA ? slotB : slotA;
            const flagEntities = api.query([Tag]);
            for (const fid of flagEntities) {
              const tag = api.getComponent(fid, Tag);
              if (tag?.value !== 'flag') continue;
              const { index: flagSlot } = unpackEntityId(fid);
              if (flagSlot !== otherSlot) continue;

              if (playerEntityId) {
                const ps = api.getComponent(playerEntityId, PlayerState);
                if (ps && !ps.levelComplete) {
                  api.addComponent(playerEntityId, PlayerState, { ...ps, levelComplete: true });
                }
              }
              break;
            }
          }
        }
      });
    },

    onDestroy() {
      groundContactCount = 0;
      boxElements.clear();
    },
  }));

  return {
    system,
    setSlots(fSlot: number, hSlot: number, pSlot: number, pEntityId: EntityId) {
      footSensorSlot = fSlot;
      headSensorSlot = hSlot;
      playerSlot = pSlot;
      playerEntityId = pEntityId;
      groundContactCount = 0;
    },
    registerBoxElement(slot: number, el: HTMLElement | null) {
      boxElements.set(slot, el);
    },
    reset() {
      groundContactCount = 0;
      footSensorSlot = -1;
      headSensorSlot = -1;
      playerSlot = -1;
      playerEntityId = null;
    },
  };
}
