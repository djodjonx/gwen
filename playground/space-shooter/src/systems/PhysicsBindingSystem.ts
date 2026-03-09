import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { EngineAPI, EntityId } from '@djodjonx/gwen-engine-core';
import { unpackEntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import { Position, Collider, Tag } from '../components';

const PIXELS_PER_METER = 50;

export const PhysicsBindingSystem = defineSystem('PhysicsBindingSystem', () => {
  let physics: Physics2DAPI | null = null;
  const registeredBySlot = new Map<number, EntityId>();

  return {
    onInit(api) {
      physics = api.services.get('physics') as Physics2DAPI;
      registeredBySlot.clear();
    },

    onBeforeUpdate(api) {
      if (!physics) return;

      const entities = api.query([Position.name, Collider.name, Tag.name]);
      const currentSlots = new Set<number>();

      for (const id of entities) {
        const pos = api.getComponent(id, Position);
        const col = api.getComponent(id, Collider);
        if (!pos || !col) continue;

        const { index: idx } = unpackEntityId(id);
        currentSlots.add(idx);

        const wasRegistered = registeredBySlot.has(idx);

        if (!wasRegistered) {
          // New entity at this slot
          const handle = physics.addRigidBody(
            idx,
            'kinematic',
            pos.x / PIXELS_PER_METER,
            pos.y / PIXELS_PER_METER,
          );
          physics.addBallCollider(handle, col.radius / PIXELS_PER_METER, {
            restitution: 0,
            friction: 0,
          });
          registeredBySlot.set(idx, id);
        } else {
          const oldId = registeredBySlot.get(idx)!;
          if (oldId !== id) {
            // Slot was recycled — remove old entity and add new one
            physics.removeBody(idx);
            const handle = physics.addRigidBody(
              idx,
              'kinematic',
              pos.x / PIXELS_PER_METER,
              pos.y / PIXELS_PER_METER,
            );
            physics.addBallCollider(handle, col.radius / PIXELS_PER_METER, {
              restitution: 0,
              friction: 0,
            });
            registeredBySlot.set(idx, id);
          } else {
            // Same entity — update position
            physics.setKinematicPosition(idx, pos.x / PIXELS_PER_METER, pos.y / PIXELS_PER_METER);
          }
        }
      }

      // Clean up entities destroyed last frame
      for (const [slotIdx] of registeredBySlot.entries()) {
        if (!currentSlots.has(slotIdx)) {
          physics.removeBody(slotIdx);
          registeredBySlot.delete(slotIdx);
        }
      }
    },

    onDestroy() {
      registeredBySlot.clear();
      physics = null;
    },
  };
});
