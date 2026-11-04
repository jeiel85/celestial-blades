import Phaser from 'phaser';
import { HEIGHT, UI_FONT, WIDTH } from '../GameConfig';
import { DIFFICULTIES } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { isMobileDevice } from '../systems/Assist';

const FONT = UI_FONT;
const MENU = ['START GAME', 'RANKING', 'STORY', 'HOW TO PLAY', 'SETTINGS'] as const;
/** 왼쪽 단(로고·메뉴)의 가운데 x. 키 아트는 오른쪽에 인물을, 왼쪽을 비워 그렸다. */
const COL_X = 244;
const MENU_Y = 352;
const MENU_GAP = 56;
/** 로고 그림(720px)을 약 470px 폭으로 */
const LOGO_SCALE = 0.66;
/** 설정 줄: 첫 줄 y와 간격 */
const SETTINGS_Y = 206;
const SETTINGS_GAP = 36;
/** 어시스트 줄을 고르면 아래에 보여 줄 설명 */
const ASSIST_HELP = {
  shot: '공격키 없이도 기본 공격을 계속 쏩니다. 차지는 공격키를 누르고 있다 떼서 씁니다.',
  bomb: '맞는 순간 필살기가 남아 있으면 대신 터뜨려 목숨을 지킵니다.',
  dodge: '곧 맞을 길로 가면 기체가 알아서 비켜 갑니다. 빽빽한 탄막은 다 못 피할 수 있어요.',
};

interface Star {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/**
 * 타이틀 씬 (키 'Title').
 * 왼쪽 단에 로고(Codex 그림)·HI-SCORE·메뉴, 오른쪽은 키 아트. 키보드/마우스/터치 지원.
 */
export class TitleScene extends Phaser.Scene {
  private save!: SaveSystem;
  private audio!: AudioSystem;
  private menuIndex = 0;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private hiText!: Phaser.GameObjects.Text;
  private menuPlate!: Phaser.GameObjects.Image;
  private menuCursor!: Phaser.GameObjects.Image;
  private overlay: 'howto' | 'settings' | 'notice' | null = null;
  private overlayBox: Phaser.GameObjects.Container | null = null;
  private settingsRowsBox: Phaser.GameObjects.Container | null = null;
  private settingsIndex = 0;
  /** 설정 아래에 잠깐 띄울 알림(전체화면 미지원 등) */
  private settingsNote = '';
  private stars: Star[] = [];

  constructor() {
    super('Title');
  }

  create(): void {
    this.save = new SaveSystem();
    this.audio = new AudioSystem();
    const s = this.save.settings;
    this.audio.setMasterVolume(s.masterVol);
    this.audio.setSfxVolume(s.sfxVol);
    this.audio.setMusicVolume(s.musicVol);
    this.audio.resume();
    try {
      this.input.once('pointerdown', () => this.audio.resume());
      this.input.keyboard?.once('keydown', () => this.audio.resume());
    } catch {
      // 무시
    }

    this.menuIndex = 0;
    this.overlay = null;
    this.overlayBox = null;
    this.settingsRowsBox = null;
    this.menuTexts = [];
    this.stars = [];

    this.buildBackground();
    this.buildLogo();
    this.buildMenu();
    this.setRepoLinkVisible(true);

    // 전체화면 요청은 비동기라 바뀐 뒤(브라우저 ESC로 나간 경우 포함)에 설정 글자를 다시 그린다.
    const onFullscreen = (): void => this.refreshSettings();
    const onFullscreenFail = (): void => {
      this.settingsNote = '이 브라우저에서는 전체화면을 쓸 수 없어요';
      this.refreshSettings();
    };
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onFullscreen);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFullscreen);
    this.scale.on(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, onFullscreenFail);
    this.scale.on(Phaser.Scale.Events.FULLSCREEN_FAILED, onFullscreenFail);

