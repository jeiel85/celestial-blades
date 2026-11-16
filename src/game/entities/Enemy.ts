import Phaser from 'phaser';
import {
  DROP_RATE_B,
  DROP_RATE_G,
  DROP_RATE_L,
  DROP_RATE_P,
  HEIGHT,
  WIDTH,
} from '../GameConfig';
import type { EnemyEntry, EnemySpawnOpts, IGameWorld } from '../GameConfig';
import { ENEMY_TYPES } from '../data/enemyPatterns';
import type { EnemyAgent, EnemyTypeDef } from '../data/enemyPatterns';

/** WaveAction opts와 호환되는 스폰 옵션 (틴트/스케일 변형 포함) */
export type EnemySpawnArgs = EnemySpawnOpts & { tint?: number; scale?: number };

const DESPAWN_MARGIN = 120;
/** 위·아래·뒤에서 도착점까지 날아 들어오는 시간 (ms, 게임 시간) */
const ENTRY_MS: Record<Exclude<EnemyEntry, 'right'>, number> = { top: 1000, bottom: 1000, back: 1600 };
/** 이만큼 화면 안쪽에 들어와야 '들어왔다'고 보고 첫 발 시점을 맞춘다 (px) */
const ARM_MARGIN = 16;

/**
 * 풀링되는 적 엔티티 (Arcade Image).
 * GameScene이 80기까지 미리 확보해 재활용한다. 물리 이동은 쓰지 않고
 * 패턴 함수(move/fire)가 x/y를 직접 갱신한 뒤 body를 동기화한다.
 */
export class Enemy extends Phaser.Physics.Arcade.Image implements EnemyAgent {
  typeId = 'small';

  private readonly aura: Phaser.GameObjects.Image;
  private maxHp = 3;
  private hp = 3;
  private radius = 14;
  private scoreValue = 50;
  private def: EnemyTypeDef = ENEMY_TYPES.small;
  private dead = false;
  private baseTint: number | null = null;
  private lastSfxAt = 0;
  private lastFlashAt = 0;
  private dropScale = 1;
  /** 화면 안에 들어와 첫 발 시점을 맞췄는가. 그 전에는 쏘지 않는다. */
  private armed = false;
  private firstShotMs = 0;
  /** 가장자리에서 도착점까지 날아 들어오는 중이면 남은 시간 (ms) */
  private entryLeft = 0;
  private entryTotal = 0;
  private entryFromX = 0;
  private entryFromY = 0;
  private entryToX = 0;
  private entryToY = 0;

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
    this.aura = scene.add.image(-200, -200, 'fx_glow').setDepth(49).setVisible(false);
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

    const preset = this.world.getPreset();
    const hpMult = preset.enemyHp;
    this.maxHp = Math.max(1, Math.round(def.hp * (opts?.hpScale ?? 1) * hpMult));
    this.hp = this.maxHp;
    this.radius = def.radius;
    this.scoreValue = Math.round(def.score * (opts?.scoreScale ?? 1));

    this.setTexture(def.tex);
    this.baseTint = opts?.tint ?? def.tint ?? null;
    if (this.baseTint !== null) this.setTint(this.baseTint);
    else this.clearTint();
    // 충돌 반경은 밸런스 값 그대로 유지하고, 화면에서만 조금 키운다.
    // 소형 적도 얼굴과 실루엣이 읽혀야 웨이브의 존재감이 생긴다.
    const visualBoost = ['small', 'bat', 'rusher', 'fish', 'wisp'].includes(this.typeId) ? 1.2 : 1.1;
    this.setScale((opts?.scale ?? 1) * visualBoost);
    this.setAlpha(1);
    this.aura
      .setVisible(true)
      .setPosition(x, y)
      .setScale(Math.max(0.72, Math.min(1.8, 0.65 + def.radius / 28)))
      .setAlpha(def.radius >= 24 ? 0.24 : 0.16)
      .setTint(this.baseTint ?? 0xff5f8f);
    this.setRotation(0);

    this.vx = 0;
    this.vy = 0;
    this.age = 0;
    this.seed = Math.random() * Math.PI * 2;
    this.speedScale = opts?.speedScale ?? 1;
    this.fireInterval = Math.max(500, Math.round((def.fireInterval ?? 2400) / preset.density));
    this.fireTimer = this.fireInterval * (0.6 + Math.random() * 0.8);
    // 첫 발은 밀도에 따라 당기거나 늦추되 지나치지 않게(EASY 0.75배 ~ 1.3배 빠르기)
    this.firstShotMs = def.firstShot !== undefined ? def.firstShot / Math.max(0.75, Math.min(1.3, preset.density)) : Infinity;
    this.armed = false;
    this.dropScale = Math.max(0, Math.min(1, opts?.dropScale ?? 1));
    this.phase = 0;
    this.phaseTime = 0;
    this.lockX = x;
    this.lockY = y;
    this.baseY = y;
    this.warnOn = false;
    this.spawnTimer = 1600;
    this.dead = false;

