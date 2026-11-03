import Phaser from 'phaser';
import { HEIGHT, LOGO_FONT, UI_FONT, WIDTH } from '../GameConfig';
import { CHARACTERS, clampCharIndex } from '../data/characters';
import { STORY } from '../data/story';
import { AudioSystem } from '../systems/AudioSystem';
import { InputSystem } from '../systems/InputSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = UI_FONT;
const LIST_X = 64;
const LIST_Y = 150;
const ROW_H = 44;
const PREVIEW = { x: 470, y: 150, w: 720, h: 405 };

interface Entry {
  label: string;
  image: string;
  /** 스토리 장 번호(엔딩이면 null) */
  chapter: number | null;
  /** 엔딩이면 그 천명사 번호 */
  charIndex: number | null;
  unlocked: boolean;
  lockHint: string;
}

export interface ArchiveSceneData {
  /** 처음 고를 항목 */
  cursor?: number;
  /** 장 대사를 들을 천명사 */
  charIndex?: number;
}

/**
 * 스토리 다시보기 (키 'Archive'). 본 장과 클리어한 천명사의 엔딩을 다시 본다.
 * ↑↓ 항목, ←→ 대사를 들을 천명사(장만), Z/Enter/패드 A 재생, X/ESC/패드 B 타이틀.
 */
export class ArchiveScene extends Phaser.Scene {
  private entries: Entry[] = [];
  private cursor = 0;
  private charIndex = 0;
  private audio!: AudioSystem;
  private inputSys!: InputSystem;
  private rows: Phaser.GameObjects.Text[] = [];
  private preview!: Phaser.GameObjects.Image;
  private lockShade!: Phaser.GameObjects.Rectangle;
  private lockText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private pilotText!: Phaser.GameObjects.Text;
  private axisPrev = 0;
  private leaving = false;

  constructor() {
    super('Archive');
  }

  init(raw: ArchiveSceneData): void {
    const d = raw ?? {};
    this.cursor = Math.max(0, Math.floor(d.cursor ?? 0));
    this.charIndex = clampCharIndex(d.charIndex ?? new SaveSystem().settings.lastChar);
  }

