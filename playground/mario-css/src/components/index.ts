import { defineComponent, Types } from '@gwenengine/core';

// ── Position (lue par le hook physics:instantiate via string 'position') ──────
export const Position = defineComponent({
  name: 'position',
  schema: { x: Types.f32, y: Types.f32 },
});

// ── Tag ───────────────────────────────────────────────────────────────────────
export const Tag = defineComponent({
  name: 'Tag',
  schema: { value: Types.string },
});

// ── PlayerState ───────────────────────────────────────────────────────────────
export const PlayerState = defineComponent({
  name: 'PlayerState',
  schema: {
    grounded: Types.bool,
    facingLeft: Types.bool,
    coyoteTimer: Types.f32,
    jumpBufferTimer: Types.f32,
    jumpHeld: Types.bool,
    dead: Types.bool,
    levelComplete: Types.bool,
  },
});

// ── BoxState ──────────────────────────────────────────────────────────────────
export const BoxState = defineComponent({
  name: 'BoxState',
  schema: { hit: Types.bool },
});

// ── TileSize (hw/hh en pixels — pour que les UIs CSS connaissent la taille) ──
export const TileSize = defineComponent({
  name: 'TileSize',
  schema: { hw: Types.f32, hh: Types.f32 },
});
