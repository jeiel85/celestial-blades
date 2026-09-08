import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../GameConfig';
import type { ParallaxTheme } from '../data/stages';

export type { ParallaxTheme };

const TEX_W = 512;
const TEX_H = HEIGHT;

interface Layer {
  img: Phaser.GameObjects.TileSprite;
  speed: number;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/**
 * 스테이지 배경 패럴랙스. 생성 시 Graphics.generateTexture로 레이어
 * 텍스처를 자체 생성한다 (키 `bg_<theme>_...`, 충돌 없음).
 * tileSprite 5층 + 도시 테마 회전 톱니 3개를 서로 다른 속도로 스크롤한다.
 */
export class Parallax {
  private readonly layers: Layer[] = [];
  private readonly texKeys: string[] = [];
  private readonly gears: Phaser.GameObjects.Image[] = [];
  private darkness: Phaser.GameObjects.Rectangle | null = null;
  private mult = 1;

  constructor(private readonly scene: Phaser.Scene, private readonly theme: ParallaxTheme) {
    const builders: Record<ParallaxTheme, () => void> = {
      valley: () => this.buildValley(),
      city: () => this.buildCity(),
      fortress: () => this.buildFortress(),
      rift: () => this.buildRift(),
    };
    builders[theme]();

    this.darkness = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0).setOrigin(0).setDepth(450).setVisible(false);
  }

  update(dtMs: number): void {
    const sec = dtMs / 1000;
    for (const layer of this.layers) {
      layer.img.tilePositionX += layer.speed * this.mult * sec;
    }
    // 도시 테마 거대 톱니 회전 (+ 느리게 좌류)
    for (let i = 0; i < this.gears.length; i += 1) {
      const gear = this.gears[i];
      gear.rotation += sec * (i % 2 === 0 ? 0.25 : -0.35);
      gear.x -= 8 * this.mult * sec;
      if (gear.x < -140) gear.x = WIDTH + 140;
    }
  }

  setScrollSpeed(mult: number): void {
    this.mult = Math.max(0, mult);
  }

  /** 스테이지3 보스 2페이즈용 화면 어둡게 (HUD 아래, 월드 위) */
  setDarkness(alpha: number): void {
    if (!this.darkness) return;
    const a = Math.max(0, Math.min(0.75, alpha));
    this.darkness.setVisible(a > 0.001);
    this.darkness.setFillStyle(0x000000, a);
  }

  destroy(): void {
    for (const layer of this.layers) {
      try {
        layer.img.destroy();
      } catch {
        // 무시
      }
    }
    this.layers.length = 0;
    for (const gear of this.gears) {
      try {
        gear.destroy();
      } catch {
        // 무시
      }
    }
    this.gears.length = 0;
    if (this.darkness) {
      try {
        this.darkness.destroy();
      } catch {
        // 무시
      }
      this.darkness = null;
    }
    for (const key of this.texKeys) {
      try {
        if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      } catch {
        // 무시
      }
    }
    this.texKeys.length = 0;
  }

  // -- 텍스처 생성 기반 ----------------------------------------------------------

  private genTex(key: string, draw: (g: Phaser.GameObjects.Graphics) => void): string {
    const full = `bg_${this.theme}_${key}`;
    if (this.scene.textures.exists(full)) this.scene.textures.remove(full);
    const g = this.scene.add.graphics();
    draw(g);
    g.generateTexture(full, TEX_W, TEX_H);
    g.destroy();
    this.texKeys.push(full);
    return full;
  }

  private addLayer(key: string, speed: number, depth: number, alpha = 1): void {
    const img = this.scene.add
      .tileSprite(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, key)
      .setDepth(depth)
      .setAlpha(alpha);
    this.layers.push({ img, speed });
  }

  private skyBands(g: Phaser.GameObjects.Graphics, top: number, bottom: number, sunX: number, sunY: number, sunColor: number): void {
    const bands = 24;
    for (let i = 0; i < bands; i += 1) {
      g.fillStyle(lerpColor(top, bottom, i / (bands - 1)), 1);
      g.fillRect(0, (TEX_H / bands) * i, TEX_W, TEX_H / bands + 1);
    }
    g.fillStyle(sunColor, 0.9);
    g.fillCircle(sunX, sunY, 46);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(sunX, sunY, 30);
  }

