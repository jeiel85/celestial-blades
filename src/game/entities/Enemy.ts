import Phaser from 'phaser';
import {
  DIFFICULTY_PRESETS,
  DROP_RATE_B,
  DROP_RATE_G,
  DROP_RATE_L,
  DROP_RATE_P,
  HEIGHT,
  WIDTH,
} from '../GameConfig';
import type { EnemySpawnOpts, IGameWorld } from '../GameConfig';
import { ENEMY_TYPES } from '../data/enemyPatterns';
import type { EnemyAgent, EnemyTypeDef } from '../data/enemyPatterns';

/** WaveAction opts와 호환되는 스폰 옵션 (틴트/스케일 변형 포함) */
export type EnemySpawnArgs = EnemySpawnOpts & { tint?: number; scale?: number };

const DESPAWN_MARGIN = 120;

/**
 * 풀링되는 적 엔티티 (Arcade Image).
 * GameScene이 80기까지 미리 확보해 재활용한다. 물리 이동은 쓰지 않고
 * 패턴 함수(move/fire)가 x/y를 직접 갱신한 뒤 body를 동기화한다.
 */
export class Enemy extends Phaser.Physics.Arcade.Image implements EnemyAgent {
  typeId = 'small';

  private maxHp = 3;
  private hp = 3;
  private radius = 14;
  private scoreValue = 50;
  private def: EnemyTypeDef = ENEMY_TYPES.small;
  private dead = false;
  private baseTint: number | null = null;
  private lastSfxAt = 0;
  private lastFlashAt = 0;

  // -- EnemyAgent 상태 --
  vx = 0;
  vy = 0;
  age = 0;
  seed = 0;
  speedScale = 1;
  fireTimer = 1000;
  fireInterval = 2200;
  phase = 0;
  phaseTime = 0;
  lockX = 0;
  lockY = 0;
  baseY = 360;
  warnOn = false;
  spawnTimer = 1600;

