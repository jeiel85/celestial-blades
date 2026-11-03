import Phaser from 'phaser';
import UI_GLYPHS from 'virtual:ui-glyphs';
import { LOGO_FONT, LOGO_TEXT, UI_FONT } from '../GameConfig';
import { CHARACTERS } from '../data/characters';
import { STAGES } from '../data/stages';
import { STORY } from '../data/story';

// 게임의 모든 그림: 스프라이트(src/assets/sprites)와 배경(src/assets/backgrounds). 파일명이 곧 텍스처 키다.
// 원본은 art-raw/(Codex 이미지 생성)에서 tools/process_art.py로 가공한다.
// Vite가 해시 붙은 URL로 번들하므로 서비스워커 프리캐시 대상에도 포함된다.
const IMAGE_URLS = import.meta.glob<string>(
  ['../../assets/sprites/*.png', '../../assets/backgrounds/*.jpg', '../../assets/backgrounds/*.png'],
  { eager: true, query: '?url', import: 'default' },
);

// 코드가 키로 직접 참조하는 텍스처. 파일이 빠지면 Phaser가 조용히 '누락' 텍스처를 쓰므로 부팅 때 확인한다.
const REQUIRED_TEXTURES = [
  ...CHARACTERS.flatMap((c) => [c.texture, c.portrait, c.ending, c.cutin]),
  ...STORY.map((ch) => ch.image),
  'player_core',
  'shot_ki', 'shot_crescent', 'shot_flame', 'shot_seeker', 'shot_kunai', 'shot_arrow', 'shot_talisman',
  'eb_small', 'eb_mid', 'eb_big', 'eb_shard',
  'enemy_small', 'enemy_bat', 'enemy_rusher', 'enemy_turret', 'enemy_shield', 'enemy_spawner', 'enemy_elite',
  'enemy_fish', 'enemy_wisp',
  'midboss_ray', 'midboss_seg', 'midboss_dark', 'midboss_jelly', 'midboss_fox',
  'boss_iron', 'boss_engine', 'boss_engine_core', 'boss_dragon', 'boss_maiden', 'boss_lantern', 'lantern_orb',
  'final_human', 'final_beast',
  'item_p', 'item_b', 'item_l', 'item_g',
  'fx_spark', 'fx_smoke', 'fx_ring', 'fx_glow', 'fx_star',
  ...STAGES.flatMap((st) => [`bg_${st.theme}`, `layer_${st.theme}`]),
  'title_bg', 'title_logo', 'ui_menu_plate', 'ui_cursor', 'gear',
  'touch_stick_base', 'touch_stick_knob', 'touch_btn_attack', 'touch_btn_bomb', 'fx_warn_line',
];

function keyOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
}

/**
 * BootScene: 모든 그림을 로드하고 로고 글꼴을 받은 뒤 'Title'로 이동한다.
 */
export class BootScene extends Phaser.Scene {
  private readonly failedSprites: string[] = [];

  constructor() {
    super('Boot');
  }

  preload(): void {
    const label = this.add
      .text(640, 360, 'LOADING...', {
        fontFamily: UI_FONT,
        fontSize: '28px',
        color: '#8fd3ff',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failedSprites.push(file.key);
    });
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      label.setText(`LOADING... ${Math.round(p * 100)}%`);
    });

    for (const [path, url] of Object.entries(IMAGE_URLS)) this.load.image(keyOf(path), url);
  }

  create(): void {
    for (const key of REQUIRED_TEXTURES) {
      if (!this.textures.exists(key)) this.failedSprites.push(key);
    }
    if (this.failedSprites.length > 0) {
      // 스프라이트 없이 진행하면 적/조종사가 Phaser 기본 '누락' 텍스처로 보이므로 멈추고 알린다.
      console.error('스프라이트 로드 실패:', this.failedSprites);
      this.children.removeAll(true);
      this.add
        .text(640, 360, `그래픽 리소스를 불러오지 못했습니다.\n(${this.failedSprites.join(', ')})\n\n새로고침해 다시 시도해 주세요.`, {
          fontFamily: UI_FONT,
          fontSize: '22px',
          color: '#ff8f8f',
          align: 'center',
          lineSpacing: 10,
        })
        .setOrigin(0.5);
      return;
    }

    // 게임 전체는 pixelArt(최근접 보간)이지만, 채색 일러스트는 확대·축소(조종사 1.15배 등)에서
    // 계단 현상이 두드러지므로 선형 보간으로 그린다.
    for (const path of Object.keys(IMAGE_URLS)) {
      this.textures.get(keyOf(path)).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Phaser 텍스트는 생성 시점의 글꼴로 한 번 래스터화되므로, 화면에 쓰일 글자의 글꼴 조각을 받은 뒤 타이틀로 넘어간다.
    // 네트워크가 느리거나 실패하면 대체 글꼴로라도 진행한다(5초 상한).
    const fontReady = Promise.all([
      // 로고 글꼴은 타이틀 로고, 필살기 컷인 기술명, 스토리 장 제목·다시보기 화면에 쓴다.
      document.fonts.load(
        `92px ${LOGO_FONT}`,
        LOGO_TEXT +
          CHARACTERS.map((c) => c.bombName + c.nameKor).join('') +
          STORY.map((ch) => ch.title).join('') +
          '스토리 다시보기 종장의하늘？',
      ),
      document.fonts.load(`20px ${UI_FONT}`, UI_GLYPHS),
    ]).catch((err: unknown) => console.warn('글꼴 로드 실패:', err));
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 5000));
    void Promise.race([fontReady, timeout]).then(() => this.scene.start('Title'));
  }
}
