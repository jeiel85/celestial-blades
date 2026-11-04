"""art-raw/ 의 생성 원본을 게임용 크기로 가공한다.

    python tools/process_art.py

- 스프라이트: 투명 여백을 잘라낸 뒤 비율을 유지해 목표 텍스처 크기 안에 맞추고 가운데 배치한다.
  목표 크기는 기존 텍스처 크기와 같다(히트박스가 프레임 크기를 기준으로 잡히므로 바꾸지 않는다).
- 배경: 1280x720으로 맞춰 자른 JPEG. 스테이지 원경(가로 반복)은 좌우 끝이 이어지게 가공한다(make_tileable).
- 전경 레이어: 그림 띠를 잘라 투명 PNG(높이 720) 아래쪽에 배치하고, 좌우 끝이 이어지게 가공한다(가로 반복용).
원본이 없는 키는 건너뛰고 목록을 출력한다.
"""
from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "art-raw"
SPRITES = ROOT / "src" / "assets" / "sprites"
BACKGROUNDS = ROOT / "src" / "assets" / "backgrounds"

SPRITE_SIZES = {
    "player_yun": (88, 72),
    "player_ryeohwa": (88, 72),
    "player_mooyoung": (88, 72),
    "player_soyul": (88, 72),
    "player_haerang": (88, 72),
    "player_hyegak": (88, 72),
    "player_seori": (88, 72),
    # 식신(옵션): 게임에서 약 56px로 보인다
    "familiar_yun": (56, 56),
    "familiar_ryeohwa": (56, 56),
    "familiar_mooyoung": (56, 56),
    "familiar_soyul": (56, 56),
    "familiar_haerang": (56, 56),
    "familiar_hyegak": (56, 56),
    "familiar_seori": (56, 56),
    "enemy_small": (40, 36),
    "enemy_bat": (44, 32),
    "enemy_rusher": (48, 40),
    "enemy_turret": (56, 56),
    "enemy_shield": (52, 56),
    "enemy_spawner": (60, 60),
    "enemy_elite": (84, 72),
    "enemy_fish": (48, 36),
    "enemy_wisp": (44, 36),
    "midboss_ray": (220, 160),
    "midboss_seg": (56, 56),
    "midboss_dark": (72, 84),
    "boss_iron": (260, 200),
    "boss_engine": (320, 240),
    # 코어 노출 페이즈에서 크게 쓰이므로(168px) 그 크기로 만든다. 궤도 부품은 축소해서 쓴다.
    "boss_engine_core": (168, 168),
    "boss_maiden": (110, 150),
    "final_human": (90, 130),
    "final_beast": (380, 280),
    "midboss_jelly": (180, 170),
    "midboss_fox": (190, 150),
    "boss_dragon": (300, 220),
    "boss_lantern": (250, 230),
    "lantern_orb": (56, 56),
    "player_core": (12, 12),
    "shot_ki": (28, 10),
    "shot_crescent": (110, 44),
    "shot_flame": (26, 26),
    "shot_seeker": (18, 18),
    "shot_kunai": (26, 8),
    "shot_arrow": (40, 10),
    "shot_talisman": (22, 14),
    "shot_ring": (30, 30),
    "shot_foxfire": (26, 18),
    "shot_claw": (96, 48),
    # 적탄·이펙트는 흰색 바탕 그림이고 게임에서 setTint로 색을 입힌다.
    "eb_small": (12, 12),
    "eb_mid": (18, 18),
    "eb_big": (26, 26),
    "eb_shard": (20, 10),
    "fx_spark": (10, 10),
    "fx_smoke": (32, 32),
    "fx_ring": (64, 64),
    "fx_glow": (64, 64),
    "fx_star": (14, 14),
    "item_p": (24, 24),
    "item_b": (24, 24),
    "item_l": (24, 24),
    "item_g": (24, 24),
    "gear": (256, 256),
    # 캐릭터 선택 카드 초상화(카드 폭 300 안쪽)
    "portrait_yun": (220, 150),
    "portrait_ryeohwa": (220, 150),
    "portrait_mooyoung": (220, 150),
    "portrait_soyul": (220, 150),
    "portrait_haerang": (220, 150),
    "portrait_hyegak": (220, 150),
    "portrait_seori": (220, 150),
    # 모바일 터치 조작 UI
    "touch_stick_base": (140, 140),
    "touch_stick_knob": (64, 64),
    "touch_btn_attack": (108, 108),
    "touch_btn_bomb": (84, 84),
    # 레이저 경고선: 흰색 균일 빛줄기, 런타임에 길이·색을 바꿔 쓴다(엔딩 균열 기둥에도 사용)
    "fx_warn_line": (512, 32),
    # 타이틀 화면: 로고 글자 그림(약 560px 폭으로 표시, 고해상도 화면을 위해 여유 있게), 메뉴 명판·커서
    "title_logo": (720, 277),
    "ui_menu_plate": (480, 84),
    "ui_cursor": (64, 64),
}
BACKGROUND_KEYS = [
    "bg_valley", "bg_city", "bg_fortress", "bg_rift", "title_bg",
    "ending_yun", "ending_ryeohwa", "ending_mooyoung", "ending_soyul", "ending_haerang",
    "ending_hyegak", "ending_seori",
    "bg_palace", "bg_market",
    "story_0", "story_1", "story_2", "story_3", "story_4", "story_5",
]
BG_SIZE = (1280, 720)
# 게임 중 가로로 흐르는 스테이지 원경. 원본을 (1280 + SKY_OVERLAP) 폭으로 맞춘 뒤 좌우 끝 SKY_OVERLAP을 겹쳐
# 1280폭 반복 타일로 만든다(타일이 화면보다 좁으면 같은 그림이 한 화면에 두 번 보인다). 대신 위아래가 약 15% 잘린다.
SKY_KEYS = ["bg_valley", "bg_city", "bg_palace", "bg_fortress", "bg_market", "bg_rift"]
SKY_OVERLAP = 224
# 캐릭터 선택 화면 기체(select_<id>)
SELECT_SIZE = (220, 170)
# 필살기 컷인 띠(가로로 아주 긴 일러스트)
CUTIN_KEYS = ["cutin_yun", "cutin_ryeohwa", "cutin_mooyoung", "cutin_soyul", "cutin_haerang", "cutin_hyegak", "cutin_seori"]
CUTIN_SIZE = (1280, 360)
# 가로로 반복되는 전경 레이어(투명 PNG). 그림 띠를 LAYER_W 폭으로 맞추고 좌우 끝 LAYER_OVERLAP을 겹쳐 잇는다
# (반복 주기 = LAYER_W - LAYER_OVERLAP, 화면 폭 1280보다 넓게).
LAYER_KEYS = ["layer_valley", "layer_city", "layer_palace", "layer_fortress", "layer_market", "layer_rift"]
LAYER_W = 1600
LAYER_OVERLAP = 200
LAYER_CENTER_Y = 0.72