  constructor(scene: Phaser.Scene, private readonly world: IGameWorld) {
    super(scene, -200, -200, 'enemy_small');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
    this.setDepth(50);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
    }
  }

  spawn(typeId: string, x: number, y: number, opts?: EnemySpawnArgs): void {
    const def = ENEMY_TYPES[typeId] ?? ENEMY_TYPES.small;
    this.def = def;
    this.typeId = ENEMY_TYPES[typeId] !== undefined ? typeId : 'small';

    const preset = DIFFICULTY_PRESETS[this.world.getDifficulty()];
    const hpMult = this.world.getDifficulty() === 'HARD' ? 1.3 : this.world.getDifficulty() === 'EASY' ? 0.9 : 1;
    this.maxHp = Math.max(1, Math.round(def.hp * (opts?.hpScale ?? 1) * hpMult));
    this.hp = this.maxHp;
    this.radius = def.radius;
    this.scoreValue = Math.round(def.score * (opts?.scoreScale ?? 1));

    this.setTexture(def.tex);
    this.baseTint = opts?.tint ?? def.tint ?? null;
    if (this.baseTint !== null) this.setTint(this.baseTint);
    else this.clearTint();
    this.setScale(opts?.scale ?? 1);
    this.setAlpha(1);
    this.setRotation(0);

    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.seed = Math.random() * Math.PI * 2;
    this.speedScale = opts?.speedScale ?? 1;
    this.fireInterval = Math.max(500, Math.round((def.fireInterval ?? 2400) / preset.density));
    this.fireTimer = this.fireInterval * (0.6 + Math.random() * 0.8);
    this.phase = 0;
    this.phaseTime = 0;
    this.lockX = x;
    this.lockY = y;
    this.baseY = y;
    this.warnOn = false;
    this.spawnTimer = 1600;
    this.dead = false;

    this.enableBody(true, x, y, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setVelocity(0, 0);
      try {
        const fw = Math.max(1, this.frame.width);
        const fh = Math.max(1, this.frame.height);
        const r = Math.min(def.radius, Math.floor(Math.min(fw, fh) / 2));
        body.setCircle(r, Math.max(0, (fw - r * 2) / 2), Math.max(0, (fh - r * 2) / 2));
      } catch {
        // 바디 설정 실패 시 기본 박스로 진행
      }
    }
    this.setDepth(50);
  }

  update(dtMs: number): void {
    if (!this.active || this.dead) return;
    this.age += dtMs;
    this.def.move(this, this.age, dtMs);
    this.def.fire(this, this.age, dtMs, this.world);

    if (this.warnOn) {
      this.setAlpha(0.35 + 0.65 * Math.abs(Math.sin(this.age / 70)));
    } else if (this.alpha !== 1) {
      this.setAlpha(1);
    }

    const body = this.body as Phaser.Physics.Arcade.Body | null;
    try {
      if (body) body.updateFromGameObject();
    } catch {
      // 무시
    }

    if (
      this.x < -DESPAWN_MARGIN ||
      this.x > WIDTH + DESPAWN_MARGIN ||
      this.y < -DESPAWN_MARGIN ||
      this.y > HEIGHT + DESPAWN_MARGIN
    ) {
      this.release();
    }
  }

  /**
   * 피격. fromX가 적보다 왼쪽(정면)에서 오면 방패형은 15%만 받는다.
   * 처치되면 true를 반환한다.
   */
  takeDamage(dmg: number, fromX?: number): boolean {
    if (!this.active || this.dead) return false;
    let final = dmg;
    if (this.typeId === 'shield' && fromX !== undefined && fromX < this.x - 4) {
      final = dmg * 0.15;
    }
    this.hp -= final;

    // 피격 플래시 (기본 틴트로 복귀) — 연속 히트 시 하얗게 덮이는 문제를 스로틀로 방지
    const nowFlash = this.scene.time.now;
    if (nowFlash - this.lastFlashAt > 120) {
      this.lastFlashAt = nowFlash;
      try {
        this.setTintFill(0xffffff);
        const restore = this.baseTint;
        this.scene.time.delayedCall(60, () => {
          try {
            if (!this.active) return;
            if (restore !== null) this.setTint(restore);
            else this.clearTint();
          } catch {
            // 무시
          }
        });
      } catch {
        // 무시
      }
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    const now = this.scene.time.now;
    if (now - this.lastSfxAt > 70) {
      this.lastSfxAt = now;
      this.world.audio.playSfx('enemyHit');
    }
    return false;
  }

  getRadius(): number {
    return this.radius;
  }

  getHpRatio(): number {
    return Math.max(0, Math.min(1, this.hp / this.maxHp));
  }

  /** 보상 없이 풀에 반환 (화면 밖/보스전 정리용) */
  despawn(): void {
    this.release();
  }

  private die(): void {
    this.dead = true;
    const x = this.x;
    const y = this.y;
    const isBig = this.radius >= 26;
    this.world.registerKill(x, y, isBig);
    this.world.addScore(this.scoreValue);
    this.world.fx.explosion(x, y, Math.max(0.6, this.radius / 22), this.baseTint ?? 0xffb347);
    this.world.audio.playSfx('explode');
    this.rollDrops(x, y);
    this.release();
  }

  private rollDrops(x: number, y: number): void {
    // 엘리트는 B(필살기) 확정 드롭
    if (this.typeId === 'elite') {
      this.world.spawnItem('B', x, y);
      return;
    }
    const biasP = this.def.dropBias?.P ?? 0;
    const biasB = this.def.dropBias?.B ?? 0;
    const biasL = this.def.dropBias?.L ?? 0;
    const biasG = this.def.dropBias?.G ?? 0;
    const roll = Math.random();
    let acc = DROP_RATE_L + biasL;
    if (roll < acc) {
      this.world.spawnItem('L', x, y);
      return;
    }
    acc += DROP_RATE_B + biasB;
    if (roll < acc) {
      this.world.spawnItem('B', x, y);
      return;
    }
    acc += DROP_RATE_P + biasP;
    if (roll < acc) {
      this.world.spawnItem('P', x, y);
      return;
    }
    acc += DROP_RATE_G + biasG;
    if (roll < acc) {
      this.world.spawnItem('G', x, y);
    }
  }

  private release(): void {
    this.dead = false;
    this.warnOn = false;
    try {
      this.disableBody(true, false);
    } catch {
      this.setVisible(false);
    }
    this.setActive(false).setVisible(false);
    this.setAlpha(1);
  }
}
