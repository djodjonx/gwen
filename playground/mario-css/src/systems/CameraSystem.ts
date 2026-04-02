import { defineSystem } from '@gwenjs/core';
import type { Physics2DAPI } from '@gwenjs/physics2d';
import { clamp } from '../utils.ts';
import { LEVEL_WIDTH, VIEWPORT_W } from '../level/levelMap.ts';

const PIXELS_PER_METER = 50;
const CAMERA_LEAD = 280; // px à gauche du centre

export function createCameraSystem() {
  let playerSlot = -1;
  let worldEl: HTMLElement | null = null;
  let parallaxClouds: HTMLElement | null = null;
  let cameraX = 0;

  const system = defineSystem('CameraSystem', () => ({
    onUpdate(api, _dt: number) {
      if (playerSlot < 0 || !worldEl) return;

      const physics = api.services.get('physics') as Physics2DAPI;
      const pos = physics.getPosition(playerSlot);
      if (!pos) return;

      const pxX = pos.x * PIXELS_PER_METER;

      // Calcul caméra avec lead et clamp bounds
      const targetX = pxX - CAMERA_LEAD;
      cameraX = clamp(targetX, 0, LEVEL_WIDTH - VIEWPORT_W);

      worldEl.style.transform = `translateX(${-cameraX}px)`;

      // Parallax couche nuages (30% de la vitesse caméra)
      if (parallaxClouds) {
        parallaxClouds.style.transform = `translateX(${-cameraX * 0.3}px)`;
      }
    },
  }));

  return {
    system,
    setup(opts: { playerSlot: number; worldEl: HTMLElement; parallaxClouds?: HTMLElement }) {
      playerSlot = opts.playerSlot;
      worldEl = opts.worldEl;
      parallaxClouds = opts.parallaxClouds ?? null;
      cameraX = 0;
    },
    reset() {
      playerSlot = -1;
      worldEl = null;
      parallaxClouds = null;
      cameraX = 0;
    },
  };
}