  private ridge(g: Phaser.GameObjects.Graphics, baseY: number, amp: number, color: number, alpha: number, seed: number): void {
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(0, TEX_H);
    const steps = 16;
    for (let i = 0; i <= steps; i += 1) {
      const x = (TEX_W / steps) * i;
      const h = baseY - Math.abs(Math.sin(i * 1.7 + seed)) * amp - Math.abs(Math.sin(i * 0.6 + seed * 2)) * amp * 0.5;
      g.lineTo(x, h);
    }
    g.lineTo(TEX_W, TEX_H);
    g.closePath();
    g.fillPath();
  }

  // -- valley: 청운계곡 ------------------------------------------------------------

  private buildValley(): void {
    const sky = this.genTex('sky', (g) => {
      this.skyBands(g, 0x9fd8f2, 0x2c5f8a, 150, 150, 0xfff2c0);
      g.fillStyle(0xffffff, 0.85);
      for (let i = 0; i < 5; i += 1) {
        const cx = 40 + i * 110;
        const cy = 420 + (i % 2) * 60;
        g.fillEllipse(cx, cy, 90, 22);
        g.fillEllipse(cx + 24, cy - 10, 60, 20);
      }
    });
    const far = this.genTex('far', (g) => {
      this.ridge(g, 430, 150, 0x3a6e8f, 0.9, 1.3);
      this.ridge(g, 480, 110, 0x2c5f8a, 1, 4.1);
    });
    const near = this.genTex('near', (g) => {
      this.ridge(g, 560, 130, 0x274d3d, 1, 2.2);
      // 소나기 폭포 느낌: 흰 세로 줄기
      g.fillStyle(0xd8f2ff, 0.55);
      for (const fx of [120, 300, 430]) {
        g.fillRect(fx, 380, 10, 180);
        g.fillRect(fx - 8, 400, 26, 150);
      }
    });
    const clouds = this.genTex('clouds', (g) => {
      g.fillStyle(0xffffff, 0.8);
      const spots: Array<[number, number, number, number]> = [
        [80, 200, 150, 34],
        [300, 320, 190, 40],
        [470, 150, 130, 30],
        [200, 500, 170, 36],
        [420, 560, 150, 32],
      ];
      for (const [cx, cy, w, h] of spots) {
        g.fillEllipse(cx, cy, w, h);
        g.fillEllipse(cx - w * 0.25, cy + 8, w * 0.6, h * 0.8);
      }
    });
    const fore = this.genTex('fore', (g) => {
      g.fillStyle(0x14261e, 1);
      for (const [rx, rw, rh] of [
        [30, 130, 90],
        [220, 170, 120],
        [430, 120, 80],
      ] as Array<[number, number, number]>) {
        g.fillEllipse(rx, TEX_H - rh / 2 + 20, rw, rh);
      }
      // 소나무 실루엣
      g.fillStyle(0x0e1a14, 1);
      for (const [px, py, s] of [
        [90, 640, 1],
        [270, 660, 1.3],
        [470, 645, 0.9],
      ] as Array<[number, number, number]>) {
        g.fillRect(px - 3 * s, py - 40 * s, 6 * s, 40 * s);
        for (let k = 0; k < 3; k += 1) {
          const w = (44 - k * 10) * s;
          const yy = py - 34 * s - k * 20 * s;
          g.fillTriangle(px - w / 2, yy, px + w / 2, yy, px, yy - 26 * s);
        }
      }
    });
    this.addLayer(sky, 6, -10);
    this.addLayer(far, 18, -9);
    this.addLayer(near, 42, -8);
    this.addLayer(clouds, 85, -7, 0.95);
    this.addLayer(fore, 150, -6);
  }

  // -- city: 붉은 기계도시 ------------------------------------------------------------

