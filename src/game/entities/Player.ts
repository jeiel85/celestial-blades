import Phaser from 'phaser';
import {
  BOMB_INVULN,
  CHARGE_TIME,
  DASH_DISTANCE,
  DASH_INVULN,
  FOCUS_SPEED_MULT,
  MAX_BOMBS,
  MAX_POWER_LEVEL,
  PLAYER_INVULN,
  PLAYER_MAX_X,
  PLAYER_MAX_Y,
  PLAYER_MIN_X,
  PLAYER_MIN_Y,
  PLAYER_SPEED,
  START_BOMBS,
} from '../GameConfig';
import type { IGameWorld } from '../GameConfig';
import { getCharacter } from '../data/characters';
import type { InputSystem } from '../systems/InputSystem';

export type PlayerHitResult = 'ok' | 'invulnerable' | 'dead';

const DASH_TIME = 180;
const DASH_SPEED = DASH_DISTANCE / (DASH_TIME / 1000);

/**
 * 3캐릭터 전체 로직 (이동/집중/기본공격/차지/필살기/피격).
 * GameScene 대신 IGameWorld 계약만 참조한다.
 * 생성: new Player(scene, world, charIndex, { lives, bombs })
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly core: Phaser.GameObjects.Image;
  private chargeGlow: Phaser.GameObjects.Image | null = null;

  private readonly scene: Phaser.Scene;
  private readonly world: IGameWorld;
  private readonly charIndex: number;

  private lives: number;
  private bombs: number;
  private power = 0;
  private alive = true;
  private invulnLeft = 0;
  private blinkAcc = 0;

  private shotTimer = 0;
  private chargeTime = 0;
  private chargeReady = false;
  private chargeNotified = false;

  private dashLeft = 0;
  private dashTick = 0;

  private bombSwordLeft = 0;
  private bombSwordTick = 0;

  private onDeath: (() => void) | null = null;
  private onHit: (() => void) | null = null;

  /** 디버그 무적 (F2). true면 damagePlayer가 항상 invulnerable. */
  godMode = false;

  constructor(scene: Phaser.Scene, world: IGameWorld, charIndex: number, lives = 3, bombs = START_BOMBS) {
    this.scene = scene;
    this.world = world;
    this.charIndex = Math.min(2, Math.max(0, Math.floor(charIndex)));
    const def = getCharacter(this.charIndex);

    this.lives = Math.max(1, lives);
    this.bombs = Math.min(MAX_BOMBS, Math.max(0, bombs));

    this.sprite = scene.physics.add.sprite(200, 360, def.texture);
    this.sprite.setDepth(100);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
      // 공정 피격 판정: 본체보다 작은 원
      const w = Math.max(8, this.sprite.width);
      const h = Math.max(8, this.sprite.height);
      const r = 6;
      body.setCircle(r, w / 2 - r, h / 2 - r);
    }

    this.core = scene.add.image(this.sprite.x, this.sprite.y, 'player_core').setDepth(101).setVisible(false);
  }

  // -- 콜백 ---------------------------------------------------------------
  setOnDeath(cb: (() => void) | null): void {
    this.onDeath = cb;
  }

  setOnHit(cb: (() => void) | null): void {
    this.onHit = cb;
  }

  // -- getter ---------------------------------------------------------------
  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  getLives(): number {
    return this.lives;
  }

  getBombs(): number {
    return this.bombs;
  }

  getPower(): number {
    return this.power;
  }

  getCharIndex(): number {
    return this.charIndex;
  }

  isAlive(): boolean {
    return this.alive;
  }

  isInvulnerable(): boolean {
    return this.invulnLeft > 0 || this.godMode;
  }

  getChargeRatio(): number {
    return Math.min(1, this.chargeTime / CHARGE_TIME);
  }

  isChargeFull(): boolean {
    return this.chargeReady;
  }

  isDashing(): boolean {
    return this.dashLeft > 0;
  }

  addLife(n = 1): void {
    if (!this.alive) return;
    this.lives = Math.min(6, this.lives + n);
  }

  addBomb(n = 1): void {
    this.bombs = Math.min(MAX_BOMBS, this.bombs + n);
  }

  addPower(n = 1): void {
    this.power = Math.min(MAX_POWER_LEVEL, this.power + n);
  }

  // -- 메인 업데이트 ----------------------------------------------------------
  update(dtMs: number, input: InputSystem): void {
    if (!this.alive) return;
    const dt = dtMs / 1000;
    const def = getCharacter(this.charIndex);
    const focused = input.focusDown;

    // 무적 타이머
    if (this.invulnLeft > 0) {
      this.invulnLeft -= dtMs;
      this.blinkAcc += dtMs;
      this.sprite.setAlpha(Math.floor(this.blinkAcc / 110) % 2 === 0 ? 0.35 : 1);
      if (this.invulnLeft <= 0) {
        this.invulnLeft = 0;
        this.sprite.setAlpha(1);
      }
    }

    // 이동
    const axis = input.getAxis();
    const speedScale = def.stats.speed >= 5 ? 1.08 : def.stats.speed <= 2 ? 0.94 : 1;
    const speed = PLAYER_SPEED * speedScale * (focused ? FOCUS_SPEED_MULT : 1);
    if (this.dashLeft > 0) {
      // 돌진 중: 전방 고속 + 상하 조향만 허용
      this.dashLeft -= dtMs;
      this.sprite.x += DASH_SPEED * dt;
      this.sprite.y += axis.y * speed * 0.6 * dt;
      this.dashTick -= dtMs;
      if (this.dashTick <= 0) {
        this.dashTick = 40;
        this.world.fx.afterimage(this.sprite, 0xa06bff, 300);
        if (this.world.dealDamageInRadius) {
          this.world.dealDamageInRadius(this.sprite.x + 60, this.sprite.y, 70, 6);
        }
      }
      if (this.dashLeft <= 0) this.dashLeft = 0;
    } else {
      this.sprite.x += axis.x * speed * dt;
      this.sprite.y += axis.y * speed * dt;
    }
    this.sprite.x = Math.min(PLAYER_MAX_X, Math.max(PLAYER_MIN_X, this.sprite.x));
    this.sprite.y = Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, this.sprite.y));
    this.sprite.setRotation(Phaser.Math.Clamp(axis.y * 0.28, -0.3, 0.3));

    // 히트 코어 표시 (집중 시)
    this.core.setVisible(focused);
    this.core.setPosition(this.sprite.x, this.sprite.y);
    this.core.setRotation(this.core.rotation + dt * 2.5);

    // 필살기 입력
    if (input.bombJustPressed) {
      this.tryBomb();
    }

    // 윤 필살기 검진 지속 스폰
    if (this.bombSwordLeft > 0) {
      this.bombSwordLeft -= dtMs;
      this.bombSwordTick -= dtMs;
      if (this.bombSwordTick <= 0) {
        this.bombSwordTick = 120;
        this.spawnBombSword();
      }
    }

    // 기본 공격 + 차지
    if (input.attackDown) {
      this.shotTimer -= dtMs;
      while (this.shotTimer <= 0) {
        this.fireBasic();
        const interval = def.shotIntervalMs * (this.charIndex === 2 ? 1 - this.power * 0.07 : 1);
        this.shotTimer += Math.max(45, interval);
      }
      this.chargeTime += dtMs;
      if (this.chargeTime >= CHARGE_TIME && !this.chargeReady) {
        this.chargeReady = true;
      }
      if (this.chargeReady && !this.chargeNotified) {
        this.chargeNotified = true;
        this.world.audio.playSfx('chargeFull');
      }
      this.updateChargeGlow();
    } else {
      if (input.attackJustReleased && this.chargeReady) {
        this.fireCharge();
      }
      this.chargeTime = 0;
      this.chargeReady = false;
      this.chargeNotified = false;
      this.hideChargeGlow();
    }
  }

  // -- 기본 공격 ---------------------------------------------------------------
  private fireBasic(): void {
    const def = getCharacter(this.charIndex);
    const x = this.sprite.x + 28;
    const y = this.sprite.y;
    const w = this.world;
    const dmg = (base: number) => base * def.damageMult * (1 + this.power * 0.15);

    if (this.charIndex === 0) {
      // 윤: 빠른 직선 검기
      const SPEED = 950;
      if (this.power <= 0) {
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y, vx: SPEED, vy: 0, damage: dmg(1) });
      } else if (this.power === 1) {
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y - 9, vx: SPEED, vy: 0, damage: dmg(1) });
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y + 9, vx: SPEED, vy: 0, damage: dmg(1) });
      } else if (this.power === 2) {
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y, vx: SPEED, vy: 0, damage: dmg(1) });
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y - 13, vx: SPEED, vy: -45, damage: dmg(0.9) });
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y + 13, vx: SPEED, vy: 45, damage: dmg(0.9) });
      } else {
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y - 5, vx: SPEED, vy: 0, damage: dmg(1) });
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y + 5, vx: SPEED, vy: 0, damage: dmg(1) });
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y - 16, vx: SPEED, vy: -70, damage: dmg(0.9) });
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y: y + 16, vx: SPEED, vy: 70, damage: dmg(0.9) });
      }
      w.audio.playSfx('shoot');
    } else if (this.charIndex === 1) {
      // 려화: 3갈래 화염탄
      const SPEED = 660;
      const spread = [0, -0.14, 0.14, -0.28, 0.28];
      const count = this.power <= 0 ? 2 : this.power === 1 ? 3 : this.power === 2 ? 3 : 5;
      for (let i = 0; i < count; i += 1) {
        const a = this.power <= 0 ? (i === 0 ? -0.12 : 0.12) : spread[i];
        w.spawnPlayerBullet({
          texture: 'shot_flame',
          x,
          y: y + (i - (count - 1) / 2) * 6,
          vx: Math.cos(a) * SPEED,
          vy: Math.sin(a) * SPEED,
          damage: dmg(0.9),
          scale: this.power >= 2 ? 1.25 : 1,
          life: 1500,
        });
      }
      w.audio.playSfx('shoot');
    } else {
      // 무영: 초고속 직선 수리검 (좁은 범위, 고DPS)
      const SPEED = 1150;
      if (this.power <= 0) {
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y, vx: SPEED, vy: 0, damage: dmg(1) });
      } else if (this.power === 1) {
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y: y - 7, vx: SPEED, vy: 0, damage: dmg(1) });
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y: y + 7, vx: SPEED, vy: 0, damage: dmg(1) });
      } else {
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y, vx: SPEED, vy: 0, damage: dmg(1) });
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y: y - 10, vx: SPEED, vy: -12, damage: dmg(0.95) });
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y: y + 10, vx: SPEED, vy: 12, damage: dmg(0.95) });
      }
      w.audio.playSfx('shoot');
    }
  }

  // -- 차지 공격 ------------------------------------------------------------------
  private fireCharge(): void {
    const x = this.sprite.x + 30;
    const y = this.sprite.y;
    const w = this.world;
    if (this.charIndex === 0) {
      // 윤: 거대 초승달 (적탄 소거)
      w.spawnPlayerBullet({
        texture: 'shot_crescent',
        x,
        y,
        vx: 720,
        vy: 0,
        damage: 8,
        scale: 1,
        pierce: 99,
        clearsBullets: true,
      });
      w.fx.explosion(x, y, 0.7, 0x4db2ff);
      w.audio.playSfx('chargeShot');
    } else if (this.charIndex === 1) {
      // 려화: 추적 화염조 5~7기 (앞 30~40도 범위 내 가까운 적 추적, 없으면 직진)
      const count = 5 + Math.min(2, this.power);
      for (let i = 0; i < count; i += 1) {
        const a = ((i - (count - 1) / 2) / ((count - 1) / 2)) * 0.35;
        const px = x + Math.cos(a) * 40;
        const py = y + Math.sin(a) * 40;
        const target = w.findTarget ? w.findTarget(px + 120, py, 760) : null;
        w.spawnPlayerBullet({
          texture: 'shot_seeker',
          x: px,
          y: py,
          vx: Math.cos(a) * 540,
          vy: Math.sin(a) * 540,
          damage: 3,
          homing: target !== null,
          homingTurn: 5,
          life: 2600,
        });
      }
      w.fx.explosion(x, y, 0.8, 0xff7b2d);
      w.audio.playSfx('chargeShot');
    } else {
      // 무영: 전방 돌진 (420px, 경로 대미지, 0.25초 무적, 잔상)
      this.dashLeft = DASH_TIME;
      this.dashTick = 0;
      this.invulnLeft = Math.max(this.invulnLeft, DASH_INVULN);
      w.fx.afterimage(this.sprite, 0xa06bff, 320);
      w.audio.playSfx('chargeShot');
    }
  }

  private updateChargeGlow(): void {
    if (this.chargeTime < 150) {
      this.hideChargeGlow();
      return;
    }
    const ratio = this.getChargeRatio();
    if (!this.chargeGlow) {
      this.chargeGlow = this.scene.add.image(this.sprite.x, this.sprite.y, 'fx_glow').setDepth(99).setAlpha(0.5);
    }
    const tints = [0x4db2ff, 0xff7b2d, 0xa06bff];
    this.chargeGlow.setVisible(true);
    this.chargeGlow.setPosition(this.sprite.x, this.sprite.y);
    this.chargeGlow.setScale(0.5 + ratio * 1.1);
    this.chargeGlow.setTint(this.chargeReady ? 0xffffff : tints[this.charIndex]);
    this.chargeGlow.setAlpha(this.chargeReady ? 0.85 : 0.35 + ratio * 0.3);
  }

  private hideChargeGlow(): void {
    if (this.chargeGlow) {
      this.chargeGlow.setVisible(false);
    }
  }

  // -- 필살기 ------------------------------------------------------------------
  private tryBomb(): void {
    if (!this.alive || this.bombs <= 0) return;
    this.bombs -= 1;
    this.invulnLeft = Math.max(this.invulnLeft, BOMB_INVULN);
    const w = this.world;
    w.audio.playSfx('bomb');
    w.clearEnemyBullets();
    w.shake(0.006, 350);
    w.hitStop(120);

    const x = this.sprite.x;
    const y = this.sprite.y;
    if (this.charIndex === 0) {
      // 윤: 2초간 전방 거대 검진 다발
      this.bombSwordLeft = 2000;
      this.bombSwordTick = 0;
      w.fx.explosion(x + 120, y, 1.4, 0x4db2ff);
    } else if (this.charIndex === 1) {
      // 려화: 화면 랜덤 불기둥 8~12개
      const count = 8 + Math.min(4, this.power + 1);
      for (let i = 0; i < count; i += 1) {
        this.scene.time.delayedCall(i * 130, () => {
          if (!this.alive || !this.scene.scene.isActive()) return;
          const rx = Phaser.Math.Between(Math.floor(x + 160), 1220);
          const ry = Phaser.Math.Between(90, 630);
          w.fx.explosion(rx, ry, 1.2, 0xff7b2d);
          for (let k = -1; k <= 1; k += 1) {
            w.spawnPlayerBullet({
              texture: 'shot_flame',
              x: rx,
              y: ry + k * 14,
              vx: 420,
              vy: k * 160,
              damage: 4,
              scale: 1.6,
              pierce: 6,
              clearsBullets: true,
              life: 1200,
            });
          }
          if (w.dealDamageInRadius) w.dealDamageInRadius(rx, ry, 110, 6);
        });
      }
    } else {
      // 무영: 잔상 다수가 화면을 가로지르기
      for (let i = 0; i < 6; i += 1) {
        this.scene.time.delayedCall(i * 150, () => {
          if (!this.alive || !this.scene.scene.isActive()) return;
          const ry = Phaser.Math.Clamp(y + (i - 2.5) * 70, 80, 640);
          try {
            const ghost = this.scene.add.image(-60, ry, getCharacter(2).texture).setDepth(100).setAlpha(0.8).setTint(0xa06bff);
            this.scene.tweens.add({
              targets: ghost,
              x: 1360,
              duration: 420,
              ease: 'Cubic.easeIn',
              onUpdate: () => {
                if (w.dealDamageInRadius) w.dealDamageInRadius(ghost.x + 40, ghost.y, 90, 5);
              },
              onComplete: () => ghost.destroy(),
            });
          } catch {
            // 무시
          }
          w.fx.afterimage(this.sprite, 0xa06bff, 320);
        });
      }
    }
  }

  private spawnBombSword(): void {
    const w = this.world;
    const y = this.sprite.y;
    const x = this.sprite.x + 60;
    const rows = [-46, -16, 16, 46];
    for (const dy of rows) {
      w.spawnPlayerBullet({
        texture: 'shot_crescent',
        x,
        y: Phaser.Math.Clamp(y + dy, 60, 660),
        vx: 800,
        vy: 0,
        damage: 3.5,
        scale: 0.85,
        pierce: 12,
        clearsBullets: true,
      });
    }
  }

  // -- 피격 ------------------------------------------------------------------
  damagePlayer(): PlayerHitResult {
    if (!this.alive) return 'dead';
    if (this.godMode || this.invulnLeft > 0) return 'invulnerable';
    this.lives -= 1;
    this.power = Math.max(0, this.power - 1);
    this.chargeTime = 0;
    this.chargeReady = false;
    this.chargeNotified = false;
    this.hideChargeGlow();
    if (this.onHit) this.onHit();

    const w = this.world;
    w.audio.playSfx('playerHit');
    w.fx.explosion(this.sprite.x, this.sprite.y, 1.2, 0xff5f6e);
    w.shake(0.009, 400);
    w.hitStop(160);

    if (this.lives <= 0) {
      this.alive = false;
      this.sprite.setAlpha(1);
      this.sprite.disableBody(true, false);
      this.sprite.setVisible(false);
      this.core.setVisible(false);
      this.hideChargeGlow();
      w.fx.explosion(this.sprite.x, this.sprite.y, 2.2, 0xffffff);
      if (this.onDeath) this.onDeath();
      return 'dead';
    }
    this.invulnLeft = PLAYER_INVULN;
    this.blinkAcc = 0;
    return 'ok';
  }

  destroy(): void {
    try {
      this.scene.tweens.killTweensOf(this.sprite);
    } catch {
      // 무시
    }
    this.hideChargeGlow();
    if (this.chargeGlow) {
      this.chargeGlow.destroy();
      this.chargeGlow = null;
    }
    this.core.destroy();
    this.sprite.destroy();
  }
}
