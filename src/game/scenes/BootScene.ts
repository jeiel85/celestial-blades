import Phaser from 'phaser';
import UI_GLYPHS from 'virtual:ui-glyphs';
import { LOGO_FONT, LOGO_TEXT, UI_FONT } from '../GameConfig';
import { CHARACTERS } from '../data/characters';
import { STAGES } from '../data/stages';
import { STORY } from '../data/story';
import { BOSS_DEFS } from '../data/bossPatterns';

// 게임의 모든 그림: 스프라이트(src/assets/sprites)와 배경(src/assets/backgrounds). 파일명이 곧 텍스처 키다.
// 원본은 art-raw/(Codex 이미지 생성)에서 tools/process_art.py로 가공한다.
// Vite가 해시 붙은 URL로 번들하므로 서비스워커 프리캐시 대상에도 포함된다.
const IMAGE_URLS = import.meta.glob<string>(
  ['../../assets/sprites/*.png', '../../assets/backgrounds/*.jpg', '../../assets/backgrounds/*.png'],
  { eager: true, query: '?url', import: 'default' },
);

// 코드가 키로 직접 참조하는 텍스처. 파일이 빠지면 Phaser가 조용히 '누락' 텍스처를 쓰므로 부팅 때 확인한다.
const REQUIRED_TEXTURES = [
  ...CHARACTERS.flatMap((c) => [c.texture, c.portrait, c.select, c.familiar, c.ending, c.cutin]),
  ...STORY.map((ch) => ch.image),
  'player_core',
  'shot_ki', 'shot_crescent', 'shot_flame', 'shot_seeker', 'shot_kunai', 'shot_arrow', 'shot_talisman', 'shot_ring', 'shot_foxfire', 'shot_claw',
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

const URL_BY_KEY = new Map(Object.entries(IMAGE_URLS).map(([path, url]) => [keyOf(path), url]));

/**
 * 받지 못한 그림을 다시 받기 전에 기다리는 시간(ms), 차례대로 최대 세 번.
 * 배포 직후 CDN이 한 장에 일시 오류(HTTP 503)를 내는 일이 있는데, 곧바로 다시 받으면 대개 받아진다.
 */
const RETRY_DELAYS_MS = [500, 1500, 3000];

/**
 * BootScene: 모든 그림을 로드하고(실패한 그림은 다시 받기) 로고 글꼴을 받은 뒤 'Title'로 이동한다.
 */
export class BootScene extends Phaser.Scene {
  /** 끝내 받지 못했거나 번들에 없는 그림 키(오류 화면에 표시) */
  private readonly failedSprites: string[] = [];
  /** 이번 로드에서 받지 못해 다시 받을 그림 키 */
  private readonly retryKeys = new Set<string>();
  private label!: Phaser.GameObjects.Text;

  constructor() {
    super('Boot');
  }

  preload(): void {
    this.label = this.add
      .text(640, 360, 'LOADING...', {
        fontFamily: UI_FONT,
        fontSize: '28px',
        color: '#8fd3ff',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.retryKeys.add(file.key);
    });
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => {
      this.label.setText(`LOADING... ${Math.round(p * 100)}%`);
    });

    for (const [key, url] of URL_BY_KEY) this.load.image(key, url);
  }

  create(): void {
    void this.retryFailed().then(() => this.finishBoot());
  }

  /** 받지 못한 그림만 RETRY_DELAYS_MS 간격으로 다시 받는다. 다 받거나 횟수를 다 쓰면 남은 키를 실패로 넘긴다. */
  private async retryFailed(): Promise<void> {
    if (this.retryKeys.size === 0) return;
    // 다시 받는 동안의 진행률(재시도 몇 장 기준)이 전체 진행률처럼 보이지 않게 끈다.
    this.load.off(Phaser.Loader.Events.PROGRESS);
    for (let i = 0; i < RETRY_DELAYS_MS.length && this.retryKeys.size > 0; i += 1) {
      this.label.setText(`그림을 다시 받는 중... (${i + 1}/${RETRY_DELAYS_MS.length})`);
      await new Promise<void>((resolve) => window.setTimeout(resolve, RETRY_DELAYS_MS[i]));
      const keys = [...this.retryKeys];
      this.retryKeys.clear();
      console.warn(`그림 다시 받기 ${i + 1}/${RETRY_DELAYS_MS.length}:`, keys);
      for (const key of keys) this.load.image(key, URL_BY_KEY.get(key));
      await new Promise<void>((resolve) => {
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        this.load.start();
      });
    }
    this.failedSprites.push(...this.retryKeys);
  }

  private finishBoot(): void {
    for (const key of REQUIRED_TEXTURES) {
      if (!this.textures.exists(key) && !this.failedSprites.includes(key)) this.failedSprites.push(key);
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
    for (const key of URL_BY_KEY.keys()) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Phaser 텍스트는 생성 시점의 글꼴로 한 번 래스터화되므로, 화면에 쓰일 글자의 글꼴 조각을 받은 뒤 타이틀로 넘어간다.
    // 네트워크가 느리거나 실패하면 대체 글꼴로라도 진행한다(5초 상한).
    const fontReady = Promise.all([
      // 로고 글꼴은 타이틀 로고, 필살기 컷인 기술명, 스토리 장 제목·다시보기 화면, 보스 체력바 이름에 쓴다.
      document.fonts.load(
        `92px ${LOGO_FONT}`,
        LOGO_TEXT +
          CHARACTERS.map((c) => c.bombName + c.nameKor).join('') +
          STORY.map((ch) => ch.title).join('') +
          Object.values(BOSS_DEFS)
            .flatMap((b) => [b.displayName, ...Object.values(b.phaseNames ?? {})])
            .join('') +
          '스토리 다시보기 종장의하늘？',
      ),
      document.fonts.load(`20px ${UI_FONT}`, UI_GLYPHS),
    ]).catch((err: unknown) => console.warn('글꼴 로드 실패:', err));
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 5000));
    void Promise.race([fontReady, timeout]).then(() => this.scene.start('Title'));
  }
}
