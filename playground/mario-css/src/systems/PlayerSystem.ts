import { defineSystem } from '@djodjonx/gwen-engine-core';
import type { EntityId } from '@djodjonx/gwen-engine-core';
import type { Physics2DAPI } from '@djodjonx/gwen-plugin-physics2d';
import type { KeyboardInput } from '@djodjonx/gwen-plugin-input';
import { PlayerState } from '../components/index.ts';
import { moveTowards } from '../utils.ts';

// ── Constantes de gameplay ────────────────────────────────────────────────────
const MAX_SPEED = 5.0; // m/s horizontal max
const ACCEL = 30.0; // m/s² accélération
const DECEL = 22.0; // m/s² freinage
const JUMP_IMPULSE = -11.0; // N·s (négatif = vers le haut, gravity Y+)
const JUMP_CUT_VY = -3.0; // vitesse Y coupée si relâchement saut
const FALL_BOOST = 0.0; // desactive pour eviter le tunneling a haute vitesse
const MAX_FALL_SPEED = 10.0; // m/s
const BUFFER_MS = 110;
const PIXELS_PER_METER = 50;
const FOOT_OFFSET_METERS = 21 / PIXELS_PER_METER; // sync avec FOOT_OFFSET_PX de MainScene
const OUT_OF_BOUNDS_PX = 3000;

