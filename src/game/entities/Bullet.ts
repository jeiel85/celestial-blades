import Phaser from 'phaser';
import { BULLET_DESPAWN_MARGIN, HEIGHT, WIDTH } from '../GameConfig';
import type { TargetRef } from '../GameConfig';

export type BulletOwner = 'player' | 'enemy';

/** 관통탄(distinct 아님)이 겹쳐 있는 같은 대상을 다시 맞히는 간격(ms). 프레임 수와 무관하게 화력을 고정한다. */
const PIERCE_REHIT_MS = 100;

export interface BulletFireOpts {
  damage?: number;
  /** 관통 가능한 횟수 (0이면 관통 없음, 맞힐 때마다 GameScene이 차감) */
  pierce?: number;
  /** true면 같은 대상은 한 번만 맞힌다(관통 화살) */
  distinct?: boolean;
  /** true면 적과 닿은 적탄을 소거 (윤 차지/필살기 등) */
  clearsBullets?: boolean;
  /** true면 target을 향해 선회 */
  homing?: boolean;
  /** 초당 선회율 (rad/s) */
  homingTurn?: number;
  scale?: number;
  tint?: number;
  /** 수명 (ms, 지나면 자동 비활성화. 0이면 무제한) */
  life?: number;
  target?: TargetRef | null;
}

/**
 * 풀링 가능한 단일 탄. 플레이어탄/적탄 공용.
 * Phaser.Physics.Arcade.Group(getFirstDead + recycle 패턴)으로 재활용되며,
 * 이 클래스는 스스로 화면 밖(+80px 여유)이면 비활성화된다.
 */
export class Bullet extends Phaser.Physics.Arcade.Image {
  owner: BulletOwner = 'player';
  damage = 1;
  pierce = 0;
  distinct = false;
  /** distinct 탄이 이미 맞힌 대상 */
  readonly hitTargets = new Set<object>();
  /** 관통탄이 대상을 마지막으로 맞힌 시각(ageMs) */
  private readonly lastHitAt = new Map<object, number>();
  /** 발사 후 흐른 게임 시간(ms) */
  private ageMs = 0;
  clearsBullets = false;
  homing = false;
  homingTurn = 4;
  target: TargetRef | null = null;

  private lifeLeft = 0;
  private hasLife = false;

  constructor(scene: Phaser.Scene, x: number, y: number, texture = 'eb_small') {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
    }
  }

  fire(
    x: number,
    y: number,
    vx: number,
    vy: number,
    owner: BulletOwner,
    texture: string,
    opts: BulletFireOpts = {},
  ): void {
    this.owner = owner;
    this.damage = opts.damage ?? 1;
    this.pierce = opts.pierce ?? 0;
    this.distinct = opts.distinct ?? false;
    this.hitTargets.clear();
    this.lastHitAt.clear();
    this.ageMs = 0;
    this.clearsBullets = opts.clearsBullets ?? false;
    this.homing = opts.homing ?? false;
    this.homingTurn = opts.homingTurn ?? 4;
    this.target = opts.target ?? null;
    this.hasLife = (opts.life ?? 0) > 0;
    this.lifeLeft = opts.life ?? 0;

    this.setTexture(texture);
    if (opts.scale !== undefined) this.setScale(opts.scale);
    else this.setScale(1);
    if (opts.tint !== undefined) this.setTint(opts.tint);
    else this.clearTint();

    this.enableBody(true, x, y, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setVelocity(vx, vy);
      body.setAllowRotation(false);
    }
    // 진행 방향으로 회전 (조각탄/검기 등의 방향감)
    if (vx !== 0 || vy !== 0) {
      this.setRotation(Math.atan2(vy, vx));
    }
  }

  /**
   * 이번 접촉을 피격으로 칠지 정하고 기록한다. false면 피해·관통 소모 없이 넘긴다.
   * - distinct 탄: 같은 대상은 한 번만.
   * - 그 밖의 관통탄: 겹쳐 있는 동안 같은 대상을 PIERCE_REHIT_MS마다.
   * - 관통이 없는 탄: 맞으면 사라지므로 항상 true.
   */
  registerHit(target: object): boolean {
    if (this.distinct) {
      if (this.hitTargets.has(target)) return false;
      this.hitTargets.add(target);
      return true;
    }
    if (this.pierce <= 0) return true;
    const last = this.lastHitAt.get(target);
    if (last !== undefined && this.ageMs - last < PIERCE_REHIT_MS) return false;
    this.lastHitAt.set(target, this.ageMs);
    return true;
  }

  /** GameScene 충돌 처리에서 관통 횟수를 차감한다. true면 탄이 소멸해야 한다. */
  consumeHit(): boolean {
    if (this.pierce > 0) {
      this.pierce -= 1;
      return false;
    }
    return true;
  }

  kill(): void {
    this.disableBody(true, false);
    this.setActive(false).setVisible(false);
    this.homing = false;
    this.target = null;
  }

  preUpdate(time: number, delta: number): void {
    // NOTE: 기반 Image에는 preUpdate이 없으므로 super 호출 없음.
    // scene.add.existing이 updateList에 등록해 매 프레임 호출된다.
    void time;
    if (!this.active) return;
    // 게임 시간 배속(히트스톱·필살기 슬로모션)을 따른다. GameScene이 scene.time.timeScale에 배속을 넣는다.
    const gameDelta = delta * this.scene.time.timeScale;
    const dt = gameDelta / 1000;
    this.ageMs += gameDelta;

    if (this.hasLife) {
      this.lifeLeft -= gameDelta;
      if (this.lifeLeft <= 0) {
        this.kill();
        return;
      }
    }

    if (this.homing && this.target && this.target.active) {
      const body = this.body as Phaser.Physics.Arcade.Body | null;
      if (body) {
        const cur = Math.atan2(body.velocity.y, body.velocity.x);
        const want = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const maxTurn = this.homingTurn * dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
        const speed = body.velocity.length();
        const next = cur + turn;
        body.setVelocity(Math.cos(next) * speed, Math.sin(next) * speed);
        this.setRotation(next);
      }
    } else if (this.homing && this.target && !this.target.active) {
      this.target = null;
    }

    const m = BULLET_DESPAWN_MARGIN;
    if (this.x < -m || this.x > WIDTH + m || this.y < -m || this.y > HEIGHT + m) {
      this.kill();
    }
  }
}
