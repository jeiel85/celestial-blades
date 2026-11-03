import Phaser from 'phaser';
import { HEIGHT, LOGO_FONT, UI_FONT, WIDTH } from '../GameConfig';
import { getCharacter } from '../data/characters';
import { STORY } from '../data/story';
import type { StoryLine } from '../data/story';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import type { GameSceneData } from './GameScene';

const FONT = UI_FONT;
/** 글자 하나가 찍히는 간격 (ms) */
const TYPE_MS = 32;
/** 대사 패널 윗변 (스틸 그림은 아래 32%를 어둡게 비워 두었다) */
const PANEL_Y = 500;

export interface StorySceneData {
  chapter?: number;
  /** 컷신이 끝나면 이 데이터로 Game을 시작한다 */
  next?: GameSceneData;
}

/**
 * 스테이지 사이 스토리 컷신 (키 'Story'). 스틸 일러스트 + 비주얼 노벨식 대사.
 * Z/Enter/클릭: 글자 다 찍기 → 다음 대사. X/ESC/SKIP 버튼: 장 전체 건너뛰기.
 */
export class StoryScene extends Phaser.Scene {
  private chapter = 0;
  private next: GameSceneData = {};
  private lines: StoryLine[] = [];
  private lineIndex = 0;
  private charCount = 0;
  private typeAcc = 0;
  private done = false;

  private audio!: AudioSystem;
  private speakerText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private nextMark!: Phaser.GameObjects.Text;

  constructor() {
    super('Story');
  }

  init(raw: StorySceneData): void {
    const d = raw ?? {};
    this.chapter = Math.max(0, Math.min(STORY.length - 1, Math.floor(d.chapter ?? 0)));
    this.next = d.next ?? {};
  }

  create(): void {
    this.done = false;
    this.lineIndex = 0;
    this.charCount = 0;
    this.typeAcc = 0;

    const save = new SaveSystem();
    this.audio = new AudioSystem();
    this.audio.setMasterVolume(save.settings.masterVol);
    this.audio.setSfxVolume(save.settings.sfxVol);
    this.audio.setMusicVolume(save.settings.musicVol);
    this.audio.resume();
    this.audio.startMusic('story');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.audio.stopMusic();
        this.audio.dispose();
      } catch {
        // 무시
      }
    });

    const ch = STORY[this.chapter];
    const pilot = getCharacter(this.next.charIndex ?? 0);
    this.lines = ch.lines.map((l) =>
      l === 'pilot' ? { speaker: `${pilot.nameKor}`, text: ch.pilot[pilot.id] } : l,
    );

    this.cameras.main.setBackgroundColor(0x05040f);
    // 스틸: 아주 천천히 다가가는 카메라(켄 번스) 효과
    const art = this.add.image(WIDTH / 2, HEIGHT / 2, ch.image).setDisplaySize(WIDTH, HEIGHT).setAlpha(0);
    const baseScale = art.scaleX;
    this.tweens.add({ targets: art, alpha: 1, duration: 900, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: art, scale: baseScale * 1.06, duration: 30000, ease: 'Sine.easeInOut' });

    // 대사 패널
    this.add.rectangle(0, PANEL_Y, WIDTH, HEIGHT - PANEL_Y, 0x05040f, 0.72).setOrigin(0);
    this.add.rectangle(0, PANEL_Y, WIDTH, 2, 0xffd75e, 0.5).setOrigin(0);

    const title = this.add
      .text(40, 34, ch.title, { fontFamily: LOGO_FONT, fontSize: '34px', color: '#ffe9a0', stroke: '#05040f', strokeThickness: 6 })
      .setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, x: 56, duration: 900, delay: 300, ease: 'Cubic.easeOut' });

    this.speakerText = this.add.text(96, PANEL_Y + 22, '', { fontFamily: FONT, fontSize: '22px', color: '#ffd75e', fontStyle: 'bold' });
    this.bodyText = this.add.text(96, PANEL_Y + 62, '', {
      fontFamily: FONT,
      fontSize: '24px',
      color: '#ffffff',
      lineSpacing: 10,
      wordWrap: { width: WIDTH - 192, useAdvancedWrap: true },
    });
    this.nextMark = this.add
      .text(WIDTH - 90, HEIGHT - 40, '▼', { fontFamily: FONT, fontSize: '20px', color: '#ffd75e' })
      .setOrigin(0.5)
      .setVisible(false);
    this.tweens.add({ targets: this.nextMark, y: HEIGHT - 34, duration: 420, yoyo: true, repeat: -1 });
    this.add
      .text(WIDTH / 2, HEIGHT - 14, 'Z · 클릭  다음     X · ESC  건너뛰기', { fontFamily: FONT, fontSize: '14px', color: '#6f86a0' })
      .setOrigin(0.5, 1);

    const skip = this.add
      .text(WIDTH - 24, 24, 'SKIP ▶▶', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#c9d4e0',
        backgroundColor: '#05040fb0',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.finish();
    });
    this.input.on('pointerdown', () => this.advance());

    this.showLine(0);
  }

  update(_time: number, delta: number): void {
    if (this.done) return;
    const kb = this.input.keyboard;
    if (kb) {
      const J = Phaser.Input.Keyboard.JustDown;
      const K = Phaser.Input.Keyboard.KeyCodes;
      if (J(kb.addKey(K.X)) || J(kb.addKey(K.ESC))) {
        this.finish();
        return;
      }
      if (J(kb.addKey(K.Z)) || J(kb.addKey(K.ENTER)) || J(kb.addKey(K.SPACE))) this.advance();
    }
    const line = this.lines[this.lineIndex];
    if (!line || this.charCount >= line.text.length) return;
    this.typeAcc += Math.min(100, delta);
    while (this.typeAcc >= TYPE_MS && this.charCount < line.text.length) {
      this.typeAcc -= TYPE_MS;
      this.charCount += 1;
    }
    this.bodyText.setText(line.text.slice(0, this.charCount));
    if (this.charCount >= line.text.length) this.nextMark.setVisible(true);
  }

  private showLine(i: number): void {
    this.lineIndex = i;
    this.charCount = 0;
    this.typeAcc = 0;
    const line = this.lines[i];
    this.speakerText.setText(line.speaker ?? '');
    this.bodyText.setText('');
    // 나레이션은 기울인 연한 색, 대사는 흰색
    this.bodyText.setColor(line.speaker ? '#ffffff' : '#d8dcf2').setFontStyle(line.speaker ? '' : 'italic');
    this.nextMark.setVisible(false);
  }

  private advance(): void {
    if (this.done) return;
    const line = this.lines[this.lineIndex];
    if (this.charCount < line.text.length) {
      // 찍는 중이면 한 번에 다 보여 준다
      this.charCount = line.text.length;
      this.bodyText.setText(line.text);
      this.nextMark.setVisible(true);
      return;
    }
    this.audio.playSfx('menu');
    if (this.lineIndex + 1 >= this.lines.length) this.finish();
    else this.showLine(this.lineIndex + 1);
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.cameras.main.fadeOut(450, 5, 4, 15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('Game', this.next);
    });
  }
}
