import Phaser from 'phaser';
import { DIFFICULTIES, DIFFICULTY_PRESETS, HEIGHT, LOGO_FONT, UI_FONT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { BASE_CHARACTER_COUNT, clampCharIndex, pilotRoster } from '../data/characters';
import type { CharacterDef } from '../data/characters';
import { AudioSystem } from '../systems/AudioSystem';
import { InputSystem } from '../systems/InputSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = UI_FONT;
const DIFFS: Difficulty[] = DIFFICULTIES;
/** 위쪽 대형 일러스트(필살기 컷인 그림) 띠 */
const BANNER_Y = 40;
const BANNER_H = 345;
/** 아래쪽 기체 줄 */
const ROW_Y = 562;
const ROW_GAP = 236;
const SPRITE_SCALE = 0.82;
/** 기체 그림(select_*) 폭 */
const SELECT_W = 220;
/**
 * 숨겨진 천명사를 여는 비밀 커맨드: ↑↓↑↓←←→→ (방향 입력, 패드 십자키·스틱도 된다).
 * 입력하는 동안 기체·난이도 줄이 평소처럼 움직이므로, 완성되면 난이도는 커맨드 시작 때로 되돌린다.
 */
const SECRET = [-2, 2, -2, 2, -1, -1, 1, 1];
/** 커맨드 입력 사이 허용 간격(ms) */
const SECRET_GAP_MS = 1500;

/**
 * 캐릭터 선택 씬 (키 'CharacterSelect'). 텐가이식: 아래 줄의 인게임 기체 중에서 고르고,
 * 고른 천명사의 필살기 일러스트가 위쪽을 가득 채운다. 고른 기체는 떠올라 기본 공격을 쏴 보인다.
 * ←→ 기체(또는 난이도), ↑↓ 기체 줄/난이도 줄 전환, Z/Enter/패드 A 출격. 클릭·터치 가능.
 * 숨겨진 천명사는 1회 클리어하거나 SECRET 커맨드를 넣으면 기체 줄 끝에 나타난다.
 */
export class CharacterSelectScene extends Phaser.Scene {
  private save!: SaveSystem;
  private audio!: AudioSystem;
  private inputSys!: InputSystem;
  /** 지금 고를 수 있는 천명사(CHARACTERS 앞부분 — 인덱스가 CHARACTERS와 같다) */
  private roster: CharacterDef[] = [];
  /** 기체 줄을 다시 만들 때 지울 오브젝트 */
  private rowObjects: Phaser.GameObjects.GameObject[] = [];
  private secretBuf: number[] = [];
  /** secretBuf 각 입력 직전의 난이도 */
  private secretDiffs: Difficulty[] = [];
  private secretAt = 0;
  private charIndex = 0;
  private difficulty: Difficulty = 'NORMAL';
  /** 0 = 기체 줄, 1 = 난이도 줄 */
  private focus = 0;
  private axisPrev = 0;
  private leaving = false;

  private banner: Phaser.GameObjects.Image | null = null;
  private nameText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private bombText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private statFills: Phaser.GameObjects.Rectangle[] = [];
  private sprites: Phaser.GameObjects.Image[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private names: Phaser.GameObjects.Text[] = [];
  private marker!: Phaser.GameObjects.Text;
  private diffTexts: Phaser.GameObjects.Text[] = [];
  private shotTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super('CharacterSelect');
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
    this.inputSys = new InputSystem(this);

    this.roster = pilotRoster(this.save.hiddenPilotsUnlocked);
    this.charIndex = clampCharIndex(s.lastChar);
    if (this.charIndex >= this.roster.length) this.charIndex = 0;
    this.rowObjects = [];
    this.secretBuf = [];
    this.secretDiffs = [];
    this.secretAt = 0;
    this.difficulty = s.difficulty;
    this.focus = 0;
    this.axisPrev = 0;
    this.leaving = false;
    this.banner = null;
    this.statFills = [];
    this.sprites = [];
    this.glows = [];
    this.names = [];
    this.diffTexts = [];

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f).setOrigin(0);
    this.buildHeader();
    this.buildInfo();
    this.buildRow();
    this.buildDifficulty();
    this.showPilot(false);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.shotTimer?.remove(false);
        this.audio.stopMusic();
        this.audio.dispose();
      } catch {
        // 무시
      }
    });
  }

  update(): void {
    if (this.leaving) return;
    const inp = this.inputSys;
    inp.update();
    const kb = this.input.keyboard;
    const enter = kb ? Phaser.Input.Keyboard.JustDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)) : false;
    if (inp.attackJustPressed || enter) {
      this.confirm();
      return;
    }
    if (inp.pauseJustPressed || inp.bombJustPressed) {
      this.leaving = true;
      this.audio.playSfx('menu');
      this.scene.start('Title');
      return;
    }
    // 방향키·패드 스틱을 축으로 받아, 새로 기울인 순간에만 한 칸 움직인다.
    const axis = inp.getAxis();
    const dir = Math.abs(axis.y) > 0.5 ? (axis.y > 0 ? 2 : -2) : Math.abs(axis.x) > 0.5 ? (axis.x > 0 ? 1 : -1) : 0;
    if (dir !== 0 && dir !== this.axisPrev) {
      if (this.feedSecret(dir)) {
        this.axisPrev = dir;
        return;
      }
      if (dir === 2 || dir === -2) {
        this.focus = this.focus === 0 ? 1 : 0;
        this.audio.playSfx('menu');
        this.refreshFocus();
      } else {
        this.step(dir);
      }
    }
    this.axisPrev = dir;
  }

  // -- 구성 -------------------------------------------------------------------

  private buildHeader(): void {
    this.add.rectangle(0, 0, WIDTH, BANNER_Y, 0x05040f).setOrigin(0).setDepth(5);
    this.add.text(40, 20, 'SELECT PILOT', { fontFamily: FONT, fontSize: '24px', color: '#ffd75e', fontStyle: 'bold' }).setOrigin(0, 0.5).setDepth(6);
    this.add
      .text(WIDTH - 40, 20, '←→ 기체 · ↑↓ 기체/난이도 · Z 출격 · X 돌아가기', { fontFamily: FONT, fontSize: '15px', color: '#8fa4b8' })
      .setOrigin(1, 0.5)
      .setDepth(6);
  }

  private buildInfo(): void {
    // 일러스트 아래쪽을 어둡게 녹여 정보 글자와 기체 줄로 이어지게 한다.
    const fade = this.add.graphics().setDepth(2);
    fade.fillGradientStyle(0x05040f, 0x05040f, 0x05040f, 0x05040f, 0, 0, 1, 1);
    fade.fillRect(0, BANNER_Y + BANNER_H - 110, WIDTH, 110);

    // 이름 패널(일러스트 오른쪽 아래)
    this.add.rectangle(760, 262, 490, 110, 0x05040f, 0.72).setOrigin(0).setDepth(3);
    this.nameText = this.add.text(782, 268, '', { fontFamily: LOGO_FONT, fontSize: '52px', color: '#ffffff' }).setDepth(4);
    this.subText = this.add.text(782, 268, '', { fontFamily: FONT, fontSize: '20px', color: '#e8f2ff', fontStyle: 'bold' }).setDepth(4);
    this.bombText = this.add.text(784, 338, '', { fontFamily: FONT, fontSize: '18px', color: '#ffe9a0', fontStyle: 'bold' }).setDepth(4);

    this.infoText = this.add
      .text(40, 392, '', { fontFamily: FONT, fontSize: '15px', color: '#c9d4e0', lineSpacing: 6, wordWrap: { width: 700 } })
      .setDepth(4);
    ['공격', '속도', '범위'].forEach((label, r) => {
      const y = 402 + r * 24;
      this.add.text(820, y, label, { fontFamily: FONT, fontSize: '14px', color: '#8fd3ff' }).setOrigin(0, 0.5).setDepth(4);
      this.add.rectangle(870, y, 300, 9, 0x1a2530).setOrigin(0, 0.5).setDepth(4);
      this.statFills.push(this.add.rectangle(870, y, 300, 9, 0xffd75e).setOrigin(0, 0.5).setDepth(4));
    });
  }

  /** 한 줄에 놓을 기체 간격과 크기(숨겨진 천명사가 열리면 7기가 화면 폭에 맞게 줄어든다) */
  private rowLayout(): { gap: number; scale: number } {
    const gap = Math.min(ROW_GAP, (WIDTH - 60) / this.roster.length);
    return { gap, scale: Math.min(SPRITE_SCALE, (gap / SELECT_W) * 0.95) };
  }

  private buildRow(): void {
    this.tweens.killTweensOf(this.rowObjects);
    for (const o of this.rowObjects) o.destroy();
    this.rowObjects = [];
    this.sprites = [];
    this.glows = [];
    this.names = [];
    const { gap, scale } = this.rowLayout();
    this.roster.forEach((ch, i) => {
      const x = WIDTH / 2 + (i - (this.roster.length - 1) / 2) * gap;
      const glow = this.add.image(x, ROW_Y + 62, 'fx_glow').setScale((3.2 * gap) / ROW_GAP, 0.55).setTint(ch.color).setDepth(4);
      const sprite = this.add.image(x, ROW_Y, ch.select).setScale(scale).setDepth(5);
      const name = this.add
        .text(x, ROW_Y + 84, ch.nameKor, { fontFamily: FONT, fontSize: '22px', color: '#6e7d8c', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(5);
      // 기체 그림 둘레를 누르기 쉽게 넉넉한 사각 영역으로 받는다.
      const hit = this.add.zone(x, ROW_Y + 20, gap - 12, 190).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        if (this.charIndex !== i || this.focus !== 0) {
          this.charIndex = i;
          this.focus = 0;
          this.audio.playSfx('menu');
          this.showPilot(true);
        }
      });
      hit.on('pointerdown', () => {
        this.charIndex = i;
        this.focus = 0;
        this.showPilot(true);
        this.confirm();
      });
      this.sprites.push(sprite);
      this.glows.push(glow);
      this.names.push(name);
      this.rowObjects.push(glow, sprite, name, hit);
    });
    this.marker = this.add.text(0, ROW_Y - 96, '▼', { fontFamily: FONT, fontSize: '20px', color: '#ffd75e' }).setOrigin(0.5).setDepth(6);
    this.tweens.add({ targets: this.marker, y: ROW_Y - 90, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.rowObjects.push(this.marker);
  }

  /**
   * 방향 입력을 비밀 커맨드 버퍼에 넣는다. 커맨드가 완성되면 숨겨진 천명사를 열고 true를 돌려준다
   * (이미 열려 있으면 커맨드는 아무 일도 하지 않는다).
   */
  private feedSecret(dir: number): boolean {
    if (this.roster.length > BASE_CHARACTER_COUNT) return false;
    const now = this.time.now;
    if (now - this.secretAt > SECRET_GAP_MS) {
      this.secretBuf = [];
      this.secretDiffs = [];
    }
    this.secretAt = now;
    this.secretBuf.push(dir);
    this.secretDiffs.push(this.difficulty);
    if (this.secretBuf.length > SECRET.length) {
      this.secretBuf.shift();
      this.secretDiffs.shift();
    }
    if (this.secretBuf.length !== SECRET.length || this.secretBuf.some((d, i) => d !== SECRET[i])) return false;
    this.difficulty = this.secretDiffs[0];
    this.save.updateSettings({ difficulty: this.difficulty });
    this.secretBuf = [];
    this.secretDiffs = [];
    this.save.unlockHiddenPilots();
    this.roster = pilotRoster(true);
    this.charIndex = BASE_CHARACTER_COUNT;
    this.focus = 0;
    this.buildRow();
    this.showPilot(true);
    this.audio.playSfx('chargeFull');
    this.cameras.main.flash(500, 255, 240, 200);
    const note = this.add
      .text(WIDTH / 2, BANNER_Y + BANNER_H / 2 - 40, '숨겨진 천명사가 모습을 드러냈다!', {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#ffe9a0',
        fontStyle: 'bold',
        stroke: '#05040f',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.tweens.add({ targets: note, alpha: 0, y: note.y - 20, delay: 1800, duration: 700, onComplete: () => note.destroy() });
    return true;
  }

  private buildDifficulty(): void {
    DIFFS.forEach((d, i) => {
      const t = this.add
        .text(WIDTH / 2 + (i - (DIFFS.length - 1) / 2) * 190, 694, d, { fontFamily: FONT, fontSize: '22px', color: '#e8f2ff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => {
        this.difficulty = d;
        this.focus = 1;
        this.audio.playSfx('menu');
        this.save.updateSettings({ difficulty: d });
        this.refreshFocus();
      });
      this.diffTexts.push(t);
    });
  }

  // -- 선택 ---------------------------------------------------------------------

  private step(dir: number): void {
    if (this.focus === 0) {
      this.charIndex = (this.charIndex + dir + this.roster.length) % this.roster.length;
      this.audio.playSfx('menu');
      this.showPilot(true);
      return;
    }
    const next = DIFFS[(DIFFS.indexOf(this.difficulty) + (dir > 0 ? 1 : DIFFS.length - 1)) % DIFFS.length];
    this.difficulty = next;
    this.save.updateSettings({ difficulty: next });
    this.audio.playSfx('menu');
    this.refreshFocus();
  }

  /** 고른 천명사로 일러스트·이름·설명·기체 줄을 바꾼다. animate면 일러스트가 오른쪽에서 미끄러져 들어온다. */
  private showPilot(animate: boolean): void {
    const ch = this.roster[this.charIndex];
    const old = this.banner;
    const banner = this.add.image(0, BANNER_Y, ch.cutin).setOrigin(0).setDisplaySize(WIDTH, BANNER_H).setDepth(1);
    this.banner = banner;
    if (old) {
      this.tweens.killTweensOf(old);
      this.tweens.add({ targets: old, alpha: 0, duration: 200, onComplete: () => old.destroy() });
    }
    if (animate) {
      banner.setAlpha(0).setX(90);
      this.tweens.add({ targets: banner, x: 0, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
    }

    this.nameText.setText(ch.nameKor).setColor(`#${ch.color.toString(16).padStart(6, '0')}`);
    this.subText.setText(`${ch.nameEng} · ${ch.title}`).setX(this.nameText.x + this.nameText.width + 24).setY(296);
    this.bombText.setText(`필살  ${ch.bombName}${ch.hidden ? '   · 숨겨진 천명사' : ''}`);
    this.infoText.setText(`${ch.desc}\n${ch.specialDesc}\n${ch.chargeDesc}`);
    [ch.stats.power, ch.stats.speed, ch.stats.range].forEach((v, r) => {
      this.statFills[r].setDisplaySize(Math.max(8, (v / 5) * 300), 9);
    });

    const { scale } = this.rowLayout();
    this.sprites.forEach((sp, i) => {
      const sel = i === this.charIndex;
      this.tweens.killTweensOf(sp);
      sp.setY(ROW_Y).setScale(scale);
      if (sel) {
        sp.clearTint().setAlpha(1);
        // 고른 기체는 떠올라 천천히 부유한다
        this.tweens.add({ targets: sp, y: ROW_Y - 16, scale: scale * 1.08, duration: 180, ease: 'Back.easeOut' });
        this.tweens.add({ targets: sp, y: ROW_Y - 24, duration: 900, delay: 180, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      } else {
        sp.setTint(0x6a6f80).setAlpha(0.7);
      }
      this.glows[i].setAlpha(sel ? 0.75 : 0.15);
      this.names[i].setColor(sel ? `#${this.roster[i].color.toString(16).padStart(6, '0')}` : '#6e7d8c');
    });
    this.marker.setX(this.sprites[this.charIndex].x);
    this.startShotPreview();
    this.refreshFocus();
  }

  /** 고른 기체가 기본 공격 탄을 짧게 쏘아 보인다(실제 탄 그림, 판정 없음). */
  private startShotPreview(): void {
    this.shotTimer?.remove(false);
    const ch = this.roster[this.charIndex];
    this.shotTimer = this.time.addEvent({
      delay: 170,
      loop: true,
      callback: () => {
        const sp = this.sprites[this.charIndex];
        if (!sp) return;
        const shot = this.add.image(sp.x + 70, sp.y + 4, ch.shotTexture).setDepth(4).setAlpha(0.95);
        this.tweens.add({
          targets: shot,
          x: shot.x + 120,
          alpha: 0,
          duration: 260,
          ease: 'Cubic.easeIn',
          onComplete: () => shot.destroy(),
        });
      },
    });
  }

  private refreshFocus(): void {
    this.diffTexts.forEach((t, i) => {
      const sel = DIFFS[i] === this.difficulty;
      t.setColor(sel ? '#ffd75e' : '#e8f2ff');
      t.setScale(sel && this.focus === 1 ? 1.18 : sel ? 1.08 : 1);
    });
    this.marker.setColor(this.focus === 0 ? '#ffd75e' : '#5e7a8f');
  }

  private confirm(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.audio.playSfx('menu');
    this.save.updateSettings({ difficulty: this.difficulty, lastChar: this.charIndex });
    // 프롤로그 컷신을 거쳐 1스테이지로
    this.scene.start('Story', {
      chapter: 0,
      next: {
        stageIndex: 0,
        charIndex: this.charIndex,
        difficulty: this.difficulty,
        score: 0,
        lives: DIFFICULTY_PRESETS[this.difficulty].lives,
        bombs: DIFFICULTY_PRESETS[this.difficulty].startBombs,
        power: 0,
      },
    });
  }
}
