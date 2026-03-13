import { defineSystem, unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI, CollisionContact } from '@djodjonx/gwen-plugin-physics2d';
import { Tag, PlayerState, BoxState } from '../components/index.ts';

/**
 * CollisionSystem — source de vérité des contacts.
 * Maintient le compteur de contacts sol du foot sensor,
 * et détecte le contact avec le flag (fin de niveau).
 *
 * Usage : créer via createCollisionSystem(), appeler
 * setSlots() depuis MainScene après le spawn du joueur.
 */
export function createCollisionSystem() {
  // Logs de debug des collisions (a activer ponctuellement seulement)
  const DEBUG_COLLISIONS = false;

  let footSensorSlot = -1;
  let playerSlot = -1;
  let playerEntityId: EntityId | null = null;

  // Compteur multi-contact pour éviter faux grounded=false
  let groundContactCount = 0;

  // Référence partagée vers dom des mystery boxes (slot → element)
  const boxElements = new Map<number, HTMLElement | null>();

  const system = defineSystem('CollisionSystem', () => ({
    onInit(api) {
      const physics = api.services.get('physics') as Physics2DAPI;

      api.hooks.hook('physics:collision', (contacts: ReadonlyArray<CollisionContact>) => {
        for (const contact of contacts) {
          const { slotA, slotB, started } = contact;

          if (DEBUG_COLLISIONS) {
            const touchesPlayer = slotA === playerSlot || slotB === playerSlot;
            const touchesFoot = slotA === footSensorSlot || slotB === footSensorSlot;
            if (touchesPlayer || touchesFoot) {
              const sideA =
                slotA === playerSlot
                  ? 'player'
                  : slotA === footSensorSlot
                    ? 'foot'
                    : `slot:${slotA}`;
              const sideB =
                slotB === playerSlot
                  ? 'player'
                  : slotB === footSensorSlot
                    ? 'foot'
                    : `slot:${slotB}`;
              console.log(
                `[MarioDebug][collision] ${started ? 'START' : 'END'} ${sideA} <-> ${sideB} (A=${slotA}, B=${slotB}) groundedCount=${groundContactCount}`,
              );
            }
          }

          // ── Détection sol via foot sensor ──────────────────────────────
          const isFootA = slotA === footSensorSlot;
          const isFootB = slotB === footSensorSlot;

          if (isFootA || isFootB) {
            const otherSlot = isFootA ? slotB : slotA;

            // Ne jamais compter le contact du capteur avec le joueur lui-même.
            if (otherSlot === playerSlot) {
              if (DEBUG_COLLISIONS) {
                console.log('[MarioDebug][ground] ignore foot<->player self-contact');
              }
              continue;
            }

            if (started) groundContactCount++;
            else groundContactCount = Math.max(0, groundContactCount - 1);

            if (DEBUG_COLLISIONS) {
              console.log(`[MarioDebug][ground] count=${groundContactCount} started=${started}`);
            }

            if (playerEntityId) {
              const ps = api.getComponent(playerEntityId, PlayerState);
              if (ps) {
                const nowGrounded = groundContactCount > 0;
                // Armer le coyote quand on quitte le sol (grounded true → false)
                const armCoyote = ps.grounded && !nowGrounded && !ps.jumpHeld;
                api.addComponent(playerEntityId, PlayerState, {
                  ...ps,
                  grounded: nowGrounded,
                  coyoteTimer: armCoyote ? 110 : nowGrounded ? 0 : ps.coyoteTimer,
                });
              }
            }
          }

          // ── Flag — fin de niveau ────────────────────────────────────────
          const isPlayerA = slotA === playerSlot;
          const isPlayerB = slotB === playerSlot;

          if (started && (isPlayerA || isPlayerB)) {
            const otherSlot = isPlayerA ? slotB : slotA;

            // On passe par getComponent sur l'entité via query Tag='flag'
            const flagEntities = api.query([Tag]);
            for (const fid of flagEntities) {
              const tag = api.getComponent(fid, Tag);
              if (tag?.value !== 'flag') continue;
              const { index: flagSlot } = unpackEntityId(fid);
              if (flagSlot !== otherSlot) continue;

              // C'est le flag !
              if (playerEntityId) {
                const ps = api.getComponent(playerEntityId, PlayerState);
                if (ps && !ps.levelComplete) {
                  api.addComponent(playerEntityId, PlayerState, { ...ps, levelComplete: true });
                }
              }
              break;
            }

            // ── Mystery box head-bump ─────────────────────────────────────
            // Détecté si le joueur entre en contact avec une box
            // ET la vélocité Y du joueur est négative (il monte)
            if (playerEntityId) {
              const ps = api.getComponent(playerEntityId, PlayerState);
              if (ps && !ps.grounded) {
                const vel = physics.getLinearVelocity(playerSlot);
                if (vel && vel.y < -0.5) {
                  // Joueur monte → vérifier si l'autre entité est une box
                  const boxEntities = api.query([Tag, BoxState]);
                  for (const bid of boxEntities) {
                    const btag = api.getComponent(bid, Tag);
                    if (btag?.value !== 'box') continue;
                    const { index: bSlot } = unpackEntityId(bid);
                    if (bSlot !== otherSlot) continue;

                    const bs = api.getComponent(bid, BoxState);
                    if (bs && !bs.hit) {
                      api.addComponent(bid, BoxState, { hit: true });
                      // Animer l'élément DOM de la box
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
    setSlots(fSlot: number, pSlot: number, pEntityId: EntityId) {
      footSensorSlot = fSlot;
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
      playerSlot = -1;
      playerEntityId = null;
    },
  };
}