export function createPlayerSystem() {
  let playerSlot = -1;
  let footSlot = -1;
  let playerEntityId: EntityId | null = null;
  let onRespawn: (() => void) | null = null;
  let onLevelComplete: (() => void) | null = null;
  let levelCompleteFired = false;
  let respawnCooldownMs = 0;

  const system = defineSystem('PlayerSystem', () => ({
    onBeforeUpdate(api, dtSec: number) {
      if (playerSlot < 0 || !playerEntityId) return;

      const dtMs = dtSec * 1000;
      if (respawnCooldownMs > 0) {
        respawnCooldownMs = Math.max(0, respawnCooldownMs - dtMs);
      }

      const physics = api.services.get('physics') as Physics2DAPI;
      const keyboard = api.services.get('keyboard') as KeyboardInput;

      const ps = api.getComponent(playerEntityId, PlayerState);
      if (!ps) return;

      // Fin de niveau — un seul appel
      if (ps.levelComplete && !levelCompleteFired) {
        levelCompleteFired = true;
        onLevelComplete?.();
        return;
      }

      // Mort — chute hors écran
      const pos = physics.getPosition(playerSlot);
      if (!pos) return;

      const pxY = pos.y * PIXELS_PER_METER;
      if (respawnCooldownMs <= 0 && pxY > OUT_OF_BOUNDS_PX && !ps.dead) {
        api.addComponent(playerEntityId, PlayerState, { ...ps, dead: true });
        respawnCooldownMs = 400;
        onRespawn?.();
        return;
      }

      const vel = physics.getLinearVelocity(playerSlot) ?? { x: 0, y: 0 };
      if (respawnCooldownMs <= 0 && (!Number.isFinite(vel.x) || !Number.isFinite(vel.y))) {
        respawnCooldownMs = 400;
        onRespawn?.();
        return;
      }

      const dt = dtMs;

      // ── Mouvement horizontal ─────────────────────────────────────────────
      const leftPressed = keyboard.isPressed('ArrowLeft') || keyboard.isPressed('KeyA');
      const rightPressed = keyboard.isPressed('ArrowRight') || keyboard.isPressed('KeyD');

      let targetVx = 0;
      if (rightPressed) targetVx = MAX_SPEED;
      if (leftPressed) targetVx = -MAX_SPEED;

      const newVx =
        targetVx !== 0
          ? moveTowards(vel.x, targetVx, ACCEL * dtSec)
          : moveTowards(vel.x, 0, DECEL * dtSec);

      // ── Coyote timer ─────────────────────────────────────────────────────
      let { coyoteTimer, jumpBufferTimer, jumpHeld, facingLeft, grounded } = ps;

      // Armer le coyote quand on vient de quitter le sol (grounded → false)
      // On détecte ça via : n'était pas déjà en coyote, n'est pas en saut, tombe
      if (!grounded && coyoteTimer === 0 && vel.y >= 0 && !jumpHeld) {
        // On ne peut armer que si on était au sol au frame précédent
        // Le CollisionSystem met grounded=false quand contact ended →
        // ici on arme immédiatement à COYOTE_MS
        // Note : ce chemin n'est pris qu'une fois grâce à la garde vel.y >= 0
      }
      // Décompter le timer si actif
      if (!grounded && coyoteTimer > 0) {
        coyoteTimer = Math.max(0, coyoteTimer - dt);
      }

      const canJump = grounded || coyoteTimer > 0;

      // ── Jump buffer ──────────────────────────────────────────────────────
      const spaceJustPressed =
        keyboard.isJustPressed('Space') ||
        keyboard.isJustPressed('ArrowUp') ||
        keyboard.isJustPressed('KeyW');
      const spacePressed =
        keyboard.isPressed('Space') || keyboard.isPressed('ArrowUp') || keyboard.isPressed('KeyW');
      const spaceJustReleased =
        keyboard.isJustReleased('Space') ||
        keyboard.isJustReleased('ArrowUp') ||
        keyboard.isJustReleased('KeyW');

      if (spaceJustPressed) jumpBufferTimer = BUFFER_MS;
      else if (jumpBufferTimer > 0) jumpBufferTimer = Math.max(0, jumpBufferTimer - dt);

      // ── Saut ─────────────────────────────────────────────────────────────
      if (jumpBufferTimer > 0 && canJump && !jumpHeld) {
        physics.applyImpulse(playerSlot, 0, JUMP_IMPULSE);
        jumpBufferTimer = 0;
        coyoteTimer = 0;
        grounded = false;
        jumpHeld = true;
        playJumpSound();
      }

      // Jump cut — relâchement = saut court
      let targetVy = vel.y;
      if (spaceJustReleased && vel.y < JUMP_CUT_VY) {
        targetVy = JUMP_CUT_VY;
      }
      if (!spacePressed) jumpHeld = false;

      // Fall boost — chute plus rapide
      if (!grounded && targetVy > 0.2 && FALL_BOOST > 0) {
        physics.applyImpulse(playerSlot, 0, FALL_BOOST * dtSec);
      }

      // Si le joueur est au sol, ne pas forcer une vitesse verticale descendante.
      if (grounded && targetVy > 0) {
        targetVy = 0;
      }

      // Application vitesse (X piloté, Y conservé avec garde anti-penetration)
      const clampedVy = Math.min(targetVy, MAX_FALL_SPEED);
      physics.setLinearVelocity(playerSlot, newVx, clampedVy);

      // Sync foot sensor
      if (footSlot >= 0) {
        physics.setKinematicPosition(footSlot, pos.x, pos.y + FOOT_OFFSET_METERS);
      }

      // Flip visuel
      if (newVx < -0.1) facingLeft = true;
      if (newVx > 0.1) facingLeft = false;

      // Persister l'état (PlayerUI lira grounded + facingLeft)
      api.addComponent(playerEntityId, PlayerState, {
        ...ps,
        grounded,
        facingLeft,
        coyoteTimer,
        jumpBufferTimer,
        jumpHeld,
      });
    },
  }));

  return {
    system,
    setup(opts: {
      playerSlot: number;
      footSlot: number;
      playerEntityId: EntityId;
      onRespawn: () => void;
      onLevelComplete: () => void;
    }) {
      playerSlot = opts.playerSlot;
      footSlot = opts.footSlot;
      playerEntityId = opts.playerEntityId;
      onRespawn = opts.onRespawn;
      onLevelComplete = opts.onLevelComplete;
      levelCompleteFired = false;
      respawnCooldownMs = 300;
    },
    reset() {
      playerSlot = -1;
      footSlot = -1;
      playerEntityId = null;
      onRespawn = null;
      onLevelComplete = null;
      levelCompleteFired = false;
      respawnCooldownMs = 0;
    },
  };
}

// ── Son de saut 8-bit ──────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function playJumpSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.12);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch (_) {
    /* silencieux */
  }
}
