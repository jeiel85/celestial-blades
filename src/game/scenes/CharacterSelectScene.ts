import Phaser from 'phaser';
import { DIFFICULTIES, DIFFICULTY_PRESETS, HEIGHT, UI_FONT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { CHARACTERS, clampCharIndex } from '../data/characters';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = UI_FONT;
const DIFFS: Difficulty[] = DIFFICULTIES;
/** 카드 폭·간격 (5장이 1280px 안에 들어가게) */
const CARD_W = 232;
const CARD_GAP = 246;

/**
 * 캐릭터 선택 씬 (키 'CharacterSelect').
 * 캐릭터 카드 + 하단 난이도. ←→ 카드, ↑↓ 포커스 전환, Z/Enter 확정.
 */
export class CharacterSelectScene extends Phaser.Scene {
  private save!: SaveSystem;
  private audio!: AudioSystem;
  private charIndex = 0;
  private difficulty: Difficulty = 'NORMAL';
  /** 0 = 카드 행, 1 = 난이도 행 */
  private focus = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private cardFrames: Phaser.GameObjects.Rectangle[] = [];
  private diffTexts: Phaser.GameObjects.Text[] = [];
  private hintText!: Phaser.GameObjects.Text;

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

    this.charIndex = clampCharIndex(s.lastChar);
    this.difficulty = s.difficulty;
    this.focus = 0;
    this.cards = [];
    this.cardFrames = [];
    this.diffTexts = [];

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d).setOrigin(0);
    try {
      const glow = this.add.image(WIDTH / 2, 300, 'fx_glow').setScale(10, 4).setAlpha(0.12).setTint(0x8fd3ff);
      this.tweens.add({ targets: glow, alpha: 0.2, duration: 1800, yoyo: true, repeat: -1 });
    } catch {
      // 무시
    }
    this.add
      .text(WIDTH / 2, 64, 'SELECT PILOT', { fontFamily: FONT, fontSize: '40px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.buildCards();
    this.buildDifficulty();
    this.hintText = this.add
      .text(WIDTH / 2, 690, '←→ 선택 · ↑↓ 카드/난이도 · Z 결정 · 클릭 가능', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#5e7a8f',
      })
      .setOrigin(0.5);
    this.refreshAll(false);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.audio.stopMusic();
        this.audio.dispose();
      } catch {
        // 무시
      }
    });
  }

  update(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const left = kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    const right = kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    const up = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const down = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    const z = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    const enter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    if (Phaser.Input.Keyboard.JustDown(left)) this.step(-1);
    else if (Phaser.Input.Keyboard.JustDown(right)) this.step(1);
    else if (Phaser.Input.Keyboard.JustDown(up) || Phaser.Input.Keyboard.JustDown(down)) {
      this.focus = this.focus === 0 ? 1 : 0;
      this.audio.playSfx('menu');
      this.refreshAll(true);
    } else if (
      Phaser.Input.Keyboard.JustDown(z) ||
      Phaser.Input.Keyboard.JustDown(enter) ||
      Phaser.Input.Keyboard.JustDown(space)
    ) {
      this.confirm();
    }
  }

  // -- 카드 -------------------------------------------------------------------

  private buildCards(): void {
    CHARACTERS.forEach((ch, i) => {
      const c = this.add.container(WIDTH / 2 + (i - (CHARACTERS.length - 1) / 2) * CARD_GAP, 352);
      const frame = this.add.rectangle(0, 0, CARD_W, 488, 0x0d1424, 1).setStrokeStyle(2, 0x3d4d5e, 1);
      const name = this.add
        .text(0, -216, `${ch.nameKor} · ${ch.nameEng}`, { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
      const title = this.add
        .text(0, -186, ch.title, { fontFamily: FONT, fontSize: '15px', color: '#8fd3ff' })
        .setOrigin(0.5);
      // 제목(-186) 아래, 설명(-18) 위 공간에 맞춘 초상화(220x150을 카드 폭에 맞춰 줄임)
      const portrait = this.add.image(0, -100, ch.portrait).setScale(0.95);
      const desc = this.add
        .text(0, -18, ch.desc, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#c9d4e0',
          align: 'center',
          wordWrap: { width: CARD_W - 24 },
        })
        .setOrigin(0.5, 0);
      // 스탯 바
      const statY = 108;
      const stats: Array<[string, number]> = [
        ['공격', ch.stats.power],
        ['속도', ch.stats.speed],
        ['범위', ch.stats.range],
      ];
      const statObjs: Phaser.GameObjects.GameObject[] = [];
      stats.forEach(([label, v], r) => {
        const y = statY + r * 26;
        statObjs.push(this.add.text(-96, y, label, { fontFamily: FONT, fontSize: '14px', color: '#8fd3ff' }).setOrigin(0, 0.5));
        statObjs.push(this.add.rectangle(-46, y, 130, 10, 0x1a2530, 1).setOrigin(0, 0.5));
        statObjs.push(this.add.rectangle(-46, y, Math.max(8, (v / 5) * 130), 10, 0xffd75e, 1).setOrigin(0, 0.5));
      });
      const charge = this.add
        .text(0, 212, `${ch.chargeDesc}\n${ch.bombDesc}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#9fb4c8',
          align: 'center',
          wordWrap: { width: CARD_W - 18 },
          lineSpacing: 3,
        })
        .setOrigin(0.5, 0.5);
      c.add([frame, name, title, portrait, desc, ...statObjs, charge]);
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerdown', () => {
        this.charIndex = i;
        this.focus = 0;
        this.audio.playSfx('menu');
        this.refreshAll(true);
        this.confirm();
      });
      frame.on('pointerover', () => {
        if (this.charIndex !== i) {
          this.charIndex = i;
          this.focus = 0;
          this.audio.playSfx('menu');
          this.refreshAll(true);
        }
      });
      this.cards.push(c);
      this.cardFrames.push(frame);
    });
  }

  private buildDifficulty(): void {
    this.add
      .text(WIDTH / 2, 616, 'DIFFICULTY', { fontFamily: FONT, fontSize: '20px', color: '#8fd3ff', fontStyle: 'bold' })
      .setOrigin(0.5);
    DIFFS.forEach((d, i) => {
      const t = this.add
        .text(WIDTH / 2 + (i - (DIFFS.length - 1) / 2) * 190, 650, d, { fontFamily: FONT, fontSize: '24px', color: '#e8f2ff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => {
        this.difficulty = d;
        this.focus = 1;
        this.audio.playSfx('menu');
        this.save.updateSettings({ difficulty: d });
        this.refreshAll(true);
      });
      this.diffTexts.push(t);
    });
  }

  private step(dir: -1 | 1): void {
    if (this.focus === 0) {
      this.charIndex = (this.charIndex + dir + CHARACTERS.length) % CHARACTERS.length;
    } else {
      const next = DIFFS[(DIFFS.indexOf(this.difficulty) + (dir > 0 ? 1 : DIFFS.length - 1)) % DIFFS.length];
      this.difficulty = next;
      this.save.updateSettings({ difficulty: next });
    }
    this.audio.playSfx('menu');
    this.refreshAll(true);
  }

  private refreshAll(bounce: boolean): void {
    this.cards.forEach((c, i) => {
      const sel = i === this.charIndex;
      const frame = this.cardFrames[i];
      if (sel) {
        frame.setStrokeStyle(3, this.focus === 0 ? 0xffd75e : 0x8fd3ff, 1);
        c.setScale(1.06);
        if (bounce) {
          this.tweens.killTweensOf(c);
          c.setScale(1.0);
          this.tweens.add({ targets: c, scale: 1.06, duration: 180, ease: 'Back.easeOut' });
        }
      } else {
        frame.setStrokeStyle(2, 0x3d4d5e, 1);
        this.tweens.killTweensOf(c);
        c.setScale(0.96);
      }
    });
    this.diffTexts.forEach((t, i) => {
      const sel = DIFFS[i] === this.difficulty;
      t.setColor(sel ? '#ffd75e' : '#e8f2ff');
      t.setScale(sel ? 1.15 : 1);
    });
    this.hintText.setColor(this.focus === 0 ? '#5e7a8f' : '#ffd75e');
  }

  private confirm(): void {
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
