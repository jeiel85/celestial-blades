import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../GameConfig';
import type { ParallaxTheme } from '../data/stages';

export type { ParallaxTheme };

interface Layer {
  img: Phaser.GameObjects.TileSprite;
  speed: number;
}

/** 원경 일러스트가 흐르는 속도(px/s). 천문은 가운데 균열이 금방 지나가지 않게 아주 느리게. */
const SKY_SPEED: Record<ParallaxTheme, number> = {
  valley: 24,
  city: 18,
  palace: 26,
  fortress: 20,
  market: 18,
  rift: 8,
};

/** 테마별 속도감 입자(안개·불티·빗방울·빛 가루·도깨비불·파편). 서로 다른 속도로 흘러 깊이감을 준다. */
interface MoteStyle {
  tex: string;
  tints: number[];
  count: number;
  /** 가로 속도 범위(px/s, 왼쪽으로) — 배경 스크롤 배율을 따른다 */
  vx: [number, number];
  /** 세로 속도(px/s, +는 아래) — 보스전에서 스크롤이 멈춰도 그대로 */
  vy: [number, number];
  scale: [number, number];
  /** 진행 방향으로 늘이는 배율(빗줄기·파편 꼬리) */
  stretch: number;
  alpha: [number, number];
}

const MOTES: Record<ParallaxTheme, MoteStyle> = {
  valley: { tex: 'fx_smoke', tints: [0xffffff, 0xd8ecff], count: 14, vx: [40, 110], vy: [-4, 4], scale: [1.4, 3], stretch: 1, alpha: [0.06, 0.16] },
  city: { tex: 'fx_spark', tints: [0xffa060, 0xff7b2d, 0xffd75e], count: 40, vx: [80, 220], vy: [-40, -10], scale: [0.5, 1], stretch: 1.4, alpha: [0.35, 0.75] },
  palace: { tex: 'fx_spark', tints: [0x9fe8ff, 0xd8f4ff], count: 70, vx: [160, 220], vy: [480, 600], scale: [0.35, 0.5], stretch: 5, alpha: [0.2, 0.4] },
  fortress: { tex: 'fx_star', tints: [0xd8c8ff, 0xffffff], count: 32, vx: [30, 140], vy: [-6, 6], scale: [0.35, 0.9], stretch: 1, alpha: [0.25, 0.65] },
  market: { tex: 'fx_spark', tints: [0xffb070, 0xff7b2d, 0x8fd3ff], count: 34, vx: [50, 160], vy: [-30, -8], scale: [0.5, 1.1], stretch: 1.3, alpha: [0.3, 0.7] },
  rift: { tex: 'fx_spark', tints: [0xb08bff, 0xd8c8ff], count: 44, vx: [180, 440], vy: [-10, 10], scale: [0.4, 0.8], stretch: 5, alpha: [0.25, 0.55] },
};

interface Mote {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
}