  create(): void {
    this.leaving = false;
    this.axisPrev = 0;
    const save = new SaveSystem();
    const seen = save.story;
    this.audio = new AudioSystem();
    this.audio.setMasterVolume(save.settings.masterVol);
    this.audio.setSfxVolume(save.settings.sfxVol);
    this.audio.setMusicVolume(save.settings.musicVol);
    this.audio.resume();
    this.audio.startMusic('story');
    this.inputSys = new InputSystem(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.audio.stopMusic();
        this.audio.dispose();
      } catch {
        // 무시
      }
    });

    this.entries = [
      ...STORY.map((ch, i) => ({
        label: ch.title,
        image: ch.image,
        chapter: i,
        charIndex: null,
        unlocked: seen.chapters.includes(i),
        lockHint: '아직 이 장에 이르지 못했습니다',
      })),
      ...CHARACTERS.map((c, i) => ({
        label: `종장 — ${c.nameKor}의 하늘`,
        image: c.ending,
        chapter: null,
        charIndex: i,
        unlocked: seen.endings.includes(c.id),
        lockHint: `${c.nameKor}(으)로 천문을 닫으면 열립니다`,
      })),
    ];
    this.cursor = Math.min(this.entries.length - 1, this.cursor);

    this.add.image(0, 0, 'title_bg').setOrigin(0).setDisplaySize(WIDTH, HEIGHT);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f, 0.82).setOrigin(0);
    this.add.text(LIST_X, 56, '스토리 다시보기', { fontFamily: LOGO_FONT, fontSize: '44px', color: '#ffe9a0' });
    const total = this.entries.length;
    const open = this.entries.filter((e) => e.unlocked).length;
    this.add
      .text(WIDTH - 64, 76, `${open} / ${total}`, { fontFamily: FONT, fontSize: '20px', color: '#8fd3ff' })
      .setOrigin(1, 0.5);

    this.rows = this.entries.map((e, i) => {
      const t = this.add
        .text(LIST_X, LIST_Y + i * ROW_H, e.unlocked ? e.label : '？？？', {
          fontFamily: FONT,
          fontSize: '20px',
          color: e.unlocked ? '#e8f2ff' : '#4d5d6e',
        })
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => this.select(i));
      t.on('pointerdown', () => {
        this.select(i);
        this.play();
      });
      return t;
    });

    this.add.rectangle(PREVIEW.x - 3, PREVIEW.y - 3, PREVIEW.w + 6, PREVIEW.h + 6, 0xffd75e, 0.35).setOrigin(0);
    this.preview = this.add.image(PREVIEW.x, PREVIEW.y, this.entries[0].image).setOrigin(0).setDisplaySize(PREVIEW.w, PREVIEW.h);
    this.lockShade = this.add.rectangle(PREVIEW.x, PREVIEW.y, PREVIEW.w, PREVIEW.h, 0x05040f, 0.97).setOrigin(0);
    this.lockText = this.add
      .text(PREVIEW.x + PREVIEW.w / 2, PREVIEW.y + PREVIEW.h / 2, '', { fontFamily: FONT, fontSize: '22px', color: '#8fa4b8', align: 'center' })
      .setOrigin(0.5);
    this.titleText = this.add.text(PREVIEW.x, PREVIEW.y + PREVIEW.h + 22, '', { fontFamily: LOGO_FONT, fontSize: '30px', color: '#ffe9a0' });
    this.pilotText = this.add.text(PREVIEW.x, PREVIEW.y + PREVIEW.h + 70, '', { fontFamily: FONT, fontSize: '18px', color: '#8fd3ff' });
    this.pilotText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.cyclePilot(1));

    this.add
      .text(WIDTH / 2, HEIGHT - 22, '↑↓ 고르기 · ←→ 대사 천명사 · Z/패드 A 보기 · X/ESC/패드 B 돌아가기', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#6f86a0',
      })
      .setOrigin(0.5, 1);

    this.refresh();
  }

  update(): void {
    if (this.leaving) return;
    const inp = this.inputSys;
    inp.update();
    if (inp.bombJustPressed || inp.pauseJustPressed) {
      this.back();
      return;
    }
    const kb = this.input.keyboard;
    const enter = kb ? Phaser.Input.Keyboard.JustDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)) : false;
    if (inp.attackJustPressed || enter) {
      this.play();
      return;
    }
    // 방향키·패드 스틱 모두 축으로 받아, 새로 기울인 순간에만 한 칸 움직인다.
    const axis = inp.getAxis();
    const dir = Math.abs(axis.y) > 0.5 ? (axis.y > 0 ? 2 : -2) : Math.abs(axis.x) > 0.5 ? (axis.x > 0 ? 1 : -1) : 0;
    if (dir !== 0 && dir !== this.axisPrev) {
      if (dir === 2 || dir === -2) this.select((this.cursor + (dir > 0 ? 1 : -1) + this.entries.length) % this.entries.length);
      else this.cyclePilot(dir);
    }
    this.axisPrev = dir;
  }

  private select(i: number): void {
    if (i === this.cursor) return;
    this.cursor = i;
    this.audio.playSfx('menu');
    this.refresh();
  }

  private cyclePilot(dir: number): void {
    const e = this.entries[this.cursor];
    if (e.chapter === null) return;
    this.charIndex = (this.charIndex + dir + CHARACTERS.length) % CHARACTERS.length;
    this.audio.playSfx('menu');
    this.refresh();
  }

  private refresh(): void {
    const e = this.entries[this.cursor];
    this.rows.forEach((t, i) => {
      const sel = i === this.cursor;
      const unlocked = this.entries[i].unlocked;
      t.setColor(sel ? '#ffd75e' : unlocked ? '#e8f2ff' : '#4d5d6e');
      t.setText(`${sel ? '▶ ' : '   '}${unlocked ? this.entries[i].label : '？？？'}`);
    });
    this.preview.setTexture(e.image).setDisplaySize(PREVIEW.w, PREVIEW.h);
    this.lockShade.setVisible(!e.unlocked);
    this.lockText.setText(e.unlocked ? '' : `잠김\n\n${e.lockHint}`);
    this.titleText.setText(e.unlocked ? e.label : '？？？');
    if (!e.unlocked) this.pilotText.setText('');
    else if (e.chapter !== null) this.pilotText.setText(`대사: ◀ ${CHARACTERS[this.charIndex].nameKor} ▶`);
    else this.pilotText.setText(`${CHARACTERS[e.charIndex ?? 0].nameKor} · ${CHARACTERS[e.charIndex ?? 0].title}`);
  }

  private play(): void {
    const e = this.entries[this.cursor];
    if (!e.unlocked || this.leaving) return;
    this.leaving = true;
    this.audio.playSfx('menu');
    if (e.chapter !== null) {
      this.scene.start('Story', { chapter: e.chapter, replay: true, next: { charIndex: this.charIndex } });
    } else {
      this.scene.start('Ending', { charIndex: e.charIndex ?? 0, replay: true, cursor: this.cursor });
    }
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.audio.playSfx('menu');
    this.scene.start('Title');
  }
}
