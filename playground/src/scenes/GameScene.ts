/**
 * Scène de jeu — Space Shooter
 *
 * Systèmes intégrés :
 *   PlayerSystem   — déplacement par InputPlugin
 *   ShootSystem    — tirs joueur et ennemis
 *   MovementSystem — applique vélocité × deltaTime
 *   SpawnSystem    — génère des ennemis sur un timer
 *   CollisionSystem — détection cercle simple, dégâts
 *   CleanupSystem  — décharge les entités hors-écran
 *   RenderSystem   — Canvas2D direct (HUD + debug)
 */

import type { Scene, EngineAPI, SceneManager } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import type {
  Position, Velocity, Health, Tag, ShootTimer, Collider, ScoreData
} from '../components';
import { COMPONENTS } from '../components';

const W = 480;
const H = 640;

// ── Helpers ──────────────────────────────────────────────────────────────

const C = COMPONENTS;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// ── GameScene ─────────────────────────────────────────────────────────────

export class GameScene implements Scene {
  readonly name = 'Game';

  private keyboard!: KeyboardInput;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private scoreEntity = -1;
  private playerEntity = -1;
  private spawnTimer = 0;
  private spawnInterval = 2.5;
  private scenes: SceneManager;

  constructor(scenes: SceneManager) {
    this.scenes = scenes;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  onEnter(api: EngineAPI): void {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.spawnTimer = 0;
    this.spawnInterval = 2.5;

    // Resolve input (registered by InputPlugin in onInit)
    this.keyboard = api.services.get<KeyboardInput>('keyboard');

    // Score singleton
    this.scoreEntity = api.createEntity();
    api.addComponent<ScoreData>(this.scoreEntity, C.SCORE, { value: 0, lives: 3 });

    // Player
    this.playerEntity = api.createEntity();
    api.addComponent<Position>(this.playerEntity, C.POSITION, { x: W / 2, y: H - 80 });
    api.addComponent<Velocity>(this.playerEntity, C.VELOCITY, { vx: 0, vy: 0 });
    api.addComponent<Tag>(this.playerEntity, C.TAG, { type: 'player' });
    api.addComponent<ShootTimer>(this.playerEntity, C.SHOOT_TIMER, { elapsed: 0, cooldown: 0.25 });
    api.addComponent<Collider>(this.playerEntity, C.COLLIDER, { radius: 14 });

    this.updateHUD(api);
  }

  onUpdate(api: EngineAPI, dt: number): void {
    this.playerSystem(api, dt);
    this.playerShootSystem(api, dt);
    this.spawnSystem(api, dt);
    this.enemyShootSystem(api, dt);
    this.movementSystem(api, dt);
    this.collisionSystem(api);
    this.cleanupSystem(api);
    this.renderSystem(api);
    this.updateHUD(api);

    // Game over check
    const score = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE);
    if (score && score.lives <= 0) {
      this.scenes.loadScene('MainMenu');
    }
  }

  onExit(_api: EngineAPI): void {
    // Entity cleanup handled by SceneManager.purgeEntities()
  }

  // ── Systems ───────────────────────────────────────────────────────────

  private playerSystem(api: EngineAPI, dt: number): void {
    const pos = api.getComponent<Position>(this.playerEntity, C.POSITION);
    if (!pos) return;

    const speed = 250;
    let vx = 0;

    if (this.keyboard.isPressed('ArrowLeft') || this.keyboard.isPressed('KeyA')) vx = -speed;
    if (this.keyboard.isPressed('ArrowRight') || this.keyboard.isPressed('KeyD')) vx = speed;

    // Clamp to canvas
    const nx = Math.max(20, Math.min(W - 20, pos.x + vx * dt));
    api.addComponent<Position>(this.playerEntity, C.POSITION, { x: nx, y: pos.y });
  }

