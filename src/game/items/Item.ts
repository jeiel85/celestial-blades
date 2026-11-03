import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../GameConfig';
import type { IGameWorld, ItemType } from '../GameConfig';
import type { Player } from '../entities/Player';

const TEX: Record<ItemType, string> = {
  P: 'item_p',
  B: 'item_b',
  L: 'item_l',
  G: 'item_g',
};

const GLOW: Record<ItemType, number> = {
  P: 0x4db2ff,
  B: 0xffd75e,
  L: 0x53e0b0,
  G: 0xffb347,
};

const LABEL: Record<ItemType, string> = {
  P: '+POWER',
  B: '+BOMB',
  L: '+1 LIFE',
  G: '+500',
};

const DESPAWN_MARGIN = 60;
const MAGNET_RADIUS = 150;
/** 격추 때 흘린 아이템: 남아 있는 시간, 깜빡이기 시작하는 시점, 튕기는 화면 안쪽 경계 */
const SCATTER_LIFE_MS = 10000;
const SCATTER_BLINK_MS = 7500;
const SCATTER_BOUNDS = { left: 24, right: WIDTH - 24, top: 64, bottom: HEIGHT - 24 };

/**
 * 풀링 아이템 (Arcade Image).
 * P/B/L은 좌하단으로 천천히 표류, G는 위로 튀었다가 낙하한다.
 * 격추 때 흘린 아이템(scatter)은 사방으로 튀어 화면 가장자리에서 튕기다 SCATTER_LIFE_MS 뒤 사라진다.
 * 플레이어 150px 이내에서는 자석처럼 끌려간다.
 */
export class Item extends Phaser.Physics.Arcade.Image {
  kind: ItemType = 'P';

  private vx = 0;
  private vy = 0;
  private age = 0;
  private wob: number = 0;
  private scatter = false;

  constructor(scene: Phaser.Scene, private readonly world: IGameWorld) {
    super(scene, -100, -100, 'item_p');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
    this.setDepth(60);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setImmovable(true);
      try {
        body.setCircle(10, 2, 2);
      } catch {
        // 무시
      }
    }
  }

  spawn(kind: ItemType, x: number, y: number, scatter = false): void {
    this.kind = kind;
    this.age = 0;
    this.scatter = scatter;
    this.wob = Math.random() * Math.PI * 2;
    this.setTexture(TEX[kind]);
    this.clearTint();
    this.setScale(1);
    this.setAlpha(1);
    this.setRotation(0);
    if (scatter) {
      const a = Math.random() * Math.PI * 2;
      const sp = 190 + Math.random() * 110;
      this.vx = Math.cos(a) * sp;
      this.vy = Math.sin(a) * sp;
    } else if (kind === 'G') {
      // 위로 튀어오른 뒤 낙하
      this.vx = -60 - Math.random() * 40;
      this.vy = -260 - Math.random() * 60;
    } else {
      this.vx = -45 - Math.random() * 20;
      this.vy = 28 + Math.random() * 22;
    }
    this.enableBody(true, x, y, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.setAllowGravity(false);
      body.setVelocity(0, 0);
    }
    this.setDepth(60);
  }

  update(dtMs: number, px: number, py: number): void {
    if (!this.active) return;
    const sec = dtMs / 1000;
    this.age += dtMs;

    if (this.scatter) {
      // 점점 느려지되 완전히 멈추지는 않는다(초당 약 70px까지)
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 70) {
        const k = Math.max(70 / sp, 1 - 0.9 * sec);
        this.vx *= k;
        this.vy *= k;
      }
    } else if (this.kind === 'G') {
      this.vy = Math.min(430, this.vy + 900 * sec);
    } else {
      this.vy += Math.sin(this.age / 420 + this.wob) * 26 * sec;
    }
    this.x += this.vx * sec;
    this.y += this.vy * sec;

    // 자석: 150px 이내면 플레이어 쪽으로 가속
    const dx = px - this.x;
    const dy = py - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < MAGNET_RADIUS && dist > 1) {
      const pull = 200 + (MAGNET_RADIUS - dist) * 3.2;
      this.x += (dx / dist) * pull * sec;
      this.y += (dy / dist) * pull * sec;
    }

    this.setRotation(Math.sin(this.age / 300 + this.wob) * 0.22);

    if (this.scatter) {
      const b = SCATTER_BOUNDS;
      if (this.x < b.left || this.x > b.right) {
        this.x = Phaser.Math.Clamp(this.x, b.left, b.right);
        this.vx = this.x === b.left ? Math.abs(this.vx) : -Math.abs(this.vx);
      }
      if (this.y < b.top || this.y > b.bottom) {
        this.y = Phaser.Math.Clamp(this.y, b.top, b.bottom);
        this.vy = this.y === b.top ? Math.abs(this.vy) : -Math.abs(this.vy);
      }
      if (this.age >= SCATTER_LIFE_MS) {
        this.release();
        return;
      }
      this.setAlpha(this.age > SCATTER_BLINK_MS && Math.floor(this.age / 120) % 2 === 0 ? 0.3 : 1);
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

  /** 플레이어 획득 처리 (효과음/이펙트/플로팅 텍스트 포함) */
  collect(world: IGameWorld, player: Player): void {
    if (!this.active) return;
    const x = this.x;
    const y = this.y;
    switch (this.kind) {
      case 'P':
        player.addPower(1);
        break;
      case 'B':
        player.addBomb(1);
        break;
      case 'L':
        player.addLife(1);
        break;
      case 'G':
        world.addScore(500);
        break;
    }
    world.fx.explosion(x, y, 0.5, GLOW[this.kind]);
    world.fx.floatingText(x, y - 14, LABEL[this.kind], '#ffe9a0', 17);
    world.audio.playSfx('item');
    this.release();
  }

  release(): void {
    try {
      this.disableBody(true, false);
    } catch {
      this.setVisible(false);
    }
    this.setActive(false).setVisible(false);
  }
}
