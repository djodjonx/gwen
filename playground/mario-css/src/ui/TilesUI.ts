import { defineUI, unpackEntityId } from '@gwenjs/core';
import type { EntityId } from '@gwenjs/core';
import { TileSize } from '../components/index.ts';
import type { Physics2DAPI } from '@gwenjs/physics2d';

const PPM = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mountTile(
  entityId: EntityId,
  className: string,
  els: Map<EntityId, HTMLElement>,
  extra?: (el: HTMLElement) => void,
) {
  const world = document.getElementById('game-world');
  if (!world) return;
  const el = document.createElement('div');
  el.className = className;
  extra?.(el);
  world.appendChild(el);
  els.set(entityId, el);
}

function positionTile(api: any, entityId: EntityId, el: HTMLElement) {
  const physics = api.services.get('physics') as Physics2DAPI;
  const ts = api.getComponent(entityId, TileSize);
  if (!ts) return;

  const { index: slot } = unpackEntityId(entityId);
  const pos = physics.getPosition(slot);
  if (!pos) return;

  const pxX = pos.x * PPM;
  const pxY = pos.y * PPM;
  const w = ts.hw * 2;
  const h = ts.hh * 2;

  // Centre → coin supérieur gauche
  el.style.left = `${pxX - ts.hw}px`;
  el.style.top = `${pxY - ts.hh}px`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

export const FloorUI = defineUI('FloorUI', () => {
  const els = new Map<EntityId, HTMLElement>();
  return {
    onMount(_api, entityId) {
      mountTile(entityId as EntityId, 'mario-floor', els);
    },
    render(api, entityId) {
      const el = els.get(entityId as EntityId);
      if (el) positionTile(api, entityId as EntityId, el);
    },
    onUnmount(_api, entityId) {
      els.get(entityId as EntityId)?.remove();
      els.delete(entityId as EntityId);
    },
  };
});

export const PipeUI = defineUI('PipeUI', () => {
  const els = new Map<EntityId, HTMLElement>();
  return {
    onMount(_api, entityId) {
      mountTile(entityId as EntityId, 'mario-pipe', els, (el) => {
        const cap = document.createElement('div');
        cap.className = 'mario-pipe__cap';
        el.appendChild(cap);
      });
    },
    render(api, entityId) {
      const el = els.get(entityId as EntityId);
      if (el) positionTile(api, entityId as EntityId, el);
    },
    onUnmount(_api, entityId) {
      els.get(entityId as EntityId)?.remove();
      els.delete(entityId as EntityId);
    },
  };
});

export const BoxUI = defineUI('BoxUI', () => {
  const els = new Map<EntityId, HTMLElement>();
  return {
    onMount(_api, entityId) {
      mountTile(entityId as EntityId, 'mario-box', els, (el) => {
        el.innerHTML = '<span class="mario-box__q">?</span>';
      });
    },
    render(api, entityId) {
      const el = els.get(entityId as EntityId);
      if (el) positionTile(api, entityId as EntityId, el);
    },
    onUnmount(_api, entityId) {
      els.get(entityId as EntityId)?.remove();
      els.delete(entityId as EntityId);
    },
  };
});

export const FlagUI = defineUI('FlagUI', () => {
  const els = new Map<EntityId, HTMLElement>();
  return {
    onMount(_api, entityId) {
      mountTile(entityId as EntityId, 'mario-flag', els);
    },
    render(api, entityId) {
      const el = els.get(entityId as EntityId);
      if (el) positionTile(api, entityId as EntityId, el);
    },
    onUnmount(_api, entityId) {
      els.get(entityId as EntityId)?.remove();
      els.delete(entityId as EntityId);
    },
  };
});