function rand([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}

/**
 * 테마별 전경 레이어(`layer_<theme>`) 스크롤 속도(px/s)와 불투명도.
 * 전경은 탄막과 같은 높이를 지나가므로 탄 가독성을 위해 반투명으로 둔다
 * (특히 천문의 수정 파편은 탄과 헷갈리지 않도록 더 옅게).
 */
/**
 * 테마별 전경 레이어 스크롤 속도·투명도와, 원경·레이어 위에 덮는 어둡게(dim) 정도.
 * 배경은 밝고 채도 높은 일러스트라 그대로 두면 탄·기체와 섞인다. 탄막 슈팅의 관례대로 모든 테마를 눌러 두고,
 * 밝은 테마(운해 계곡의 흰 안개·해)와 소품이 촘촘한 테마(수몰용궁·백귀야시의 등롱·파도)는 더 누른다.
 */
const LAYER_STYLE: Record<ParallaxTheme, { speed: number; alpha: number; dim: number }> = {
  valley: { speed: 70, alpha: 0.5, dim: 0.42 },
  city: { speed: 55, alpha: 0.5, dim: 0.36 },
  palace: { speed: 75, alpha: 0.32, dim: 0.42 },
  fortress: { speed: 60, alpha: 0.45, dim: 0.36 },
  market: { speed: 50, alpha: 0.22, dim: 0.46 },
  rift: { speed: 80, alpha: 0.4, dim: 0.34 },
};

/** 도시 테마 회전 톱니 [x, y, scale] (`gear` 텍스처 256px 기준). */
const GEAR_SPOTS: Array<[number, number, number]> = [
  [950, 170, 0.8],
  [1120, 470, 0.55],
  [760, 560, 0.4],
];

/**
 * 스테이지 배경. 천천히 흐르는 원경 일러스트(`bg_<theme>`) 위에 전경 레이어(`layer_<theme>`)와
 * 테마별 속도감 입자를 흘리고, 도시 테마는 회전 톱니 3개를 더한다.
 * 원경과 레이어는 tools/process_art.py가 이어 그린 여러 장을 한 바퀴 이어 붙인 반복 타일이라 그대로 가로 반복한다
 * (반복 주기 원경 약 3,170px·레이어 4,080px — 같은 그림이 다시 오기까지 원경 2~6분, 레이어 50초~1분 20초).
 */
export class Parallax {
  private readonly layers: Layer[] = [];
  private readonly gears: Phaser.GameObjects.Image[] = [];
  private sky: Phaser.GameObjects.TileSprite | null = null;
  private readonly motes: Mote[] = [];
  private darkness: Phaser.GameObjects.Rectangle | null = null;
  private dim: Phaser.GameObjects.Rectangle | null = null;
  private mult = 1;

  constructor(private readonly scene: Phaser.Scene, private readonly theme: ParallaxTheme) {
    this.sky = scene.add.tileSprite(0, 0, WIDTH, HEIGHT, `bg_${theme}`).setOrigin(0).setDepth(-10);

    const layerKey = `layer_${theme}`;
    const src = scene.textures.get(layerKey).getSourceImage();
    // 레이어 그림 높이를 화면 높이에 맞추고, 가로는 같은 배율로 반복한다.
    const tileScale = HEIGHT / src.height;
    const img = scene.add
      .tileSprite(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, layerKey)
      .setTileScale(tileScale, tileScale)
      .setAlpha(LAYER_STYLE[theme].alpha)
      .setDepth(-7);
    this.layers.push({ img, speed: LAYER_STYLE[theme].speed });
    const dim = LAYER_STYLE[theme].dim;
    if (dim > 0) this.dim = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f, dim).setOrigin(0).setDepth(-6);

    if (theme === 'city') {
      for (const [gx, gy, s] of GEAR_SPOTS) {
        this.gears.push(scene.add.image(gx, gy, 'gear').setDepth(-8).setScale(s).setAlpha(0.55));
      }
    }

    const m = MOTES[theme];
    for (let i = 0; i < m.count; i += 1) {
      const vx = -rand(m.vx);
      const vy = rand(m.vy);
      const sc = rand(m.scale);
      const img = scene.add
        .image(Math.random() * WIDTH, Math.random() * HEIGHT, m.tex)
        .setTint(m.tints[i % m.tints.length])
        .setAlpha(rand(m.alpha))
        .setScale(sc * m.stretch, sc)
        .setRotation(Math.atan2(vy, vx) + Math.PI)
        .setDepth(-5);
      this.motes.push({ img, vx, vy });
    }

    // 보스 페이즈 어둠은 배경만 덮는다(탄·기체까지 어두워지면 피할 수 없는 어둠이 된다).
    this.darkness = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0).setOrigin(0).setDepth(-4).setVisible(false);
  }

  update(dtMs: number): void {
    const sec = dtMs / 1000;
    if (this.sky) this.sky.tilePositionX += SKY_SPEED[this.theme] * this.mult * sec;
    for (const m of this.motes) {
      const img = m.img;
      img.x += m.vx * this.mult * sec;
      img.y += m.vy * sec;
      if (img.x < -40) img.x = WIDTH + 40;
      else if (img.x > WIDTH + 40) img.x = -40;
      if (img.y > HEIGHT + 40) {
        img.y = -40;
        img.x = Math.random() * (WIDTH + 200);
      } else if (img.y < -40) {
        img.y = HEIGHT + 40;
      }
    }
    for (const layer of this.layers) {
      // tilePosition은 텍스처 좌표라 타일 배율로 나눠 화면 속도를 맞춘다.
      layer.img.tilePositionX += (layer.speed * this.mult * sec) / layer.img.tileScaleX;
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

  /** 스테이지3 보스 2페이즈용 배경 어둡게 (배경 위, 적·탄·기체 아래) */
  setDarkness(alpha: number): void {
    if (!this.darkness) return;
    const a = Math.max(0, Math.min(0.75, alpha));
    this.darkness.setVisible(a > 0.001);
    this.darkness.setFillStyle(0x000000, a);
  }

  destroy(): void {
    for (const layer of this.layers) layer.img.destroy();
    this.layers.length = 0;
    for (const gear of this.gears) gear.destroy();
    this.gears.length = 0;
    this.sky?.destroy();
    this.sky = null;
    for (const m of this.motes) m.img.destroy();
    this.motes.length = 0;
    this.darkness?.destroy();
    this.darkness = null;
    this.dim?.destroy();
    this.dim = null;
  }
}
