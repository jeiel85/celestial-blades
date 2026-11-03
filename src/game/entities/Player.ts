import Phaser from 'phaser';
import {
  BOMB_INVULN,
  CHARGE_TIME,
  CUTIN_MS,
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
import { clampCharIndex, getCharacter } from '../data/characters';
import type { CharacterDef } from '../data/characters';
import type { InputSystem } from '../systems/InputSystem';

export type PlayerHitResult = 'ok' | 'invulnerable' | 'dead';

const DASH_TIME = 180;
const DASH_SPEED = DASH_DISTANCE / (DASH_TIME / 1000);
/** 해랑 차지 결계 */
const BARRIER_TIME = 1600;
const BARRIER_RADIUS = 120;
/** 소율 필살기 화살비 */
const ARROW_RAIN_TIME = 3000;
/** 해랑 필살기 사신결계 */
const WARD_TIME = 1500;
const WARD_COLORS = [0x4db2ff, 0xf2f2f2, 0xff4d3d, 0x6a5acd];
/** 식신이 머무는 자리(플레이어 기준, 집중 중이면 앞쪽으로 붙는다) */
const FAMILIAR_OFFSET = { x: -46, y: -50 };
const FAMILIAR_FOCUS_OFFSET = { x: 36, y: -34 };

/**
 * 캐릭터 전체 로직 (이동/집중/기본공격/차지/필살기/피격). 캐릭터별 분기는 def.id로 한다.
 * GameScene 대신 IGameWorld 계약만 참조한다.
 * 생성: new Player(scene, world, charIndex, { lives, bombs })
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly aura: Phaser.GameObjects.Image;
  private readonly core: Phaser.GameObjects.Image;
  private chargeGlow: Phaser.GameObjects.Image | null = null;

  private readonly scene: Phaser.Scene;
  private readonly world: IGameWorld;
  private readonly charIndex: number;
  private readonly def: CharacterDef;

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
  /** 컷인 재생 중(중복 발동 방지) */
  private cutInActive = false;
  private bombSwordTick = 0;

  private barrierLeft = 0;
  private barrierImg: Phaser.GameObjects.Image | null = null;
  private arrowRainLeft = 0;
  private arrowRainTick = 0;
  private wardLeft = 0;
  private wardTick = 0;

  /** 식신(텐가이식 옵션): 플레이어를 늦게 따라오며 공격키를 누르는 동안 함께 쏜다 */
  private readonly familiar: Phaser.GameObjects.Image;
  private familiarTimer = 0;
  private familiarBob = 0;

  private onDeath: (() => void) | null = null;
  private onHit: (() => void) | null = null;

  /** 디버그 무적 (F2). true면 damagePlayer가 항상 invulnerable. */
  godMode = false;

  constructor(scene: Phaser.Scene, world: IGameWorld, charIndex: number, lives = 3, bombs = START_BOMBS) {
    this.scene = scene;
    this.world = world;
    this.charIndex = clampCharIndex(charIndex);
    const def = getCharacter(this.charIndex);
    this.def = def;

    this.lives = Math.max(1, lives);
    this.bombs = Math.min(MAX_BOMBS, Math.max(0, bombs));

    this.sprite = scene.physics.add.sprite(200, 360, def.texture).setScale(1.15);
    this.sprite.setDepth(100);
    // 캐릭터 실루엣을 배경에서 분리하는 얇은 색 오라. 집중/차지 글로우와
    // 겹치지 않도록 항상 뒤에 두고, 플레이어의 고유색으로만 식별성을 준다.
    this.aura = scene.add
      .image(this.sprite.x - 12, this.sprite.y, 'fx_glow')
      .setDepth(99)
      .setScale(1.25, 0.58)
      .setAlpha(0.18)
      .setTint(def.color);
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
    this.familiar = scene.add
      .image(this.sprite.x + FAMILIAR_OFFSET.x, this.sprite.y + FAMILIAR_OFFSET.y, def.familiar)
      .setDepth(100);
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
    return this.invulnLeft > 0 || this.cutInActive || this.godMode;
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
    const def = this.def;
    const focused = input.focusDown;

    this.aura.setPosition(this.sprite.x - 14, this.sprite.y);
    this.aura.setRotation(this.sprite.rotation);
    this.aura.setAlpha(focused ? 0.28 : 0.18);

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

    this.updateBarrier(dtMs);
    this.updateArrowRain(dtMs);
    this.updateWard(dtMs);
    this.updateFamiliar(dtMs, focused, input.attackDown);

    // 기본 공격 + 차지
    if (input.attackDown) {
      this.shotTimer -= dtMs;
      while (this.shotTimer <= 0) {
        this.fireBasic();
        const interval = def.shotIntervalMs * (def.id === 'mooyoung' ? 1 - this.power * 0.07 : 1);
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
    const def = this.def;
    const x = this.sprite.x + 28;
    const y = this.sprite.y;
    const w = this.world;
    const dmg = (base: number) => base * def.damageMult * (1 + this.power * 0.15);

    if (def.id === 'yun') {
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
    } else if (def.id === 'ryeohwa') {
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
    } else if (def.id === 'soyul') {
      // 소율: 적을 꿰뚫는 화살 (파워가 오르면 화살 수·관통 수 증가)
      const SPEED = 1000;
      const pierce = this.power >= 2 ? 2 : 1;
      const rows: Array<[number, number]> =
        this.power <= 0
          ? [[0, 0]]
          : this.power === 1
            ? [[-8, 0], [8, 0]]
            : this.power === 2
              ? [[0, 0], [-12, -30], [12, 30]]
              : [[-6, 0], [6, 0], [-16, -40], [16, 40]];
      for (const [dy, vy] of rows) {
        w.spawnPlayerBullet({ texture: 'shot_arrow', x, y: y + dy, vx: SPEED, vy, damage: dmg(1), pierce, distinct: true });
      }
      w.audio.playSfx('shoot');
    } else if (def.id === 'haerang') {
      // 해랑: 앞으로 퍼지며 약하게 유도되는 부적 + 뒤쪽 견제 부적
      const SPEED = 720;
      const fwd = [2, 3, 4, 5][this.power] ?? 2;
      for (let i = 0; i < fwd; i += 1) {
        const a = (i / (fwd - 1) - 0.5) * 0.4;
        w.spawnPlayerBullet({
          texture: 'shot_talisman',
          x,
          y: y + (i - (fwd - 1) / 2) * 7,
          vx: Math.cos(a) * SPEED,
          vy: Math.sin(a) * SPEED,
          damage: dmg(0.85),
          homing: true,
          homingTurn: 1.6,
          life: 1800,
        });
      }
      const back = this.power >= 2 ? [-0.3, 0.3] : [0];
      for (const a of back) {
        w.spawnPlayerBullet({
          texture: 'shot_talisman',
          x: x - 50,
          y,
          vx: -Math.cos(a) * 560,
          vy: Math.sin(a) * 560,
          damage: dmg(0.7),
          life: 1200,
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
    const id = this.def.id;
    if (id === 'yun') {
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
    } else if (id === 'ryeohwa') {
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
    } else if (id === 'soyul') {
      // 소율: 화면 끝까지 꿰뚫는 거대 화살 (맞힌 자리 주변 적탄 소거)
      w.spawnPlayerBullet({
        texture: 'shot_arrow',
        x,
        y,
        vx: 1300,
        vy: 0,
        damage: 12,
        scale: 3,
        pierce: 99,
        clearsBullets: true,
      });
      w.clearEnemyBulletsNear(x + 60, y, 80);
      w.fx.explosion(x, y, 0.7, this.def.color);
      w.audio.playSfx('chargeShot');
    } else if (id === 'haerang') {
      // 해랑: 1.6초간 주변 적탄을 지우는 호신결계
      this.barrierLeft = BARRIER_TIME;
      w.fx.explosion(this.sprite.x, this.sprite.y, 0.8, this.def.color);
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
    this.chargeGlow.setVisible(true);
    this.chargeGlow.setPosition(this.sprite.x, this.sprite.y);
    this.chargeGlow.setScale(0.5 + ratio * 1.1);
    this.chargeGlow.setTint(this.chargeReady ? 0xffffff : this.def.color);
    this.chargeGlow.setAlpha(this.chargeReady ? 0.85 : 0.35 + ratio * 0.3);
  }

  private hideChargeGlow(): void {
    if (this.chargeGlow) {
      this.chargeGlow.setVisible(false);
    }
  }

  // -- 필살기 ------------------------------------------------------------------
  /** 필살기 입력: 컷인을 띄우고 게임 시간을 거의 멈춘 뒤, 컷인이 빠져나가는 순간 releaseBomb로 공격한다. */
  private tryBomb(): void {
    if (!this.alive || this.bombs <= 0 || this.cutInActive) return;
    this.bombs -= 1;
    // 컷인 동안은 cutInActive로 무적, 공격이 나가는 releaseBomb부터 BOMB_INVULN을 센다.
    this.cutInActive = true;
    const w = this.world;
    const ch = this.def;
    w.clearEnemyBullets();
    w.audio.playSfx('chargeFull');
    w.slowMotion(0.06, CUTIN_MS);
    w.fx.cutIn(ch.cutin, ch.color, ch.bombName, ch.bombNameEng, () => {
      this.cutInActive = false;
      this.releaseBomb();
    });
  }

  private releaseBomb(): void {
    if (!this.alive) return;
    this.invulnLeft = Math.max(this.invulnLeft, BOMB_INVULN);
    const w = this.world;
    w.audio.playSfx('bomb');
    w.clearEnemyBullets();
    w.shake(0.012, 450);

    const x = this.sprite.x;
    const y = this.sprite.y;
    const id = this.def.id;
    if (id === 'yun') {
      // 윤: 2초간 전방 거대 검진 다발
      this.bombSwordLeft = 2000;
      this.bombSwordTick = 0;
      w.fx.explosion(x + 120, y, 1.4, 0x4db2ff);
    } else if (id === 'ryeohwa') {
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
    } else if (id === 'soyul') {
      // 소율: 3초간 하늘에서 화살비
      this.arrowRainLeft = ARROW_RAIN_TIME;
      this.arrowRainTick = 0;
      w.fx.explosion(x + 120, y, 1.2, this.def.color);
    } else if (id === 'haerang') {
      // 해랑: 네 빛깔 결계가 퍼지며 1.5초간 화면을 정화
      this.wardLeft = WARD_TIME;
      this.wardTick = 0;
      WARD_COLORS.forEach((color, i) => {
        try {
          const ring = this.scene.add.image(x, y, 'fx_ring').setDepth(98).setTint(color).setAlpha(0.9).setScale(0.4);
          this.scene.tweens.add({
            targets: ring,
            scale: 30,
            alpha: 0,
            delay: i * 160,
            duration: 1100,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
          });
        } catch {
          // 무시
        }
      });
    } else {
      // 무영: 잔상 다수가 화면을 가로지르기
      for (let i = 0; i < 6; i += 1) {
        this.scene.time.delayedCall(i * 150, () => {
          if (!this.alive || !this.scene.scene.isActive()) return;
          const ry = Phaser.Math.Clamp(y + (i - 2.5) * 70, 80, 640);
          try {
            const ghost = this.scene.add.image(-60, ry, this.def.texture).setDepth(100).setAlpha(0.8).setTint(0xa06bff);
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

  /**
   * 식신: 자리(집중 중엔 앞쪽)로 부드럽게 따라가며 위아래로 흔들리고, 공격키를 누르는 동안
   * 천명사마다 다른 탄을 쏜다. 파워가 오를수록 자주 쏜다. 무적 깜빡임은 본체와 맞춘다.
   */
  private updateFamiliar(dtMs: number, focused: boolean, firing: boolean): void {
    const f = this.familiar;
    const off = focused ? FAMILIAR_FOCUS_OFFSET : FAMILIAR_OFFSET;
    this.familiarBob += dtMs * 0.004;
    const tx = this.sprite.x + off.x;
    const ty = this.sprite.y + off.y + Math.sin(this.familiarBob) * 6;
    const k = Math.min(1, dtMs / 90);
    f.setPosition(f.x + (tx - f.x) * k, f.y + (ty - f.y) * k);
    f.setAlpha(this.sprite.alpha);
    if (!firing) return;
    this.familiarTimer -= dtMs;
    if (this.familiarTimer > 0) return;
    const w = this.world;
    const x = f.x + 18;
    const y = f.y;
    const dmg = (base: number) => base * (1 + this.power * 0.15);
    switch (this.def.id) {
      case 'yun':
        // 검령: 곧은 검기 1줄
        w.spawnPlayerBullet({ texture: 'shot_ki', x, y, vx: 950, vy: 0, damage: dmg(0.6), scale: 0.8 });
        this.familiarTimer = 200;
        break;
      case 'ryeohwa': {
        // 화조: 가까운 적을 쫓는 작은 불꽃
        const target = w.findTarget ? w.findTarget(x + 80, y, 700) : null;
        w.spawnPlayerBullet({ texture: 'shot_seeker', x, y, vx: 520, vy: 0, damage: dmg(1.1), homing: target !== null, homingTurn: 4, life: 1800 });
        this.familiarTimer = 380;
        break;
      }
      case 'mooyoung':
        // 그림자 고양이: 아래위로 엇갈리는 빠른 수리검
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y: y - 6, vx: 1150, vy: 0, damage: dmg(0.55) });
        w.spawnPlayerBullet({ texture: 'shot_kunai', x, y: y + 6, vx: 1150, vy: 0, damage: dmg(0.55) });
        this.familiarTimer = 240;
        break;
      case 'soyul':
        // 옥매: 적을 꿰뚫는 화살
        w.spawnPlayerBullet({ texture: 'shot_arrow', x, y, vx: 1000, vy: 0, damage: dmg(1.2), pierce: 2, distinct: true });
        this.familiarTimer = 420;
        break;
      default:
        // 종이 인형(해랑): 약하게 유도되는 부적
        w.spawnPlayerBullet({ texture: 'shot_talisman', x, y, vx: 680, vy: 0, damage: dmg(0.7), homing: true, homingTurn: 2, life: 1600 });
        this.familiarTimer = 260;
        break;
    }
    // 파워 0~3: 간격 100% → 70%
    this.familiarTimer *= 1 - this.power * 0.1;
  }

  /** 해랑 차지 결계: 유지되는 동안 매 프레임 주변 적탄을 지운다 */
  private updateBarrier(dtMs: number): void {
    if (this.barrierLeft <= 0) return;
    this.barrierLeft -= dtMs;
    if (!this.barrierImg) {
      this.barrierImg = this.scene.add.image(this.sprite.x, this.sprite.y, 'fx_ring').setDepth(102).setTint(this.def.color);
    }
    const img = this.barrierImg;
    if (this.barrierLeft <= 0) {
      this.barrierLeft = 0;
      img.setVisible(false);
      return;
    }
    // 실제 소거 반경과 같은 크기로 보이게 한다(fx_ring 64px 기준).
    img
      .setVisible(true)
      .setPosition(this.sprite.x, this.sprite.y)
      .setScale((BARRIER_RADIUS * 2) / 64)
      .setRotation(img.rotation + dtMs * 0.004)
      .setAlpha(this.barrierLeft < 400 ? 0.3 + 0.3 * Math.sin(this.barrierLeft / 30) : 0.75);
    this.world.clearEnemyBulletsNear(this.sprite.x, this.sprite.y, BARRIER_RADIUS);
  }

  /** 소율 필살기: 플레이어 앞쪽 하늘에서 비스듬히 떨어지는 관통 화살 */
  private updateArrowRain(dtMs: number): void {
    if (this.arrowRainLeft <= 0) return;
    this.arrowRainLeft -= dtMs;
    this.arrowRainTick -= dtMs;
    while (this.arrowRainTick <= 0 && this.arrowRainLeft > 0) {
      this.arrowRainTick += 60;
      const rx = Phaser.Math.Between(Math.floor(this.sprite.x + 40), 1240);
      this.world.spawnPlayerBullet({
        texture: 'shot_arrow',
        x: rx - 120,
        y: -20,
        vx: 260,
        vy: 1000,
        damage: 3,
        scale: 1.6,
        pierce: 8,
        clearsBullets: true,
        life: 1000,
      });
    }
  }

  /** 해랑 필살기: 결계가 퍼지는 동안 적탄을 계속 지우고 화면 전체에 피해 */
  private updateWard(dtMs: number): void {
    if (this.wardLeft <= 0) return;
    this.wardLeft -= dtMs;
    this.wardTick -= dtMs;
    if (this.wardTick > 0) return;
    this.wardTick += 100;
    const w = this.world;
    w.clearEnemyBullets();
    if (w.dealDamageInRadius) w.dealDamageInRadius(this.sprite.x, this.sprite.y, 1500, 4);
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
    if (this.godMode || this.invulnLeft > 0 || this.cutInActive) return 'invulnerable';
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
      this.familiar.setVisible(false);
      this.hideChargeGlow();
      w.fx.explosion(this.sprite.x, this.sprite.y, 2.2, 0xffffff);
      if (this.onDeath) this.onDeath();
      return 'dead';
    }
    this.invulnLeft = PLAYER_INVULN;
    this.blinkAcc = 0;
    return 'ok';
  }

  /** 컨티뉴: 쓰러진 자리에서 목숨·필살기를 채워 다시 살아난다(긴 무적). */
  revive(lives: number, bombs: number, x: number, y: number): void {
    this.alive = true;
    this.lives = Math.max(1, lives);
    this.bombs = Math.min(MAX_BOMBS, Math.max(0, bombs));
    this.sprite.enableBody(true, x, y, true, true);
    this.sprite.setVisible(true).setAlpha(1);
    this.familiar.setVisible(true).setPosition(x + FAMILIAR_OFFSET.x, y + FAMILIAR_OFFSET.y);
    this.invulnLeft = PLAYER_INVULN * 1.5;
    this.blinkAcc = 0;
    this.chargeTime = 0;
    this.chargeReady = false;
    this.chargeNotified = false;
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
    this.barrierImg?.destroy();
    this.barrierImg = null;
    this.familiar.destroy();
    this.core.destroy();
    this.aura.destroy();
    this.sprite.destroy();
  }
}