    // 위·아래·뒤 등장: (x, y)는 도착점. 가장자리에서 출발하고, 도착한 뒤 평소 이동이 끊김 없이 이어지도록
    // 위상(seed)을 0 또는 π로 둔다(사인 궤적이 age 0에서 baseY를 지난다).
    const entry = opts?.entry ?? 'right';
    let sx = x;
    let sy = y;
    if (entry !== 'right') {
      this.entryTotal = ENTRY_MS[entry];
      this.entryLeft = this.entryTotal;
      this.entryToX = x;
      this.entryToY = y;
      if (entry === 'top') sy = -50;
      else if (entry === 'bottom') sy = HEIGHT + 50;
      else sx = -60;
      this.entryFromX = sx;
      this.entryFromY = sy;
      this.seed = Math.random() < 0.5 ? 0 : Math.PI;
    } else {
      this.entryLeft = 0;
      this.entryTotal = 0;
    }

    this.enableBody(true, sx, sy, true, true);
    this.aura.setPosition(sx, sy);
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
    if (this.entryLeft > 0) {
      this.updateEntry(dtMs);
    } else {
      this.age += dtMs;
      this.def.move(this, this.age, dtMs);
      if (!this.armed && this.onScreen()) {
        this.armed = true;
        this.fireTimer = Math.min(this.fireTimer, this.firstShotMs);
      }
      // 화면 밖에서는 발사 타이머를 묶어 둔다(돌진형의 조준·돌진 단계는 타이머와 무관하게 진행된다).
      if (!this.armed) this.fireTimer = Math.max(this.fireTimer, dtMs + 1);
      this.def.fire(this, this.age, dtMs, this.world);
    }
    this.aura.setPosition(this.x, this.y);
    this.aura.setAlpha((this.radius >= 24 ? 0.19 : 0.12) + Math.abs(Math.sin(this.age / 260)) * 0.08);

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
   * 가장자리 → 도착점 비행(감속하며 멈춤). 이 동안은 쏘지 않는다. vx/vy에 현재 속도를 남겨
   * 자동 회피 어시스트가 날아오는 몸체를 내다볼 수 있게 한다.
   */
  private updateEntry(dtMs: number): void {
    this.entryLeft = Math.max(0, this.entryLeft - dtMs);
    const p = 1 - this.entryLeft / this.entryTotal;
    const k = Math.sin((p * Math.PI) / 2);
    const nx = this.entryFromX + (this.entryToX - this.entryFromX) * k;
    const ny = this.entryFromY + (this.entryToY - this.entryFromY) * k;
    const sec = dtMs / 1000;
    this.vx = sec > 0 ? (nx - this.x) / sec : 0;
    this.vy = sec > 0 ? (ny - this.y) / sec : 0;
    this.x = nx;
    this.y = ny;
    if (this.entryLeft === 0) {
      this.vx = 0;
      this.vy = 0;
      this.age = 0;
    }
  }

  private onScreen(): boolean {
    return this.x >= ARM_MARGIN && this.x <= WIDTH - ARM_MARGIN && this.y >= ARM_MARGIN && this.y <= HEIGHT - ARM_MARGIN;
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
    this.revengeShot(x, y);
    this.release();
  }

  /**
   * 격파탄(EXTREME): 죽은 자리에서 플레이어를 향한 조준탄과, 몸집에 비례한 원형탄을 남긴다.
   * 원형탄은 한 칸을 비우고 조준탄과 엇갈리게 놓아 빠져나갈 틈을 남긴다.
   * 플레이어 바로 앞(140px 이내)에서 죽은 적은 남기지 않는다(피할 시간이 없는 탄은 만들지 않는다).
   */
  private revengeShot(x: number, y: number): void {
    const world = this.world;
    if (!world.getPreset().revenge || !world.isPlayerAlive()) return;
    const p = world.getPlayerPos();
    if (Math.hypot(p.x - x, p.y - y) < 140) return;
    const aim = Math.atan2(p.y - y, p.x - x);
    world.spawnEnemyBullet(x, y, aim, 230, 'eb_small', 0xff4d6d);
    const ring = this.radius >= 26 ? 12 : this.radius >= 20 ? 8 : 0;
    for (let i = 1; i < ring; i += 1) {
      world.spawnEnemyBullet(x, y, aim + Math.PI / ring + (i / ring) * Math.PI * 2, 150, 'eb_mid', 0xff8fb3);
    }
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
    const s = this.dropScale;
    const roll = Math.random();
    // EXTREME은 목숨 아이템이 나오지 않는다(그 몫은 그대로 다음 아이템 확률로 넘어가지 않고 비운다).
    const lifeRate = this.world.getPreset().lifeDrops ? (DROP_RATE_L + biasL) * s : 0;
    let acc = lifeRate;
    if (lifeRate > 0 && roll < acc) {
      this.world.spawnItem('L', x, y);
      return;
    }
    acc += (DROP_RATE_B + biasB) * s;
    if (roll < acc) {
      this.world.spawnItem('B', x, y);
      return;
    }
    acc += (DROP_RATE_P + biasP) * s;
    if (roll < acc) {
      this.world.spawnItem('P', x, y);
      return;
    }
    acc += (DROP_RATE_G + biasG) * s;
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
    this.aura.setVisible(false);
  }
}
