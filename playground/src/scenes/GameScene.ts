/**
 * Scène de jeu — Space Shooter
 * Remaniée avec les DSLs GWEN (defineComponent, defineUI, definePrefab)
 * Démontre l'utilisation de TsPlugins locaux montés par une Scène.
 */

import { Scene, EngineAPI, SceneManager, defineUI, UIComponent, definePrefab, TsPlugin } from '@gwen/engine-core';
import type { KeyboardInput } from '@gwen/plugin-input';
import { COMPONENTS as C, Position, Velocity, Health, Tag, ShootTimer, Collider, ScoreData } from '../components';

const W = 480;
const H = 640;

// ── DSL: UI ─────────────────────────────────────────────────────────────

const HUD = defineUI({
  name: 'SpaceShooterHUD',
  css: `
    #hud { position: absolute; top: 20px; left: 20px; color: white; font-family: monospace; font-size: 18px; text-shadow: 2px 2px 0 #000; }
    #score-val { color: #ffe600; }
    #lives-val { color: #ff6b6b; }
  `,
  html: `
    <div id="hud">
      SCORE: <span id="score-val">0</span><br>
      LIVES: <span id="lives-val">♥♥♥</span>
    </div>
  `,
  onUpdate: (dom, entityId, api) => {
    const score = api.getComponent<ScoreData>(entityId, C.SCORE);
    if (!score) return;
    dom.elements['score-val'].textContent = String(score.value);
    dom.elements['lives-val'].textContent = '♥'.repeat(Math.max(0, score.lives));
  }
});

// ── DSL: Prefabs ────────────────────────────────────────────────────────

const PlayerPrefab = definePrefab({
  name: 'Player',
  create: (api) => {
    const id = api.createEntity();
    api.addComponent<Position>(id, C.POSITION, { x: W / 2, y: H - 80 });
    api.addComponent<Velocity>(id, C.VELOCITY, { vx: 0, vy: 0 });
    api.addComponent<Tag>(id, C.TAG, { type: 'player' });
    api.addComponent<ShootTimer>(id, C.SHOOT_TIMER, { elapsed: 0, cooldown: 0.25 });
    api.addComponent<Collider>(id, C.COLLIDER, { radius: 14 });
    return id;
  }
});

const EnemyPrefab = definePrefab({
  name: 'Enemy',
  create: (api, x: number, y: number) => {
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
    return id;
  }
});

