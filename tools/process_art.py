"""art-raw/ 의 생성 원본을 게임용 크기로 가공한다.

    python tools/process_art.py

- 스프라이트: 투명 여백을 잘라낸 뒤 비율을 유지해 목표 텍스처 크기 안에 맞추고 가운데 배치한다.
  목표 크기는 기존 텍스처 크기와 같다(히트박스가 프레임 크기를 기준으로 잡히므로 바꾸지 않는다).
- 배경: 1280x720으로 맞춰 자른 JPEG.
- 전경 레이어: 그림 띠를 잘라 1600x720 투명 PNG 아래쪽에 배치, 좌우 끝을 투명하게 페이드(가로 반복용).
원본이 없는 키는 건너뛰고 목록을 출력한다.
"""
from pathlib import Path
import sys

from PIL import Image, ImageChops

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
    # 모바일 터치 조작 UI
    "touch_stick_base": (140, 140),
    "touch_stick_knob": (64, 64),
    "touch_btn_attack": (108, 108),
    "touch_btn_bomb": (84, 84),
    # 레이저 경고선: 흰색 균일 빛줄기, 런타임에 길이·색을 바꿔 쓴다(엔딩 균열 기둥에도 사용)
    "fx_warn_line": (512, 32),
}
BACKGROUND_KEYS = [
    "bg_valley", "bg_city", "bg_fortress", "bg_rift", "title_bg",
    "ending_yun", "ending_ryeohwa", "ending_mooyoung", "ending_soyul", "ending_haerang",
    "bg_palace", "bg_market",
    "story_0", "story_1", "story_2", "story_3", "story_4", "story_5",
]
BG_SIZE = (1280, 720)
# 필살기 컷인 띠(가로로 아주 긴 일러스트)
CUTIN_KEYS = ["cutin_yun", "cutin_ryeohwa", "cutin_mooyoung", "cutin_soyul", "cutin_haerang"]
CUTIN_SIZE = (1280, 360)
# 가로로 반복되는 전경 레이어(투명 PNG). 높이를 화면 높이에 맞추고 좌우 끝을 투명하게 비워 이음매를 없앤다.
LAYER_KEYS = ["layer_valley", "layer_city", "layer_palace", "layer_fortress", "layer_market", "layer_rift"]
LAYER_EDGE = 0.04
LAYER_W = 1600
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


def fit_layer(src: Image.Image) -> Image.Image:
    """그림 띠를 잘라 폭 LAYER_W로 맞추고, 높이 720 투명 캔버스의 LAYER_CENTER_Y 위치에 놓는다."""
    img = src.convert("RGBA")
    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox is None:
        raise ValueError("완전히 투명한 이미지")
    img = img.crop((0, bbox[1], img.width, bbox[3]))
    img = img.resize((LAYER_W, round(img.height * LAYER_W / img.width)), Image.LANCZOS)
    # 좌우 가장자리 LAYER_EDGE 폭에서 알파를 0으로 서서히 줄인다(반복 시 잘린 형태가 보이지 않게).
    edge = max(1, round(img.width * LAYER_EDGE))
    ramp = Image.new("L", img.size, 255)
    px = ramp.load()
    for x in range(edge):
        v = round(255 * x / edge)
        for y in range(img.height):
            px[x, y] = v
            px[img.width - 1 - x, y] = v
    img.putalpha(ImageChops.multiply(img.getchannel("A"), ramp))
    th = BG_SIZE[1]
    out = Image.new("RGBA", (LAYER_W, th), (0, 0, 0, 0))
    top = min(th - img.height, max(0, round(th * LAYER_CENTER_Y - img.height / 2)))
    out.paste(img, (0, top))
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
    for key in BACKGROUND_KEYS:
        raw = RAW / f"{key}.png"
        if not raw.exists():
            missing.append(key)
            continue
        with Image.open(raw) as im:
            fit_background(im).save(BACKGROUNDS / f"{key}.jpg", quality=86, optimize=True, progressive=True)
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
