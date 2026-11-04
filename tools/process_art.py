"""art-raw/ 의 생성 원본을 게임용 크기로 가공한다.

    python tools/process_art.py

- 스프라이트: 투명 여백을 잘라낸 뒤 비율을 유지해 목표 텍스처 크기 안에 맞추고 가운데 배치한다.
  목표 크기는 기존 텍스처 크기와 같다(히트박스가 프레임 크기를 기준으로 잡히므로 바꾸지 않는다).
- 배경: 1280x720으로 맞춰 자른 JPEG.
- 스테이지 원경·전경 레이어(가로 반복): `<key>.png`와 그 뒤를 이어 그린 `<key>_2.png`, `<key>_3.png` ...를 차례로 이어
  한 바퀴 도는 높이 720 반복 타일로 만든다(make_loop). 레이어는 그림 띠를 잘라 투명 캔버스 아래쪽에 배치한다.
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
# 게임 중 가로로 흐르는 스테이지 원경. 이어 그린 장들을 높이 720으로 맞춰 이웃한 끝을 SKY_OVERLAP씩 겹쳐 잇는다
# (16:9 세 장이면 반복 주기 약 3,170px).
SKY_KEYS = ["bg_valley", "bg_city", "bg_palace", "bg_fortress", "bg_market", "bg_rift"]
SKY_OVERLAP = 224
# 캐릭터 선택 화면 기체(select_<id>)
SELECT_SIZE = (220, 170)
# 필살기 컷인 띠(가로로 아주 긴 일러스트)
CUTIN_KEYS = ["cutin_yun", "cutin_ryeohwa", "cutin_mooyoung", "cutin_soyul", "cutin_haerang", "cutin_hyegak", "cutin_seori"]
CUTIN_SIZE = (1280, 360)
# 가로로 반복되는 전경 레이어(투명 PNG). 이어 그린 장마다 그림 띠를 LAYER_W 폭으로 맞추고 이웃한 끝을 LAYER_OVERLAP씩
# 겹쳐 잇는다(반복 주기 = 장 수 x (LAYER_W - LAYER_OVERLAP), 세 장이면 4,080px).
LAYER_KEYS = ["layer_valley", "layer_city", "layer_palace", "layer_fortress", "layer_market", "layer_rift"]
LAYER_W = 1600
LAYER_OVERLAP = 240
LAYER_CENTER_Y = 0.72
# 반복 타일 한 장의 최대 폭. 모바일 GPU의 텍스처 한 변 상한(흔히 4096)을 넘으면 그리지 못한다.
MAX_TEXTURE_W = 4096


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


def _join(a: np.ndarray, b: np.ndarray, poisson: bool) -> np.ndarray:
    """앞 그림의 오른쪽 끝 a와 뒤 그림의 왼쪽 끝 b(같은 크기)를 겹쳐, 두 그림이 가장 비슷한 곳을 지나는 세로 경계로 잇는다.

    poisson=False면 경계 둘레 몇 px만 섞는다(투명 레이어용: 경계가 대개 빈 곳을 지나고, 알파는 기울기로 풀면 번진다).
    """
    overlap = a.shape[1]
    margin = 12
    cut = _min_cut(_box_blur(((a - b) ** 2).sum(2), 2), margin, overlap - margin - 1)
    if poisson:
        return _poisson_band(a, b, cut)
    feather = 3
    t = np.clip((np.arange(overlap)[None, :] - cut[:, None] + feather) / (2 * feather), 0, 1)[..., None]
    return a * (1 - t) + b * t


def make_loop(segments: list[np.ndarray], overlap: int, poisson: bool = True) -> np.ndarray:
    """그림 여러 장(같은 높이)을 차례로 이어 한 바퀴 도는 가로 반복 타일을 만든다(이미지 퀼팅). 폭 = Σ(장 폭 - overlap).

    이웃한 두 장은 끝 overlap 열씩 겹쳐 _join으로 잇고, 마지막 장은 첫 장으로 이어진다(한 장이면 자기 자신의 양 끝을 잇는다).
    타일은 [마지막→첫 장 띠, 첫 장 가운데, 첫→둘째 띠, 둘째 장 가운데, ...] 순서라 앞부분은 첫 장(원래 그림)의 구도를 지킨다.
    """
    parts = []
    for i, cur in enumerate(segments):
        parts.append(_join(segments[i - 1][:, -overlap:], cur[:, :overlap], poisson))
        parts.append(cur[:, overlap:-overlap])
    return np.clip(np.concatenate(parts, axis=1), 0, 1)


def loop_sources(key: str) -> list[Image.Image]:
    """반복 타일로 이을 원본: <key>.png 뒤에 이어 그린 <key>_2.png, <key>_3.png ...(있는 만큼, 번호 순)."""
    paths = [RAW / f"{key}.png"]
    while (RAW / f"{key}_{len(paths) + 1}.png").exists():
        paths.append(RAW / f"{key}_{len(paths) + 1}.png")
    images = []
    for path in paths:
        with Image.open(path) as im:
            images.append(im.copy())
    return images


def _check_width(key: str, width: int) -> None:
    if width > MAX_TEXTURE_W:
        raise ValueError(f"{key}: 반복 타일 폭 {width}px이 텍스처 상한 {MAX_TEXTURE_W}px을 넘습니다(이어 그린 장 수를 줄이세요)")


def fit_sky(key: str, sources: list[Image.Image]) -> Image.Image:
    """스테이지 원경: 여러 장을 높이 720으로 맞춰 한 바퀴 이어지는 반복 타일로 만든다.

    한 바퀴가 화면 폭(1280)보다 짧으면(한 장뿐일 때) 모두 같은 배율로 키워 가운데 720을 자른다 — 위아래가 잘리는 대신
    같은 그림이 한 화면에 두 번 보이지 않는다.
    """
    tw, th = BG_SIZE
    images = [src.convert("RGB") for src in sources]
    widths = [im.width * th / im.height for im in images]
    k = max(1.0, (tw + len(images) * SKY_OVERLAP) / sum(widths))
    segments = []
    for im, w in zip(images, widths):
        sw, sh = round(w * k), max(th, round(th * k))
        im = im.resize((sw, sh), Image.LANCZOS)
        top = (sh - th) // 2
        segments.append(np.asarray(im.crop((0, top, sw, top + th)), dtype=np.float64) / 255)
    loop = make_loop(segments, SKY_OVERLAP)
    _check_width(key, loop.shape[1])
    return Image.fromarray((loop * 255 + 0.5).astype(np.uint8))


def _layer_segment(src: Image.Image) -> np.ndarray:
    """그림 띠를 잘라 폭 LAYER_W로 맞추고 높이 720 캔버스의 LAYER_CENTER_Y 위치에 놓은, 알파를 곱한 RGBA 배열."""
    img = src.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("완전히 투명한 이미지")
    img = img.crop((0, bbox[1], img.width, bbox[3]))
    img = img.resize((LAYER_W, round(img.height * LAYER_W / img.width)), Image.LANCZOS)
    th = BG_SIZE[1]
    canvas = Image.new("RGBA", (LAYER_W, th), (0, 0, 0, 0))
    top = min(th - img.height, max(0, round(th * LAYER_CENTER_Y - img.height / 2)))
    canvas.paste(img, (0, top))
    # 투명한 곳의 색이 경계 찾기·섞기에 끼어들지 않도록 알파를 곱한 색으로 다룬다.
    arr = np.asarray(canvas, dtype=np.float64) / 255
    arr[..., :3] *= arr[..., 3:]
    return arr


def fit_layer(key: str, sources: list[Image.Image]) -> Image.Image:
    """전경 레이어: 여러 장을 한 바퀴 이어지는 높이 720 투명 반복 타일로 만든다."""
    loop = make_loop([_layer_segment(src) for src in sources], LAYER_OVERLAP, poisson=False)
    _check_width(key, loop.shape[1])
    alpha = loop[..., 3:]
    loop[..., :3] = np.where(alpha > 1e-6, loop[..., :3] / np.maximum(alpha, 1e-6), 0)
    return Image.fromarray((np.clip(loop, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")


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
        if key in SKY_KEYS:
            fitted = fit_sky(key, loop_sources(key))
        else:
            with Image.open(raw) as im:
                fitted = fit_background(im)
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
        # 레이어는 화면 전체 크기라 용량이 커서(장당 ~0.9MB) 256색 팔레트로 줄인다(~0.2MB).
        layer = fit_layer(key, loop_sources(key))
        layer.quantize(256, method=Image.Quantize.FASTOCTREE).save(BACKGROUNDS / f"{key}.png", optimize=True)
    if missing:
        print("원본 없음:", ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main())
