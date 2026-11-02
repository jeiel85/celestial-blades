import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../GameConfig';
import type { ParallaxTheme } from '../data/stages';

export type { ParallaxTheme };

interface Layer {
  img: Phaser.GameObjects.TileSprite;
  speed: number;
}

/**
 * 테마별 전경 레이어(`layer_<theme>`) 스크롤 속도(px/s)와 불투명도.
 * 전경은 탄막과 같은 높이를 지나가므로 탄 가독성을 위해 반투명으로 둔다
 * (특히 천문의 수정 파편은 탄과 헷갈리지 않도록 더 옅게).
 */
const LAYER_STYLE: Record<ParallaxTheme, { speed: number; alpha: number }> = {
  valley: { speed: 70, alpha: 0.6 },
  city: { speed: 55, alpha: 0.6 },
  fortress: { speed: 60, alpha: 0.55 },
  rift: { speed: 80, alpha: 0.4 },
};

/** 도시 테마 회전 톱니 [x, y, scale] (`gear` 텍스처 256px 기준). */
const GEAR_SPOTS: Array<[number, number, number]> = [
  [950, 170, 0.8],
  [1120, 470, 0.55],
  [760, 560, 0.4],
];

/**
 * 스테이지 배경. 고정 원경 일러스트(`bg_<theme>`) 1장 위에 가로로 반복되는
 * 전경 레이어(`layer_<theme>`)를 스크롤하고, 도시 테마는 회전 톱니 3개를 더한다.
 * 모든 텍스처는 BootScene에서 로드한 그림(art-raw → tools/process_art.py)이다.
 */
export class Parallax {
  private readonly layers: Layer[] = [];
  private readonly gears: Phaser.GameObjects.Image[] = [];
  private sky: Phaser.GameObjects.Image | null = null;
  private darkness: Phaser.GameObjects.Rectangle | null = null;
  private mult = 1;

  constructor(private readonly scene: Phaser.Scene, private readonly theme: ParallaxTheme) {
    this.sky = scene.add.image(0, 0, `bg_${theme}`).setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setDepth(-10);

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

    if (theme === 'city') {
      for (const [gx, gy, s] of GEAR_SPOTS) {
        this.gears.push(scene.add.image(gx, gy, 'gear').setDepth(-8).setScale(s).setAlpha(0.55));
      }
    }

    this.darkness = scene.add.rectangle(0, 0, WIDTH, HEIGHT, 0x000000, 0).setOrigin(0).setDepth(450).setVisible(false);
  }

  update(dtMs: number): void {
    const sec = dtMs / 1000;
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

  /** 스테이지3 보스 2페이즈용 화면 어둡게 (HUD 아래, 월드 위) */
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
    this.darkness?.destroy();
    this.darkness = null;
  }
}