  private playerShootSystem(api: EngineAPI, dt: number): void {
    const timer = api.getComponent<ShootTimer>(this.playerEntity, C.SHOOT_TIMER);
    if (!timer) return;

    const elapsed = timer.elapsed + dt;
    api.addComponent<ShootTimer>(this.playerEntity, C.SHOOT_TIMER, { ...timer, elapsed });

    if (this.keyboard.isPressed('Space') && elapsed >= timer.cooldown) {
      const pos = api.getComponent<Position>(this.playerEntity, C.POSITION)!;
      this.spawnBullet(api, pos.x, pos.y - 20, 0, -600, 'bullet');
      api.addComponent<ShootTimer>(this.playerEntity, C.SHOOT_TIMER, { ...timer, elapsed: 0 });
    }
  }

  private spawnSystem(api: EngineAPI, dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.8, this.spawnInterval - 0.05);
      const x = 30 + Math.random() * (W - 60);
      this.spawnEnemy(api, x, -30);
    }
  }

  private enemyShootSystem(api: EngineAPI, dt: number): void {
    const enemies = api.query([C.TAG, C.POSITION, C.SHOOT_TIMER]);
    for (const id of enemies) {
      const tag = api.getComponent<Tag>(id, C.TAG);
      if (tag?.type !== 'enemy') continue;

      const timer = api.getComponent<ShootTimer>(id, C.SHOOT_TIMER)!;
      const elapsed = timer.elapsed + dt;

      if (elapsed >= timer.cooldown) {
        const pos = api.getComponent<Position>(id, C.POSITION)!;
        this.spawnBullet(api, pos.x, pos.y + 16, 0, 350, 'enemy-bullet');
        api.addComponent<ShootTimer>(id, C.SHOOT_TIMER, { ...timer, elapsed: 0 });
      } else {
        api.addComponent<ShootTimer>(id, C.SHOOT_TIMER, { ...timer, elapsed });
      }
    }
  }

  private movementSystem(api: EngineAPI, dt: number): void {
    const movables = api.query([C.POSITION, C.VELOCITY]);
    for (const id of movables) {
      const pos = api.getComponent<Position>(id, C.POSITION)!;
      const vel = api.getComponent<Velocity>(id, C.VELOCITY)!;
      api.addComponent<Position>(id, C.POSITION, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });
    }
  }

  private collisionSystem(api: EngineAPI): void {
    const bullets = api.query([C.TAG, C.POSITION, C.COLLIDER]);
    const enemies = api.query([C.TAG, C.POSITION, C.COLLIDER, C.HEALTH]);

    const score = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE);
    if (!score) return;

    for (const bulletId of bullets) {
      const bTag = api.getComponent<Tag>(bulletId, C.TAG);
      if (bTag?.type !== 'bullet') continue;

      const bPos = api.getComponent<Position>(bulletId, C.POSITION)!;
      const bCol = api.getComponent<Collider>(bulletId, C.COLLIDER)!;

      // Player bullet vs enemies
      for (const enemyId of enemies) {
        const eTag = api.getComponent<Tag>(enemyId, C.TAG);
        if (eTag?.type !== 'enemy') continue;

        const ePos = api.getComponent<Position>(enemyId, C.POSITION)!;
        const eCol = api.getComponent<Collider>(enemyId, C.COLLIDER)!;

        if (dist(bPos.x, bPos.y, ePos.x, ePos.y) < bCol.radius + eCol.radius) {
          api.destroyEntity(bulletId);
          api.destroyEntity(enemyId);
          api.addComponent<ScoreData>(this.scoreEntity, C.SCORE, {
            ...score, value: score.value + 100,
          });
          break;
        }
      }
    }

    // Enemy bullets vs player
    for (const bulletId of bullets) {
      const bTag = api.getComponent<Tag>(bulletId, C.TAG);
      if (bTag?.type !== 'enemy-bullet') continue;
      if (!api.entityExists(bulletId)) continue;

      const bPos = api.getComponent<Position>(bulletId, C.POSITION)!;
      const bCol = api.getComponent<Collider>(bulletId, C.COLLIDER)!;
      const pPos = api.getComponent<Position>(this.playerEntity, C.POSITION)!;
      const pCol = api.getComponent<Collider>(this.playerEntity, C.COLLIDER)!;

      if (dist(bPos.x, bPos.y, pPos.x, pPos.y) < bCol.radius + pCol.radius) {
        api.destroyEntity(bulletId);
        const current = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE)!;
        api.addComponent<ScoreData>(this.scoreEntity, C.SCORE, {
          ...current, lives: current.lives - 1,
        });
      }
    }
  }

  private cleanupSystem(api: EngineAPI): void {
    const entities = api.query([C.POSITION, C.TAG]);
    for (const id of entities) {
      const pos = api.getComponent<Position>(id, C.POSITION)!;
      // Destroy entities that have left the screen (with margin)
      if (pos.y < -60 || pos.y > H + 60 || pos.x < -60 || pos.x > W + 60) {
        api.destroyEntity(id);
      }
    }
  }

  private renderSystem(api: EngineAPI): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    // Draw stars (procedural, seed based on frame)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const t = Date.now() / 1000;
    for (let i = 0; i < 50; i++) {
      const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
      const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (20 + i % 20)) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // Draw entities with position
    const renderable = api.query([C.POSITION, C.TAG]);
    for (const id of renderable) {
      const pos = api.getComponent<Position>(id, C.POSITION)!;
      const tag = api.getComponent<Tag>(id, C.TAG)!;

      ctx.save();
      ctx.translate(pos.x, pos.y);

      switch (tag.type) {
        case 'player':
          // Ship triangle
          ctx.fillStyle = '#4fffb0';
          ctx.shadowColor = '#4fffb0';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(0, -18);
          ctx.lineTo(-14, 14);
          ctx.lineTo(0, 8);
          ctx.lineTo(14, 14);
          ctx.closePath();
          ctx.fill();
          break;

        case 'enemy':
          // Diamond shape
          ctx.fillStyle = '#ff6b6b';
          ctx.shadowColor = '#ff6b6b';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(12, 0);
          ctx.lineTo(0, 14);
          ctx.lineTo(-12, 0);
          ctx.closePath();
          ctx.fill();
          break;

        case 'bullet':
          ctx.fillStyle = '#ffe600';
          ctx.shadowColor = '#ffe600';
          ctx.shadowBlur = 8;
          ctx.fillRect(-2, -7, 4, 14);
          break;

        case 'enemy-bullet':
          ctx.fillStyle = '#ff4444';
          ctx.shadowColor = '#ff4444';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          break;
      }

      ctx.restore();
    }
  }

  // ── Spawn helpers ─────────────────────────────────────────────────────

  private spawnBullet(
    api: EngineAPI,
    x: number, y: number,
    vx: number, vy: number,
    type: 'bullet' | 'enemy-bullet',
  ): void {
    const id = api.createEntity();
    api.addComponent<Position>(id, C.POSITION, { x, y });
    api.addComponent<Velocity>(id, C.VELOCITY, { vx, vy });
    api.addComponent<Tag>(id, C.TAG, { type });
    api.addComponent<Collider>(id, C.COLLIDER, { radius: type === 'bullet' ? 4 : 5 });
  }

  private spawnEnemy(api: EngineAPI, x: number, y: number): void {
    const id = api.createEntity();
    api.addComponent<Position>(id, C.POSITION, { x, y });
    api.addComponent<Velocity>(id, C.VELOCITY, { vx: 0, vy: 80 });
    api.addComponent<Tag>(id, C.TAG, { type: 'enemy' });
    api.addComponent<Collider>(id, C.COLLIDER, { radius: 14 });
    api.addComponent<Health>(id, C.HEALTH, { current: 1, max: 1 });
    api.addComponent<ShootTimer>(id, C.SHOOT_TIMER, {
      elapsed: Math.random() * 2,
      cooldown: 2 + Math.random() * 2,
    });
  }

  // ── HUD ───────────────────────────────────────────────────────────────

  private updateHUD(api: EngineAPI): void {
    const score = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE);
    if (!score) return;
    const el = document.getElementById('score');
    const livesEl = document.getElementById('lives');
    if (el) el.textContent = `SCORE: ${score.value}`;
    if (livesEl) livesEl.textContent = '♥ '.repeat(Math.max(0, score.lives)).trim();
  }
}
