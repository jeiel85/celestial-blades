import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = '"Courier New", monospace';
const MENU = ['START GAME', 'HOW TO PLAY', 'SETTINGS'] as const;

interface Star {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/**
 * 타이틀 씬 (키 'Title').
 * 로고 + 메뉴(START/HOWTO/SETTINGS) + HI-SCORE. 키보드/마우스/터치 지원.
 */
export class TitleScene extends Phaser.Scene {
  private save!: SaveSystem;
  private audio!: AudioSystem;
  private menuIndex = 0;
  private menuTexts: Phaser.GameObjects.Text[] = [];
  private hiText!: Phaser.GameObjects.Text;
  private overlay: 'howto' | 'settings' | null = null;
  private overlayBox: Phaser.GameObjects.Container | null = null;
  private settingsRowsBox: Phaser.GameObjects.Container | null = null;
  private settingsIndex = 0;
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
    if (this.overlay === 'settings') {
      this.handleSettingsKeys(kb);
      return;
    }
    this.handleMenuKeys(kb);
  }

  // -- 배경/로고/메뉴 ----------------------------------------------------------

  private buildBackground(): void {
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d).setOrigin(0).setDepth(-10);
    // 균열 빛기둥
    try {
      const beam = this.add.image(WIDTH / 2, HEIGHT / 2, 'fx_glow').setScale(9, 5).setAlpha(0.16).setTint(0x4d6eff).setDepth(-9);
      this.tweens.add({ targets: beam, alpha: 0.24, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const pillarL = this.add.image(WIDTH / 2 - 130, HEIGHT / 2, 'fx_glow').setScale(1.4, 6).setAlpha(0.2).setTint(0x8fd3ff).setDepth(-9);
      const pillarR = this.add.image(WIDTH / 2 + 130, HEIGHT / 2, 'fx_glow').setScale(1.4, 6).setAlpha(0.2).setTint(0x8fd3ff).setDepth(-9);
      this.tweens.add({ targets: [pillarL, pillarR], alpha: 0.32, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } catch {
      // 무시
    }
    // 별 파티클
    for (let i = 0; i < 70; i += 1) {
      try {
        const img = this.add
          .image(Math.random() * WIDTH, Math.random() * HEIGHT, 'fx_star')
          .setScale(0.3 + Math.random() * 0.8)
          .setAlpha(0.35 + Math.random() * 0.55)
          .setDepth(-8);
        this.stars.push({ img, speed: 12 + Math.random() * 46 });
      } catch {
        // 무시
      }
    }
  }

  private buildLogo(): void {
    const cx = WIDTH / 2;
    this.add
      .text(cx, 148, '천명비행록', {
        fontFamily: FONT,
        fontSize: '92px',
        color: '#ffd75e',
        fontStyle: 'bold',
        stroke: '#3d2408',
        strokeThickness: 10,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 224, 'CELESTIAL BLADES', { fontFamily: FONT, fontSize: '30px', color: '#8fd3ff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add
      .text(cx, 262, '— 동방 탄막 슈팅 —', { fontFamily: FONT, fontSize: '18px', color: '#5e7a8f' })
      .setOrigin(0.5);
    this.hiText = this.add
      .text(cx, 306, `HI-SCORE  ${this.save.hiscore.toString().padStart(8, '0')}`, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffe9a0',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }

  private buildMenu(): void {
    const cx = WIDTH / 2;
    this.menuTexts = [];
    MENU.forEach((label, i) => {
      const y = 400 + i * 56;
      const t = this.add
        .text(cx, y, label, { fontFamily: FONT, fontSize: '30px', color: '#e8f2ff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
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
    this.refreshMenu();
    this.add
      .text(cx, 620, '↑↓ 선택 · Z/Enter 결정 · M 음소거', { fontFamily: FONT, fontSize: '16px', color: '#5e7a8f' })
      .setOrigin(0.5);
    this.add
      .text(cx, 648, `DIFFICULTY: ${this.save.settings.difficulty}`, { fontFamily: FONT, fontSize: '16px', color: '#8fd3ff' })
      .setOrigin(0.5);
  }

  private refreshMenu(): void {
    this.menuTexts.forEach((t, i) => {
      if (i === this.menuIndex) {
        t.setColor('#ffd75e').setScale(1.12);
      } else {
        t.setColor('#e8f2ff').setScale(1);
      }
    });
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
    if (this.overlayBox) {
      this.overlayBox.destroy();
      this.overlayBox = null;
    }
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
      '피격점을 작게! 탄 사이를 비집고 날아라.',
    ];
    const body = this.add
      .text(WIDTH / 2, 330, lines.join('\n'), {
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

  private settingsRows(): Array<{ label: string; value: string }> {
    const s = this.save.settings;
    return [
      { label: 'Master Volume', value: `${Math.round(s.masterVol * 100)}` },
      { label: 'SFX Volume', value: `${Math.round(s.sfxVol * 100)}` },
      { label: 'Music Volume', value: `${Math.round(s.musicVol * 100)}` },
      { label: 'Screen Shake', value: s.shake ? 'ON' : 'OFF' },
      { label: 'Difficulty', value: s.difficulty },
      { label: 'Fullscreen', value: this.scale.isFullscreen ? 'ON' : 'OFF' },
    ];
  }

  private openSettings(): void {
    this.overlay = 'settings';
    this.settingsIndex = 0;
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.88).setOrigin(0);
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 760, 480, 0x0d1424, 1).setStrokeStyle(2, 0xffd75e, 0.8);
    const title = this.add
      .text(WIDTH / 2, 150, 'SETTINGS', { fontFamily: FONT, fontSize: '34px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5);
    c.add([dim, panel, title]);
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
      const y = 240 + i * 44;
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
    const hint = this.add
      .text(WIDTH / 2, 540, '↑↓ 이동 · ←→ 조절 · ESC 닫기', { fontFamily: FONT, fontSize: '16px', color: '#8fd3ff' })
      .setOrigin(0.5);
    this.settingsRowsBox?.add(hint);
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
        const order: Difficulty[] = ['EASY', 'NORMAL', 'HARD'];
        const next = order[(order.indexOf(s.difficulty) + (dir > 0 ? 1 : order.length - 1)) % order.length];
        this.save.updateSettings({ difficulty: next });
        break;
      }
      case 5:
        try {
          this.scale.toggleFullscreen();
        } catch {
          // 무시
        }
        break;
      default:
        break;
    }
    this.audio.playSfx('menu');
    this.refreshSettings();
  }
}
