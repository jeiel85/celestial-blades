import Phaser from 'phaser';

/**
 * 탄막 가독성용 텍스처를 처음 쓸 때 만들어 텍스처 매니저에 둔다(키가 곧 캐시, 씬이 바뀌어도 재사용).
 *
 * - 적탄: 원본에 tint만 곱하면 탄 전체가 한 색으로 뭉개져 같은 색의 배경 소품(등롱·노을·해)과 섞인다.
 *   탄막 슈팅의 관례대로 흰 심 + 색 몸통 + 어두운 외곽선으로 다시 그려 밝은 배경·어두운 배경 어디서나 보이게 한다.
 * - 기체 테두리: 실루엣을 넓혀 안쪽은 밝은 천명사 색, 바깥은 어두운 두 겹 테두리를 만든다. 기체 뒤에 깔아
 *   세밀한 배경 그림과 떼어 놓는다.
 */

/** 적탄 외곽선 두께(px). 판정은 원본 크기(색 몸통)라 외곽선은 여유 공간이다. */
export const BULLET_SKIN_PAD = 2;
/** 기체 테두리 두께(px): 밝은 안쪽 + 어두운 바깥 */
const RIM_PAD = 3;
const RIM_LIGHT = 1.6;
const RIM_DARK = 0x0a0814;