  private buildCity(): void {
    const sky = this.genTex('sky', (g) => {
      this.skyBands(g, 0x6e2a1e, 0x1a0a12, 380, 200, 0xff9f5f);
      g.fillStyle(0x2a0f0a, 0.8);
      for (let i = 0; i < 4; i += 1) g.fillEllipse(80 + i * 130, 560 + (i % 2) * 40, 170, 30);
    });
    const ships = this.genTex('ships', (g) => {
      // 원거리 비행선 실루엣
      for (const [sx, sy, s] of [
        [120, 220, 1],
        [330, 330, 0.7],
        [460, 180, 1.2],
      ] as Array<[number, number, number]>) {
        g.fillStyle(0x3d1e14, 0.9);
        g.fillEllipse(sx, sy, 120 * s, 34 * s);
        g.fillTriangle(sx + 50 * s, sy - 14 * s, sx + 72 * s, sy - 30 * s, sx + 58 * s, sy + 2 * s);
        g.fillRect(sx - 24 * s, sy + 16 * s, 40 * s, 10 * s);
        g.fillStyle(0xffd75e, 0.9);
        for (let w = 0; w < 4; w += 1) g.fillCircle(sx - 36 * s + w * 22 * s, sy, 3 * s);
      }
    });
    const gearTex = this.genTex('gear', (g) => {
      const c = 64;
      g.fillStyle(0x5e3a2a, 1);
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        g.fillCircle(c + Math.cos(a) * 52, c + Math.sin(a) * 52, 12);
      }
      g.fillCircle(c, c, 48);
      g.fillStyle(0x2a1610, 1);
      g.fillCircle(c, c, 26);
      g.fillStyle(0xc78f3d, 1);
      g.fillCircle(c, c, 10);
    });
    const buildings = this.genTex('buildings', (g) => {
      g.fillStyle(0x241210, 1);
      const xs = [0, 90, 200, 310, 420];
      for (let i = 0; i < xs.length; i += 1) {
        const bw = 70 + (i % 3) * 20;
        const bh = 260 + ((i * 53) % 120);
        g.fillRect(xs[i], TEX_H - bh, bw, bh);
        g.fillStyle(0x3d1e14, 1);
        g.fillTriangle(xs[i], TEX_H - bh, xs[i] + bw / 2, TEX_H - bh - 30, xs[i] + bw, TEX_H - bh);
        // 창문 점
        g.fillStyle(0xffd75e, 0.85);
        for (let wy = TEX_H - bh + 30; wy < TEX_H - 30; wy += 34) {
          for (let wx = xs[i] + 12; wx < xs[i] + bw - 8; wx += 22) {
            if ((wx + wy + i) % 3 !== 0) g.fillRect(wx, wy, 8, 10);
          }
        }
        g.fillStyle(0x241210, 1);
        // 붉은 등불
        g.fillStyle(0xe63b2e, 1);
        g.fillCircle(xs[i] + bw / 2, TEX_H - bh + 44, 9);
        g.fillStyle(0xfff2c0, 1);
        g.fillCircle(xs[i] + bw / 2, TEX_H - bh + 44, 4);
      }
    });
    const pipes = this.genTex('pipes', (g) => {
      g.fillStyle(0x140b08, 1);
      g.fillRect(0, 0, TEX_W, 46);
      g.fillRect(0, TEX_H - 52, TEX_W, 52);
      g.fillStyle(0x3d2418, 1);
      g.fillRect(0, 40, TEX_W, 6);
      g.fillRect(0, TEX_H - 58, TEX_W, 6);
      g.fillStyle(0x5e3a2a, 1);
      for (let x = 20; x < TEX_W; x += 80) {
        g.fillCircle(x, 23, 7);
        g.fillCircle(x, TEX_H - 26, 7);
      }
    });
    this.addLayer(sky, 6, -10);
    this.addLayer(ships, 16, -9);
    this.addLayer(buildings, 46, -8);
    this.addLayer(pipes, 150, -6);
    // 회전하는 거대 톱니 3개 (별도 이미지)
    const spots: Array<[number, number, number]> = [
      [950, 170, 1.6],
      [1120, 470, 1.1],
      [760, 560, 0.8],
    ];
    for (const [gx, gy, s] of spots) {
      const gear = this.scene.add.image(gx, gy, gearTex).setDepth(-7).setScale(s).setAlpha(0.55);
      this.gears.push(gear);
    }
  }

  // -- fortress: 천공성 ------------------------------------------------------------

  private buildFortress(): void {
    const sky = this.genTex('sky', (g) => {
      this.skyBands(g, 0x8f9fd6, 0x2e1a5e, 400, 140, 0xfff2d8);
      g.fillStyle(0xffffff, 0.9);
      for (let i = 0; i < 26; i += 1) {
        const sx = (i * 97) % TEX_W;
        const sy = (i * 61) % 320;
        g.fillCircle(sx, sy, i % 3 === 0 ? 2 : 1.2);
      }
    });
    const cloudsea = this.genTex('cloudsea', (g) => {
      g.fillStyle(0xc9b8e8, 0.85);
      for (let r = 0; r < 4; r += 1) {
        const yy = 380 + r * 70;
        for (let x = -40; x < TEX_W + 40; x += 90) {
          g.fillEllipse(x + (r % 2) * 45, yy, 120, 40 - r * 4);
        }
      }
      g.fillStyle(0x8f7fc0, 0.9);
      for (let x = -40; x < TEX_W + 40; x += 110) g.fillEllipse(x, 640, 140, 46);
    });
    const towers = this.genTex('towers', (g) => {
      // 부유 성 탑 실루엣
      for (const [tx, ty, s] of [
        [140, 260, 1],
        [360, 200, 1.3],
      ] as Array<[number, number, number]>) {
        g.fillStyle(0x3d346e, 1);
        g.fillTriangle(tx - 70 * s, ty + 60 * s, tx + 70 * s, ty + 60 * s, tx, ty + 100 * s);
        g.fillStyle(0x4d4488, 1);
        g.fillRect(tx - 34 * s, ty - 60 * s, 68 * s, 120 * s);
        g.fillTriangle(tx - 40 * s, ty - 60 * s, tx + 40 * s, ty - 60 * s, tx, ty - 110 * s);
        g.fillStyle(0x2a2450, 1);
        g.fillRect(tx - 50 * s, ty - 20 * s, 20 * s, 80 * s);
        g.fillRect(tx + 30 * s, ty - 20 * s, 20 * s, 80 * s);
        g.fillStyle(0xffd75e, 0.95);
        for (let wy = ty - 40 * s; wy < ty + 30 * s; wy += 24 * s) g.fillRect(tx - 6 * s, wy, 12 * s, 14 * s);
      }
    });
    const islands = this.genTex('islands', (g) => {
      // 부유 섬 + 기둥
      for (const [ix, iy, s] of [
        [90, 430, 1],
        [300, 540, 1.4],
        [470, 400, 0.8],
      ] as Array<[number, number, number]>) {
        g.fillStyle(0x2e2a5e, 1);
        g.fillTriangle(ix - 60 * s, iy, ix + 60 * s, iy, ix, iy + 70 * s);
        g.fillStyle(0x53a07e, 1);
        g.fillEllipse(ix, iy, 124 * s, 26 * s);
        g.fillStyle(0x4d4488, 1);
        g.fillRect(ix - 10 * s, iy + 40 * s, 20 * s, 90 * s);
      }
    });
    const shards = this.genTex('shards', (g) => {
      g.fillStyle(0x14122a, 1);
      for (const [sx, sy, s] of [
        [60, 80, 1.2],
        [250, 620, 1.6],
        [450, 120, 0.9],
      ] as Array<[number, number, number]>) {
        g.fillTriangle(sx - 40 * s, sy, sx + 40 * s, sy, sx + 6 * s, sy + 90 * s);
        g.fillStyle(0x8f9fd6, 0.8);
        g.lineStyle(2, 0x8f9fd6, 0.8);
        g.strokeTriangle(sx - 40 * s, sy, sx + 40 * s, sy, sx + 6 * s, sy + 90 * s);
        g.fillStyle(0x14122a, 1);
      }
    });
    this.addLayer(sky, 6, -10);
    this.addLayer(cloudsea, 20, -9);
    this.addLayer(towers, 44, -8);
    this.addLayer(islands, 88, -7);
    this.addLayer(shards, 155, -6);
  }

  // -- rift: 천문 ------------------------------------------------------------

  private buildRift(): void {
    const sky = this.genTex('sky', (g) => {
      this.skyBands(g, 0x0a0618, 0x1e1a4d, 256, 300, 0xa06bff);
      // 균열 발광 (중앙 세로 기둥)
      g.fillStyle(0xa06bff, 0.28);
      g.fillRect(220, 0, 72, TEX_H);
      g.fillStyle(0xd8c8ff, 0.4);
      g.fillRect(242, 0, 28, TEX_H);
      g.fillStyle(0xffffff, 0.75);
      g.fillRect(252, 0, 8, TEX_H);
    });
    const stars = this.genTex('stars', (g) => {
      // 뒤틀린 별 (십자/마름모)
      for (let i = 0; i < 30; i += 1) {
        const sx = (i * 173) % TEX_W;
        const sy = (i * 131) % TEX_H;
        const s = 3 + (i % 4) * 2;
        const c = i % 3 === 0 ? 0xffd75e : i % 3 === 1 ? 0xa06bff : 0xffffff;
        g.fillStyle(c, 0.9);
        g.fillTriangle(sx - s, sy, sx + s, sy, sx, sy - s * 0.4);
        g.fillTriangle(sx - s, sy, sx + s, sy, sx, sy + s * 0.4);
        g.fillTriangle(sx, sy - s, sx, sy + s, sx - s * 0.4, sy);
        g.fillTriangle(sx, sy - s, sx, sy + s, sx + s * 0.4, sy);
      }
    });
    const debris = this.genTex('debris', (g) => {
      g.fillStyle(0x241e4d, 1);
      for (let i = 0; i < 14; i += 1) {
        const dx = (i * 211) % TEX_W;
        const dy = 80 + ((i * 167) % 560);
        const s = 6 + (i % 5) * 4;
        g.fillTriangle(dx - s, dy, dx + s, dy - s * 0.5, dx + s * 0.3, dy + s);
        g.lineStyle(1, 0xa06bff, 0.6);
        g.strokeTriangle(dx - s, dy, dx + s, dy - s * 0.5, dx + s * 0.3, dy + s);
      }
    });
    const rays = this.genTex('rays', (g) => {
      // 균열 광선 (대각 반투명 빔)
      g.fillStyle(0xa06bff, 0.16);
      for (const [ox, w] of [
        [60, 26],
        [200, 40],
        [360, 22],
      ] as Array<[number, number]>) {
        g.fillTriangle(ox, 0, ox + w, 0, ox + w - 160, TEX_H);
        g.fillTriangle(ox, 0, ox + w - 160, TEX_H, ox - 160, TEX_H);
      }
      g.fillStyle(0xffffff, 0.12);
      g.fillTriangle(250, 0, 258, 0, 150, TEX_H);
      g.fillTriangle(250, 0, 150, TEX_H, 142, TEX_H);
    });
    const fore = this.genTex('fore', (g) => {
      g.fillStyle(0x05040f, 1);
      for (const [fx, fy, s] of [
        [100, 40, 1.4],
        [400, 640, 1.8],
        [300, 60, 1.0],
      ] as Array<[number, number, number]>) {
        g.fillTriangle(fx - 60 * s, fy, fx + 60 * s, fy, fx, fy + 120 * s);
      }
      g.fillStyle(0xa06bff, 0.5);
      g.fillRect(0, 0, TEX_W, 4);
      g.fillRect(0, TEX_H - 4, TEX_W, 4);
    });
    this.addLayer(sky, 5, -10);
    this.addLayer(stars, 14, -9);
    this.addLayer(debris, 48, -8);
    this.addLayer(rays, 90, -7, 0.9);
    this.addLayer(fore, 150, -6);
  }
}