    // 모바일은 어시스트가 처음부터 켜져 있으므로 처음 한 번 꼭 알린다.
    if (isMobileDevice() && !this.save.assistNoticeSeen) this.openAssistNotice();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, onFullscreen);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFullscreen);
      this.scale.off(Phaser.Scale.Events.FULLSCREEN_UNSUPPORTED, onFullscreenFail);
      this.scale.off(Phaser.Scale.Events.FULLSCREEN_FAILED, onFullscreenFail);
      this.setRepoLinkVisible(false);
      try {
        this.audio.stopMusic();
        this.audio.dispose();
      } catch {
        // 무시
      }
      this.stars = [];
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(100, Math.max(1, delta)) / 1000;
    for (const st of this.stars) {
      st.img.y += st.speed * dt;
      st.img.x -= st.speed * 0.35 * dt;
      if (st.img.y > HEIGHT + 20) {
        st.img.y = -20;
        st.img.x = Math.random() * WIDTH;
      }
      if (st.img.x < -20) st.img.x = WIDTH + 20;
    }

    const kb = this.input.keyboard;
    if (!kb) return;
    if (Phaser.Input.Keyboard.JustDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.M))) {
      this.audio.toggleMute();
      return;
    }

    if (this.overlay === 'howto') {
      if (this.anyKeyDown(kb)) this.closeOverlay();
      return;
    }
    if (this.overlay === 'notice') {
      if (this.anyKeyDown(kb)) this.closeAssistNotice();
      return;
    }
    if (this.overlay === 'settings') {
      this.handleSettingsKeys(kb);
      return;
    }
    this.handleMenuKeys(kb);
  }

  /** index.html의 GitHub 저장소 링크를 타이틀 화면에서만 보이게 한다(플레이 중 화면을 가리지 않도록). */
  private setRepoLinkVisible(visible: boolean): void {
    const el = document.getElementById('repo-link');
    if (el) el.hidden = !visible;
  }

  // -- 배경/로고/메뉴 ----------------------------------------------------------

  private buildBackground(): void {
    // 키 아트(균열을 향해 나는 다섯 천명사, 균열 속 무명천의 가면). 왼쪽 단만 어둡게 받쳐 글자를 읽히게 한다.
    this.add.image(0, 0, 'title_bg').setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setDepth(-10);
    const shade = this.add.graphics().setDepth(-9);
    shade.fillGradientStyle(0x05040f, 0x05040f, 0x05040f, 0x05040f, 0.78, 0, 0.78, 0);
    shade.fillRect(0, 0, 720, HEIGHT);
    shade.fillStyle(0x05040f, 0.35).fillRect(0, HEIGHT - 70, WIDTH, 70);
    // 별 파티클(왼쪽 밤하늘에 몰리도록)
    for (let i = 0; i < 45; i += 1) {
      try {
        const img = this.add
          .image(Math.random() * WIDTH * 0.6, Math.random() * HEIGHT, 'fx_star')
          .setScale(0.25 + Math.random() * 0.6)
          .setAlpha(0.3 + Math.random() * 0.5)
          .setDepth(-8);
        this.stars.push({ img, speed: 10 + Math.random() * 30 });
      } catch {
        // 무시
      }
    }
  }

  private buildLogo(): void {
    // 로고 글자는 Codex가 그린 그림(천명비행록 + CELESTIAL BLADES). 천천히 떠오르며 나타난 뒤 살짝 부유한다.
    const logo = this.add.image(COL_X, 168, 'title_logo').setAlpha(0).setScale(LOGO_SCALE * 0.92);
    const glow = this.add.image(COL_X, 168, 'fx_glow').setScale(7.6, 2.8).setTint(0xffc860).setAlpha(0).setDepth(-1);
    this.tweens.add({ targets: logo, alpha: 1, scale: LOGO_SCALE, duration: 900, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: glow, alpha: 0.18, duration: 1400, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: [logo, glow], y: 162, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 900 });
    this.hiText = this.add
      .text(COL_X, 296, `HI-SCORE  ${this.save.hiscore.toString().padStart(8, '0')}`, {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffe9a0',
        fontStyle: 'bold',
        stroke: '#05040f',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
  }

  private buildMenu(): void {
    this.menuTexts = [];
    // 선택 항목 뒤 옻칠 명판과 금빛 커서(둘 다 Codex 그림). 선택이 바뀌면 그 줄로 미끄러진다.
    this.menuPlate = this.add.image(COL_X, MENU_Y, 'ui_menu_plate').setDisplaySize(330, 60).setAlpha(0.95);
    this.menuCursor = this.add.image(COL_X - 186, MENU_Y, 'ui_cursor').setDisplaySize(40, 40);
    this.tweens.add({ targets: this.menuCursor, x: COL_X - 178, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    MENU.forEach((label, i) => {
      const y = MENU_Y + i * MENU_GAP;
      const t = this.add
        .text(COL_X, y, label, {
          fontFamily: FONT,
          fontSize: '26px',
          color: '#e8f2ff',
          fontStyle: 'bold',
          stroke: '#05040f',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setInteractive({ useHandCursor: true });
      // 왼쪽에서 차례로 미끄러져 들어온다
      t.x = COL_X - 40;
      this.tweens.add({ targets: t, x: COL_X, alpha: 1, duration: 420, delay: 500 + i * 80, ease: 'Cubic.easeOut' });
      t.on('pointerover', () => {
        if (this.menuIndex !== i) {
          this.menuIndex = i;
          this.audio.playSfx('menu');
          this.refreshMenu();
        }
      });
      t.on('pointerdown', () => {
        this.menuIndex = i;
        this.refreshMenu();
        this.confirmMenu();
      });
      this.menuTexts.push(t);
    });
    this.refreshMenu(true);
    this.add
      .text(COL_X, HEIGHT - 50, '↑↓ 선택 · Z/Enter 결정 · M 음소거', { fontFamily: FONT, fontSize: '15px', color: '#8fa4b8' })
      .setOrigin(0.5);
    this.add
      .text(COL_X, HEIGHT - 26, `DIFFICULTY: ${this.save.settings.difficulty}`, { fontFamily: FONT, fontSize: '15px', color: '#8fd3ff' })
      .setOrigin(0.5);
  }

  private refreshMenu(instant = false): void {
    this.menuTexts.forEach((t, i) => {
      t.setColor(i === this.menuIndex ? '#ffe9a0' : '#c9d4e0');
    });
    const y = MENU_Y + this.menuIndex * MENU_GAP;
    this.tweens.killTweensOf(this.menuPlate);
    if (instant) {
      this.menuPlate.setY(y);
    } else {
      this.tweens.add({ targets: this.menuPlate, y, duration: 140, ease: 'Cubic.easeOut' });
    }
    this.menuCursor.setY(y);
  }

  // -- 메뉴 입력 ---------------------------------------------------------------

  private handleMenuKeys(kb: Phaser.Input.Keyboard.KeyboardPlugin): void {
    const up = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const down = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    const z = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    const enter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    if (Phaser.Input.Keyboard.JustDown(up)) {
      this.menuIndex = (this.menuIndex + MENU.length - 1) % MENU.length;
      this.audio.playSfx('menu');
      this.refreshMenu();
    } else if (Phaser.Input.Keyboard.JustDown(down)) {
      this.menuIndex = (this.menuIndex + 1) % MENU.length;
      this.audio.playSfx('menu');
      this.refreshMenu();
    } else if (Phaser.Input.Keyboard.JustDown(z) || Phaser.Input.Keyboard.JustDown(enter) || Phaser.Input.Keyboard.JustDown(space)) {
      this.confirmMenu();
    }
  }

  private confirmMenu(): void {
    this.audio.playSfx('menu');
    const item = MENU[this.menuIndex];
    if (item === 'START GAME') {
      this.scene.start('CharacterSelect');
    } else if (item === 'RANKING') {
      this.scene.start('Ranking');
    } else if (item === 'STORY') {
      this.scene.start('Archive');
    } else if (item === 'HOW TO PLAY') {
      this.openHowto();
    } else {
      this.openSettings();
    }
  }

  private anyKeyDown(kb: Phaser.Input.Keyboard.KeyboardPlugin): boolean {
    for (const code of [
      Phaser.Input.Keyboard.KeyCodes.Z,
      Phaser.Input.Keyboard.KeyCodes.X,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.ENTER,
      Phaser.Input.Keyboard.KeyCodes.ESC,
    ]) {
      if (Phaser.Input.Keyboard.JustDown(kb.addKey(code))) return true;
    }
    return false;
  }

  // -- 오버레이 -----------------------------------------------------------------

  private closeOverlay(): void {
    this.audio.playSfx('menu');
    this.overlay = null;
    this.settingsNote = '';
    if (this.overlayBox) {
      this.overlayBox.destroy();
      this.overlayBox = null;
    }
  }

  /** 모바일 첫 실행 안내: 어시스트가 자동으로 켜졌고 SETTINGS에서 바꿀 수 있다. 닫으면 다시 띄우지 않는다. */
  private openAssistNotice(): void {
    this.overlay = 'notice';
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.88).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 820, 440, 0x0d1424, 1).setStrokeStyle(2, 0x53e0b0, 0.85);
    const title = this.add
      .text(WIDTH / 2, 196, '모바일 어시스트가 켜져 있어요', { fontFamily: FONT, fontSize: '32px', color: '#7ff0c4', fontStyle: 'bold' })
      .setOrigin(0.5);
    const lines = [
      '휴대폰으로도 편하게 즐기도록 조작을 돕는 기능을 켜 두었습니다.',
      '',
      '자동 공격 — 공격 버튼 없이 계속 쏩니다 (공격 버튼은 누르고 있다 떼면 차지)',
      '자동 필살기 — 맞는 순간 필살기가 남아 있으면 대신 터집니다',
      '자동 회피 — 곧 맞을 길이면 기체가 알아서 비켜 갑니다',
      '',
      'SETTINGS에서 하나씩 끄고 켤 수 있어요.',
    ];
    const body = this.add
      .text(WIDTH / 2, 362, lines.join('\n'), { fontFamily: FONT, fontSize: '19px', color: '#e8f2ff', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5);
    const hint = this.add
      .text(WIDTH / 2, 532, '화면을 눌러 닫기', { fontFamily: FONT, fontSize: '16px', color: '#8fd3ff' })
      .setOrigin(0.5);
    c.add([dim, panel, title, body, hint]);
    dim.on('pointerdown', () => this.closeAssistNotice());
    this.overlayBox = c;
  }

  private closeAssistNotice(): void {
    this.save.markAssistNoticeSeen();
    this.closeOverlay();
  }

  private openHowto(): void {
    this.overlay = 'howto';
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.88).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 760, 480, 0x0d1424, 1).setStrokeStyle(2, 0x8fd3ff, 0.8);
    const title = this.add
      .text(WIDTH / 2, 150, 'HOW TO PLAY', { fontFamily: FONT, fontSize: '34px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5);
    const lines = [
      '이동: 화살표 / WASD (게임패드 스틱)',
      '집중: SHIFT — 저속 이동 + 피격점 표시',
      '공격: Z / Space — 1.2초 유지 후 떼면 차지공격',
      '필살기: X — 1.5초 무적 + 적탄 소거 (신중히!)',
      '일시정지: ESC · 음소거: M',
      '아이템: P 파워 / B 필살기 / L 목숨 / G 점수',
      '어시스트: SETTINGS에서 자동 공격·필살기·회피 (모바일은 기본 켜짐)',
      '피격점을 작게! 탄 사이를 비집고 날아라.',
    ];
    const body = this.add
      .text(WIDTH / 2, 340, lines.join('\n'), {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#e8f2ff',
        align: 'center',
        lineSpacing: 10,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(WIDTH / 2, 540, '아무 키나 눌러 닫기', { fontFamily: FONT, fontSize: '16px', color: '#8fd3ff' })
      .setOrigin(0.5);
    c.add([dim, panel, title, body, hint]);
    dim.on('pointerdown', () => this.closeOverlay());
    this.overlayBox = c;
  }

  // -- Settings -----------------------------------------------------------------

  private settingsRows(): Array<{ label: string; value: string; help?: string }> {
    const s = this.save.settings;
    const onOff = (v: boolean): string => (v ? 'ON' : 'OFF');
    return [
      { label: 'Master Volume', value: `${Math.round(s.masterVol * 100)}` },
      { label: 'SFX Volume', value: `${Math.round(s.sfxVol * 100)}` },
      { label: 'Music Volume', value: `${Math.round(s.musicVol * 100)}` },
      { label: 'Screen Shake', value: onOff(s.shake) },
      { label: 'Difficulty', value: s.difficulty },
      { label: 'Fullscreen', value: onOff(this.scale.isFullscreen) },
      { label: 'Auto Shot · 자동 공격', value: onOff(s.autoShot), help: ASSIST_HELP.shot },
      { label: 'Auto Bomb · 자동 필살기', value: onOff(s.autoBomb), help: ASSIST_HELP.bomb },
      { label: 'Auto Dodge · 자동 회피', value: onOff(s.autoDodge), help: ASSIST_HELP.dodge },
    ];
  }

  private openSettings(): void {
    this.overlay = 'settings';
    this.settingsIndex = 0;
    const c = this.add.container(0, 0).setDepth(100);
    // 덮개가 눌림을 받아야 아래 메뉴 글자가 눌리지 않는다.
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.88).setOrigin(0).setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 760, 500, 0x0d1424, 1).setStrokeStyle(2, 0xffd75e, 0.8);
    const title = this.add
      .text(WIDTH / 2, 150, 'SETTINGS', { fontFamily: FONT, fontSize: '34px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5);
    // 터치에는 ESC가 없으므로 닫기 단추를 둔다.
    const close = this.add
      .text(WIDTH / 2 + 352, 150, '닫기 ✕', { fontFamily: FONT, fontSize: '20px', color: '#8fd3ff', fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.closeOverlay());
    c.add([dim, panel, title, close]);
    this.settingsRowsBox = this.add.container(0, 0);
    c.add(this.settingsRowsBox);
    this.overlayBox = c;
    this.refreshSettings();
  }

  private refreshSettings(): void {
    if (!this.overlayBox || !this.settingsRowsBox || this.overlay !== 'settings') return;
    this.settingsRowsBox.removeAll(true);
    const rows = this.settingsRows();
    rows.forEach((row, i) => {
      const y = SETTINGS_Y + i * SETTINGS_GAP;
      const sel = i === this.settingsIndex;
      const lt = this.add
        .text(WIDTH / 2 - 300, y, `${sel ? '▶ ' : '   '}${row.label}`, {
          fontFamily: FONT,
          fontSize: '22px',
          color: sel ? '#ffd75e' : '#e8f2ff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      const vt = this.add
        .text(WIDTH / 2 + 300, y, `◀ ${row.value} ▶`, {
          fontFamily: FONT,
          fontSize: '22px',
          color: sel ? '#ffd75e' : '#8fd3ff',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });
      lt.on('pointerdown', () => {
        this.settingsIndex = i;
        this.audio.playSfx('menu');
        this.refreshSettings();
      });
      vt.on('pointerdown', () => {
        this.settingsIndex = i;
        this.adjustSetting(1);
      });
      this.settingsRowsBox?.add([lt, vt]);
    });
    const mobileNote = isMobileDevice() ? '모바일에서는 어시스트(자동 공격·필살기·회피)가 처음부터 켜져 있습니다.' : '';
    const help = this.settingsNote || rows[this.settingsIndex]?.help || mobileNote;
    const helpText = this.add
      .text(WIDTH / 2, 534, help, { fontFamily: FONT, fontSize: '16px', color: this.settingsNote ? '#ffb4a0' : '#a8ecd2' })
      .setOrigin(0.5);
    const hint = this.add
      .text(WIDTH / 2, 572, '↑↓ 이동 · ←→ 조절 · ESC 닫기 (터치: 값을 눌러 바꾸기)', { fontFamily: FONT, fontSize: '15px', color: '#8fd3ff' })
      .setOrigin(0.5);
    this.settingsRowsBox?.add([helpText, hint]);
  }

  private handleSettingsKeys(kb: Phaser.Input.Keyboard.KeyboardPlugin): void {
    const up = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const down = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    const left = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    const right = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    const esc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const rows = this.settingsRows().length;
    if (Phaser.Input.Keyboard.JustDown(up)) {
      this.settingsIndex = (this.settingsIndex + rows - 1) % rows;
      this.audio.playSfx('menu');
      this.refreshSettings();
    } else if (Phaser.Input.Keyboard.JustDown(down)) {
      this.settingsIndex = (this.settingsIndex + 1) % rows;
      this.audio.playSfx('menu');
      this.refreshSettings();
    } else if (Phaser.Input.Keyboard.JustDown(left)) {
      this.adjustSetting(-1);
    } else if (Phaser.Input.Keyboard.JustDown(right)) {
      this.adjustSetting(1);
    } else if (Phaser.Input.Keyboard.JustDown(esc)) {
      this.closeOverlay();
    }
  }

  private adjustSetting(dir: -1 | 1): void {
    const s = this.save.settings;
    const step = 0.1;
    const clamp01 = (v: number): number => Math.min(1, Math.max(0, Math.round(v * 10) / 10));
    switch (this.settingsIndex) {
      case 0: {
        const v = clamp01(s.masterVol + dir * step);
        this.save.updateSettings({ masterVol: v });
        this.audio.setMasterVolume(v);
        break;
      }
      case 1: {
        const v = clamp01(s.sfxVol + dir * step);
        this.save.updateSettings({ sfxVol: v });
        this.audio.setSfxVolume(v);
        break;
      }
      case 2: {
        const v = clamp01(s.musicVol + dir * step);
        this.save.updateSettings({ musicVol: v });
        this.audio.setMusicVolume(v);
        break;
      }
      case 3:
        this.save.updateSettings({ shake: !s.shake });
        break;
      case 4: {
        const order: Difficulty[] = DIFFICULTIES;
        const next = order[(order.indexOf(s.difficulty) + (dir > 0 ? 1 : order.length - 1)) % order.length];
        this.save.updateSettings({ difficulty: next });
        break;
      }
      case 5:
        try {
          this.scale.toggleFullscreen();
        } catch {
          this.settingsNote = '이 브라우저에서는 전체화면을 쓸 수 없어요';
        }
        break;
      case 6:
        this.save.updateSettings({ autoShot: !s.autoShot });
        break;
      case 7:
        this.save.updateSettings({ autoBomb: !s.autoBomb });
        break;
      case 8:
        this.save.updateSettings({ autoDodge: !s.autoDodge });
        break;
      default:
        break;
    }
    this.audio.playSfx('menu');
    this.refreshSettings();
  }
}