interface Pixels {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

/**
 * 원본 픽셀. 캔버스에서 다시 읽어 오는 일(getImageData)이 새 색 하나를 만드는 비용의 대부분이라 원본마다 한 번만 읽는다.
 * 원본 탄은 몇 종류뿐이고 앱이 떠 있는 동안 바뀌지 않는다.
 */
const pixelCache = new Map<string, Pixels>();

function readPixels(scene: Phaser.Scene, key: string): Pixels | null {
  const cached = pixelCache.get(key);
  if (cached) return cached;
  if (!scene.textures.exists(key)) return null;
  const img = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const px = { data: ctx.getImageData(0, 0, w, h).data, w, h };
  pixelCache.set(key, px);
  return px;
}

function addTexture(scene: Phaser.Scene, key: string, w: number, h: number, data: Uint8ClampedArray): void {
  // WebGL은 픽셀 배열을 그대로 올린다. 캔버스를 거치면 새 색 하나에 1.5~2ms(144Hz 한 프레임의 4분의 1)가 든다.
  if (scene.sys.game.renderer.type === Phaser.WEBGL) {
    scene.textures.addUint8Array(key, new Uint8Array(data.buffer), w, h);
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const out = ctx.createImageData(w, h);
  out.data.set(data);
  ctx.putImageData(out, 0, 0);
  scene.textures.addCanvas(key, canvas);
}

const channels = (c: number): [number, number, number] => [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255];

/**
 * 원본 탄 텍스처와 색으로 읽기 쉬운 적탄 텍스처를 만들고 키를 돌려준다. 원본보다 사방 BULLET_SKIN_PAD만큼 크다.
 * 원본을 읽을 수 없으면(텍스처 누락) 원본 키를 그대로 돌려준다 — 그때는 tint로 칠한다.
 */
export function enemyBulletSkin(scene: Phaser.Scene, tex: string, tint: number): string {
  const key = `${tex}~eb~${tint.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const src = readPixels(scene, tex);
  if (!src) return tex;
  const P = BULLET_SKIN_PAD;
  const w = src.w + P * 2;
  const h = src.h + P * 2;
  const [tr, tg, tb] = channels(tint);
  const rawA = (x: number, y: number): number => {
    const sx = x - P;
    const sy = y - P;
    if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) return 0;
    return src.data[(sy * src.w + sx) * 4 + 3] / 255;
  };
  const out = new Uint8ClampedArray(w * h * 4);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = rawA(x, y);
      // 몸통: 원본 색의 비율(흰 원본이면 tint 그대로, 색 원본이면 원래 색)에 tint를 곱하고, 가운데로 갈수록 희게
      let r = tr;
      let g = tg;
      let b = tb;
      if (a > 0) {
        const i = ((y - P) * src.w + (x - P)) * 4;
        const m = Math.max(src.data[i], src.data[i + 1], src.data[i + 2], 1);
        r *= src.data[i] / m;
        g *= src.data[i + 1] / m;
        b *= src.data[i + 2] / m;
      }
      const d = Math.hypot((x + 0.5 - cx) / (src.w / 2), (y + 0.5 - cy) / (src.h / 2));
      const core = Math.min(1, Math.max(0, (0.6 - d) / 0.25)) * 0.9;
      r += (1 - r) * core;
      g += (1 - g) * core;
      b += (1 - b) * core;
      const bodyA = Math.min(1, a * 1.5);
      // 외곽선: P px 안에 원본이 있으면 어둡게(탄 색을 조금 섞어 검은 구멍처럼 보이지 않게)
      let near = 0;
      for (let dy = -P; dy <= P; dy += 1) {
        for (let dx = -P; dx <= P; dx += 1) {
          if (dx * dx + dy * dy <= (P + 0.5) * (P + 0.5)) near = Math.max(near, rawA(x + dx, y + dy));
        }
      }
      const lineA = Math.min(1, near * 1.5) * 0.85;
      const outA = bodyA + lineA * (1 - bodyA);
      const o = (y * w + x) * 4;
      if (outA <= 0) continue;
      const k = (lineA * (1 - bodyA)) / outA;
      out[o] = 255 * (r * (1 - k) + (0.04 + tr * 0.16) * k);
      out[o + 1] = 255 * (g * (1 - k) + (0.03 + tg * 0.16) * k);
      out[o + 2] = 255 * (b * (1 - k) + (0.06 + tb * 0.16) * k);
      out[o + 3] = 255 * outA;
    }
  }
  addTexture(scene, key, w, h, out);
  return key;
}

/**
 * 기체 그림 둘레에 두 겹 테두리(안쪽 밝은 color, 바깥 어두운 남색)만 그린 텍스처를 만들고 키를 돌려준다.
 * 원본보다 사방 RIM_PAD만큼 크므로 같은 위치·배율·회전으로 기체 뒤에 깔면 맞는다. 원본을 읽을 수 없으면 null.
 */
export function outlineSkin(scene: Phaser.Scene, tex: string, color: number): string | null {
  const key = `${tex}~rim`;
  if (scene.textures.exists(key)) return key;
  const src = readPixels(scene, tex);
  if (!src) return null;
  const P = RIM_PAD;
  const w = src.w + P * 2;
  const h = src.h + P * 2;
  const solid = (x: number, y: number): boolean => {
    const sx = x - P;
    const sy = y - P;
    if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) return false;
    return src.data[(sy * src.w + sx) * 4 + 3] >= 128;
  };
  const [cr, cg, cb] = channels(color).map((v) => v + (1 - v) * 0.55);
  const [dr, dg, db] = channels(RIM_DARK);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (solid(x, y)) continue;
      let dist = Infinity;
      for (let dy = -P; dy <= P; dy += 1) {
        for (let dx = -P; dx <= P; dx += 1) {
          if (solid(x + dx, y + dy)) dist = Math.min(dist, Math.hypot(dx, dy));
        }
      }
      if (dist > P + 0.5) continue;
      const o = (y * w + x) * 4;
      if (dist <= RIM_LIGHT) {
        out[o] = 255 * cr;
        out[o + 1] = 255 * cg;
        out[o + 2] = 255 * cb;
        out[o + 3] = 240;
      } else {
        out[o] = 255 * dr;
        out[o + 1] = 255 * dg;
        out[o + 2] = 255 * db;
        out[o + 3] = 255 * 0.75 * Math.min(1, P + 0.5 - dist + 0.5);
      }
    }
  }
  addTexture(scene, key, w, h, out);
  return key;
}