def fit_sprite(src: Image.Image, size: tuple[int, int]) -> Image.Image:
    img = src.convert("RGBA")
    # 거의 투명한 가장자리 노이즈는 잘라낼 경계 계산에서 제외
    alpha = img.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("완전히 투명한 이미지")
    img = img.crop(bbox)
    tw, th = size
    scale = min(tw / img.width, th / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    img = img.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    # 빈 투명 캔버스에 마스크 없이 붙여 원본 RGBA를 그대로 옮긴다(마스크를 주면 알파가 a²/255로 줄고 색이 어두워진다).
    out.paste(img, ((tw - nw) // 2, (th - nh) // 2))
    return out


def fit_background(src: Image.Image, size: tuple[int, int] = BG_SIZE) -> Image.Image:
    img = src.convert("RGB")
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (img.width - tw) // 2
    top = (img.height - th) // 2
    return img.crop((left, top, left + tw, top + th))


def _box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """2차원 배열 상자 흐림(가장자리는 끝값 연장)."""
    k = 2 * r + 1
    c = np.pad(a, r, mode="edge").cumsum(0)
    c = np.vstack([np.zeros((1, c.shape[1])), c])
    c = ((c[k:] - c[:-k]) / k).cumsum(1)
    c = np.hstack([np.zeros((c.shape[0], 1)), c])
    return (c[:, k:] - c[:, :-k]) / k


def _min_cut(err: np.ndarray, lo: int, hi: int, slope: int = 2) -> np.ndarray:
    """위에서 아래로 내려가는 경계(행마다 열 하나, 다음 행으로 최대 slope칸) 중 err 합이 가장 작은 것의 열 위치."""
    h, w = err.shape
    idx = np.arange(w)
    cost = np.full(w, np.inf)
    cost[lo:hi + 1] = err[0, lo:hi + 1]
    back = np.zeros((h, w), dtype=np.int64)
    for y in range(1, h):
        best = np.full(w, np.inf)
        arg = idx.copy()
        for d in range(-slope, slope + 1):
            shifted = np.full(w, np.inf)
            if d < 0:
                shifted[-d:] = cost[:d]
            elif d > 0:
                shifted[:-d] = cost[d:]
            else:
                shifted = cost.copy()
            # 옆으로 움직일수록 조금 비싸게 매겨 곧은 경계를 고른다
            shifted += abs(d) * 0.02
            better = shifted < best
            best[better] = shifted[better]
            arg[better] = idx[better] + d
        cost = np.full(w, np.inf)
        cost[lo:hi + 1] = best[lo:hi + 1] + err[y, lo:hi + 1]
        back[y] = arg
    cut = np.zeros(h, dtype=np.int64)
    cut[-1] = int(cost.argmin())
    for y in range(h - 1, 0, -1):
        cut[y - 1] = back[y, cut[y]]
    return cut


def _poisson_band(a: np.ndarray, b: np.ndarray, cut: np.ndarray) -> np.ndarray:
    """경계 왼쪽은 a, 오른쪽은 b의 기울기를 따르고 양 끝은 띠 바깥 그림에 이어지는 띠를 푼다(행렬 없는 켤레 기울기법).

    색을 반투명하게 섞으면 한쪽에만 있는 건물이 유령처럼 비친다. 기울기로 합치면 그림은 경계에서 또렷이 갈리고
    밝기·색 차이만 띠 전체에 고르게 퍼진다.
    """
    h, o, _ = a.shape
    on_b = np.arange(o)[None, :] >= cut[:, None]

    def guide(ga: np.ndarray, gb: np.ndarray, s0: np.ndarray, s1: np.ndarray) -> np.ndarray:
        both_b = (s0 & s1)[..., None]
        both_a = (~s0 & ~s1)[..., None]
        return np.where(both_b, gb, np.where(both_a, ga, 0.5 * (ga + gb)))

    gx = guide(a[:, 1:] - a[:, :-1], b[:, 1:] - b[:, :-1], on_b[:, :-1], on_b[:, 1:])
    gy = guide(a[1:] - a[:-1], b[1:] - b[:-1], on_b[:-1], on_b[1:])
    rhs = np.zeros_like(a)
    rhs[:, :-1] -= gx
    rhs[:, 1:] += gx
    rhs[:-1] -= gy
    rhs[1:] += gy
    # 띠 바깥 이웃은 고정값이다: 왼쪽 = 타일 마지막 열(a 바로 앞 그림), 오른쪽 = 띠 다음 열(b 바로 뒤 그림).
    # 우변으로 옮기는 값(이웃값 + 원래 그림의 기울기)은 a의 첫 열, b의 마지막 열과 같다.
    rhs[:, :1] += a[:, :1]
    rhs[:, -1:] += b[:, -1:]
    deg = np.full((h, 1, 1), 4.0)
    deg[0] = deg[-1] = 3.0

    def lap(u: np.ndarray) -> np.ndarray:
        out = deg * u
        out[:, 1:] -= u[:, :-1]
        out[:, :-1] -= u[:, 1:]
        out[1:] -= u[:-1]
        out[:-1] -= u[1:]
        return out

    u = np.where(on_b[..., None], b, a)
    r = rhs - lap(u)
    p = r.copy()
    rs = rs0 = float((r * r).sum())
    for _ in range(5000):
        if rs <= rs0 * 1e-10:
            break
        ap = lap(p)
        alpha = rs / float((p * ap).sum())
        u += alpha * p
        r -= alpha * ap
        rn = float((r * r).sum())
        p = r + (rn / rs) * p
        rs = rn
    return u


def make_tileable(src: np.ndarray, overlap: int, poisson: bool = True) -> np.ndarray:
    """가로 반복 타일을 만든다(이미지 퀼팅). 폭이 overlap만큼 줄어든다.

    타일 앞부분 overlap 열은 원본 오른쪽 끝(타일 마지막 열에서 이어지는 그림)과 왼쪽 끝(타일 overlap 열로 이어지는 그림)을
    겹친 띠다. 두 그림이 가장 비슷한 곳을 지나는 세로 경계를 찾아 왼쪽은 오른쪽 끝, 오른쪽은 왼쪽 끝 그림으로 채운다.
    poisson=False면 경계 둘레 몇 px만 섞는다(투명 레이어용: 경계가 대개 빈 곳을 지나고, 알파는 기울기로 풀면 번진다).
    """
    h, w, _ = src.shape
    wt = w - overlap
    a = src[:, wt:]
    b = src[:, :overlap]
    margin = 12
    cut = _min_cut(_box_blur(((a - b) ** 2).sum(2), 2), margin, overlap - margin - 1)
    out = src[:, :wt].copy()
    if poisson:
        out[:, :overlap] = _poisson_band(a, b, cut)
    else:
        feather = 3
        t = np.clip((np.arange(overlap)[None, :] - cut[:, None] + feather) / (2 * feather), 0, 1)[..., None]
        out[:, :overlap] = a * (1 - t) + b * t
    return np.clip(out, 0, 1)


def fit_sky(src: Image.Image) -> Image.Image:
    """스테이지 원경: 폭 1280 + SKY_OVERLAP으로 맞춰 가운데 720을 자른 뒤 1280x720 반복 타일로 만든다."""
    img = src.convert("RGB")
    tw, th = BG_SIZE
    ws = tw + SKY_OVERLAP
    img = img.resize((ws, max(th, round(img.height * ws / img.width))), Image.LANCZOS)
    top = (img.height - th) // 2
    arr = np.asarray(img.crop((0, top, ws, top + th)), dtype=np.float64) / 255
    return Image.fromarray((make_tileable(arr, SKY_OVERLAP) * 255 + 0.5).astype(np.uint8))


def fit_layer(src: Image.Image) -> Image.Image:
    """그림 띠를 잘라 폭 LAYER_W로 맞춰 반복 타일로 만들고, 높이 720 투명 캔버스의 LAYER_CENTER_Y 위치에 놓는다."""
    img = src.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("완전히 투명한 이미지")
    img = img.crop((0, bbox[1], img.width, bbox[3]))
    img = img.resize((LAYER_W, round(img.height * LAYER_W / img.width)), Image.LANCZOS)
    # 투명한 곳의 색이 경계 찾기·섞기에 끼어들지 않도록 알파를 곱한 색으로 다룬다.
    arr = np.asarray(img, dtype=np.float64) / 255
    arr[..., :3] *= arr[..., 3:]
    tiled = make_tileable(arr, LAYER_OVERLAP, poisson=False)
    alpha = tiled[..., 3:]
    tiled[..., :3] = np.where(alpha > 1e-6, tiled[..., :3] / np.maximum(alpha, 1e-6), 0)
    band = Image.fromarray((np.clip(tiled, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    th = BG_SIZE[1]
    out = Image.new("RGBA", (band.width, th), (0, 0, 0, 0))
    top = min(th - band.height, max(0, round(th * LAYER_CENTER_Y - band.height / 2)))
    out.paste(band, (0, top))
    return out


def main() -> int:
    SPRITES.mkdir(parents=True, exist_ok=True)
    BACKGROUNDS.mkdir(parents=True, exist_ok=True)
    missing = []
    for key, size in SPRITE_SIZES.items():
        raw = RAW / f"{key}.png"
        if not raw.exists():
            missing.append(key)
            continue
        with Image.open(raw) as im:
            if im.mode != "RGBA" or im.getchannel("A").getextrema()[0] == 255:
                print(f"경고: {key} 원본에 투명 배경이 없습니다", file=sys.stderr)
            fit_sprite(im, size).save(SPRITES / f"{key}.png", optimize=True)
    # 캐릭터 선택 화면의 큰 기체: 같은 조종사 원본을 더 크게 가공(인게임 88x72를 키우면 흐려진다).
    for key in [k for k in SPRITE_SIZES if k.startswith("player_") and k != "player_core"]:
        raw = RAW / f"{key}.png"
        if not raw.exists():
            missing.append(key)
            continue
        with Image.open(raw) as im:
            fit_sprite(im, SELECT_SIZE).save(SPRITES / f"select_{key[len('player_'):]}.png", optimize=True)
    for key in BACKGROUND_KEYS:
        raw = RAW / f"{key}.png"
        if not raw.exists():
            missing.append(key)
            continue
        with Image.open(raw) as im:
            fitted = fit_sky(im) if key in SKY_KEYS else fit_background(im)
            fitted.save(BACKGROUNDS / f"{key}.jpg", quality=86, optimize=True, progressive=True)
    for key in CUTIN_KEYS:
        raw = RAW / f"{key}.png"
        if not raw.exists():
            missing.append(key)
            continue
        with Image.open(raw) as im:
            fit_background(im, CUTIN_SIZE).save(BACKGROUNDS / f"{key}.jpg", quality=88, optimize=True, progressive=True)
    for key in LAYER_KEYS:
        raw = RAW / f"{key}.png"
        if not raw.exists():
            missing.append(key)
            continue
        with Image.open(raw) as im:
            # 레이어는 화면 전체 크기라 용량이 커서(장당 ~0.9MB) 256색 팔레트로 줄인다(~0.2MB).
            fit_layer(im).quantize(256, method=Image.Quantize.FASTOCTREE).save(BACKGROUNDS / f"{key}.png", optimize=True)
    if missing:
        print("원본 없음:", ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