const BulletPrefab = definePrefab({
  name: 'Bullet',
  create: (api, x: number, y: number, vx: number, vy: number, type: 'bullet' | 'enemy-bullet') => {
    const id = api.createEntity();
    api.addComponent<Position>(id, C.POSITION, { x, y });
    api.addComponent<Velocity>(id, C.VELOCITY, { vx, vy });
    api.addComponent<Tag>(id, C.TAG, { type });
    api.addComponent<Collider>(id, C.COLLIDER, { radius: type === 'bullet' ? 4 : 5 });
    return id;
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// ── Plugin Local de Jeu ─────────────────────────────────────────────────

class SpaceShooterPlugin implements TsPlugin {
  readonly name = 'SpaceShooterPlugin';

  private keyboard!: KeyboardInput;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private scoreEntity = -1;
  private spawnTimer = 0;
  private spawnInterval = 2.5;

  constructor(private scenes: SceneManager) { }

  onInit(api: EngineAPI): void {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.spawnTimer = 0;
    this.spawnInterval = 2.5;
    this.keyboard = api.services.get<KeyboardInput>('keyboard');

    // Register Prefabs
    api.prefabs.register(PlayerPrefab)
      .register(EnemyPrefab)
      .register(BulletPrefab);

    // Register UI (UIManager assumes it's registered on Engine already)
    const uiManager = api.services.get<any>('PluginManager').get('UIManager');
    if (uiManager) uiManager.register(HUD);

    // Score & HUD Singleton
    this.scoreEntity = api.createEntity();
    api.addComponent<ScoreData>(this.scoreEntity, C.SCORE, { value: 0, lives: 3 });
    api.addComponent(this.scoreEntity, UIComponent, { uiName: HUD.name });

    // Spawn Player
    api.prefabs.instantiate('Player');
  }

  onUpdate(api: EngineAPI, dt: number): void {
    const playerEntity = api.query([C.TAG.name]).find(id => api.getComponent<Tag>(id, C.TAG)?.type === 'player');

    if (playerEntity !== undefined) {
      this.playerSystem(api, playerEntity, dt);
      this.playerShootSystem(api, playerEntity, dt);
    }

    this.spawnSystem(api, dt);
    this.enemyShootSystem(api, dt);
    this.movementSystem(api, dt);
    this.collisionSystem(api, playerEntity);
    this.cleanupSystem(api);
    this.renderSystem(api);

    // Game over check
    const score = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE);
    if (score && score.lives <= 0) {
      this.scenes.loadScene('MainMenu');
    }
  }

  // ── Systems ───────────────────────────────────────────────────────────

  private playerSystem(api: EngineAPI, playerEntity: number, dt: number): void {
    const pos = api.getComponent<Position>(playerEntity, C.POSITION);
    if (!pos) return;

    const speed = 250;
    let vx = 0;

    if (this.keyboard.isPressed('ArrowLeft') || this.keyboard.isPressed('KeyA')) vx = -speed;
    if (this.keyboard.isPressed('ArrowRight') || this.keyboard.isPressed('KeyD')) vx = speed;

    const nx = Math.max(20, Math.min(W - 20, pos.x + vx * dt));
    api.addComponent<Position>(playerEntity, C.POSITION, { x: nx, y: pos.y });
  }

  private playerShootSystem(api: EngineAPI, playerEntity: number, dt: number): void {
    const timer = api.getComponent<ShootTimer>(playerEntity, C.SHOOT_TIMER);
    if (!timer) return;

    const elapsed = timer.elapsed + dt;
    api.addComponent<ShootTimer>(playerEntity, C.SHOOT_TIMER, { ...timer, elapsed });

    if (this.keyboard.isPressed('Space') && elapsed >= timer.cooldown) {
      const pos = api.getComponent<Position>(playerEntity, C.POSITION)!;
      api.prefabs.instantiate('Bullet', pos.x, pos.y - 20, 0, -600, 'bullet');
      api.addComponent<ShootTimer>(playerEntity, C.SHOOT_TIMER, { ...timer, elapsed: 0 });
    }
  }

  private spawnSystem(api: EngineAPI, dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(0.8, this.spawnInterval - 0.05);
      const x = 30 + Math.random() * (W - 60);
      api.prefabs.instantiate('Enemy', x, -30);
    }
  }

  private enemyShootSystem(api: EngineAPI, dt: number): void {
    const enemies = api.query([C.TAG.name, C.POSITION.name, C.SHOOT_TIMER.name]);
    for (const id of enemies) {
      const tag = api.getComponent<Tag>(id, C.TAG);
      if (tag?.type !== 'enemy') continue;

      const timer = api.getComponent<ShootTimer>(id, C.SHOOT_TIMER)!;
      const elapsed = timer.elapsed + dt;

      if (elapsed >= timer.cooldown) {
        const pos = api.getComponent<Position>(id, C.POSITION)!;
        api.prefabs.instantiate('Bullet', pos.x, pos.y + 16, 0, 350, 'enemy-bullet');
        api.addComponent<ShootTimer>(id, C.SHOOT_TIMER, { ...timer, elapsed: 0 });
      } else {
        api.addComponent<ShootTimer>(id, C.SHOOT_TIMER, { ...timer, elapsed });
      }
    }
  }

  private movementSystem(api: EngineAPI, dt: number): void {
    const movables = api.query([C.POSITION.name, C.VELOCITY.name]);
    for (const id of movables) {
      const pos = api.getComponent<Position>(id, C.POSITION)!;
      const vel = api.getComponent<Velocity>(id, C.VELOCITY)!;
      api.addComponent<Position>(id, C.POSITION, {
        x: pos.x + vel.vx * dt,
        y: pos.y + vel.vy * dt,
      });
    }
  }

  private collisionSystem(api: EngineAPI, playerEntity: number | undefined): void {
    const bullets = api.query([C.TAG.name, C.POSITION.name, C.COLLIDER.name]);
    const enemies = api.query([C.TAG.name, C.POSITION.name, C.COLLIDER.name, C.HEALTH.name]);

    const score = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE);
    if (!score) return;

    for (const bulletId of bullets) {
      const bTag = api.getComponent<Tag>(bulletId, C.TAG);
      if (bTag?.type !== 'bullet') continue;

      const bPos = api.getComponent<Position>(bulletId, C.POSITION)!;
      const bCol = api.getComponent<Collider>(bulletId, C.COLLIDER)!;

      for (const enemyId of enemies) {
        const eTag = api.getComponent<Tag>(enemyId, C.TAG);
        if (eTag?.type !== 'enemy') continue;

        const ePos = api.getComponent<Position>(enemyId, C.POSITION)!;
        const eCol = api.getComponent<Collider>(enemyId, C.COLLIDER)!;

        // Player bullet vs enemy
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

    if (playerEntity !== undefined) {
      const pPos = api.getComponent<Position>(playerEntity, C.POSITION)!;
      const pCol = api.getComponent<Collider>(playerEntity, C.COLLIDER)!;

      for (const bulletId of bullets) {
        const bTag = api.getComponent<Tag>(bulletId, C.TAG);
        if (bTag?.type !== 'enemy-bullet') continue;
        if (!api.hasComponent(bulletId, C.POSITION.name)) continue;

        const bPos = api.getComponent<Position>(bulletId, C.POSITION)!;
        const bCol = api.getComponent<Collider>(bulletId, C.COLLIDER)!;

        if (dist(bPos.x, bPos.y, pPos.x, pPos.y) < bCol.radius + pCol.radius) {
          api.destroyEntity(bulletId);
          const current = api.getComponent<ScoreData>(this.scoreEntity, C.SCORE)!;
          api.addComponent<ScoreData>(this.scoreEntity, C.SCORE, {
            ...current, lives: current.lives - 1,
          });
        }
      }
    }
  }

  private cleanupSystem(api: EngineAPI): void {
    const entities = api.query([C.POSITION.name, C.TAG.name]);
    for (const id of entities) {
      const pos = api.getComponent<Position>(id, C.POSITION)!;
      if (pos.y < -60 || pos.y > H + 60 || pos.x < -60 || pos.x > W + 60) {
        api.destroyEntity(id);
      }
    }
  }

  private renderSystem(api: EngineAPI): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    const t = Date.now() / 1000;
    for (let i = 0; i < 50; i++) {
      const sx = (Math.sin(i * 7.3 + 1) * 0.5 + 0.5) * W;
      const sy = ((Math.sin(i * 3.7) * 0.5 + 0.5) * H + t * (20 + i % 20)) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    const renderable = api.query([C.POSITION.name, C.TAG.name]);
    for (const id of renderable) {
      const pos = api.getComponent<Position>(id, C.POSITION)!;
      const tag = api.getComponent<Tag>(id, C.TAG)!;

      ctx.save();
      ctx.translate(pos.x, pos.y);

      switch (tag.type) {
        case 'player':
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
}

// ── GameScene ───────────────────────────────────────────────────────────

export class GameScene implements Scene {
  readonly name = 'Game';

  // Utilisation de la nouvelle API de Scene (Phase K)
  readonly plugins: TsPlugin[];

  constructor(scenes: SceneManager) {
    this.plugins = [new SpaceShooterPlugin(scenes)];
  }

  onEnter(_api: EngineAPI): void {
    // Rien à faire, le SpaceShooterPlugin gère tout !
  }

  onExit(_api: EngineAPI): void {
    // Entities and plugins are automatically purged
  }
}
