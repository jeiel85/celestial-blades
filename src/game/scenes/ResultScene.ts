import Phaser from 'phaser';
import { DIFFICULTY_PRESETS, HEIGHT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = '"Courier New", monospace';

export interface ResultSceneData {
  gameOver?: boolean;
  score?: number;
  charIndex?: number;
  difficulty?: Difficulty;
  stageIndex?: number;
  /** 스테이지 시작 시점 점수 (리트라이 시 이 값으로 리셋) */
  stageStartScore?: number;
  /** 유지되는 파워 단계 */
  power?: number;
}

/**
 * 결과 씬 (키 'Result'). Game Over 전용.
 * RETRY(같은 스테이지 재시작) / TITLE. NEW HIGH SCORE 강조.
 */
export class ResultScene extends Phaser.Scene {
  private result!: Required<Pick<ResultSceneData, 'score' | 'charIndex' | 'stageIndex' | 'stageStartScore' | 'power'>> & {
    difficulty: Difficulty;
  };

  private save!: SaveSystem;
  private audio!: AudioSystem;
  private menuIndex = 0;
  private buttons: Phaser.GameObjects.Text[] = [];
  private isNewHigh = false;

  constructor() {
    super('Result');
  }

  init(raw: ResultSceneData): void {
    const d = raw ?? {};
    const difficulty: Difficulty = d.difficulty === 'EASY' || d.difficulty === 'HARD' ? d.difficulty : 'NORMAL';
    this.result = {
      difficulty,
      score: Math.max(0, Math.floor(d.score ?? 0)),
      charIndex: Math.min(2, Math.max(0, Math.floor(d.charIndex ?? 0))),
      stageIndex: Math.max(0, Math.min(3, Math.floor(d.stageIndex ?? 0))),
      stageStartScore: Math.max(0, Math.floor(d.stageStartScore ?? 0)),
      power: Math.max(0, Math.min(3, Math.floor(d.power ?? 0))),
    };
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

    this.isNewHigh = this.result.score > this.save.hiscore && this.result.score > 0;
    if (this.isNewHigh) {
      this.save.submitScore(this.result.score);
      this.audio.playSfx('chargeFull');
    }

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x0a0508).setOrigin(0);
    try {
      const glow = this.add.image(WIDTH / 2, 250, 'fx_glow').setScale(8, 3).setAlpha(0.18).setTint(0xff2d3f);
      this.tweens.add({ targets: glow, alpha: 0.3, duration: 1400, yoyo: true, repeat: -1 });
    } catch {
      // 무시
    }

    this.add
      .text(WIDTH / 2, 190, 'GAME OVER', {
        fontFamily: FONT,
        fontSize: '76px',
        color: '#ff2d3f',
        fontStyle: 'bold',
        stroke: '#300000',
        strokeThickness: 8,
      })
      .setOrigin(0.5);
    this.add
      .text(WIDTH / 2, 280, `SCORE  ${this.result.score.toString().padStart(8, '0')}`, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    if (this.isNewHigh) {
      const t = this.add
        .text(WIDTH / 2, 330, '★ NEW HIGH SCORE ★', {
          fontFamily: FONT,
          fontSize: '28px',
          color: '#ffd75e',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.tweens.add({ targets: t, scale: 1.12, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.add
        .text(WIDTH / 2, 330, `HI-SCORE  ${this.save.hiscore.toString().padStart(8, '0')}`, {
          fontFamily: FONT,
          fontSize: '22px',
          color: '#8fd3ff',
        })
        .setOrigin(0.5);
    }
    this.add
      .text(WIDTH / 2, 372, `STAGE ${this.result.stageIndex + 1} · ${this.result.difficulty}`, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#5e7a8f',
      })
      .setOrigin(0.5);

    this.menuIndex = 0;
    this.buttons = [];
    const labels = ['RETRY', 'TITLE'];
    labels.forEach((label, i) => {
      const t = this.add
        .text(WIDTH / 2, 460 + i * 56, label, { fontFamily: FONT, fontSize: '30px', color: '#e8f2ff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerover', () => {
        if (this.menuIndex !== i) {
          this.menuIndex = i;
          this.audio.playSfx('menu');
          this.refresh();
        }
      });
      t.on('pointerdown', () => {
        this.menuIndex = i;
        this.confirm();
      });
      this.buttons.push(t);
    });
    this.refresh();

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
    const up = kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    const down = kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    const z = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    const enter = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    const space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    if (Phaser.Input.Keyboard.JustDown(up) || Phaser.Input.Keyboard.JustDown(down)) {
      this.menuIndex = this.menuIndex === 0 ? 1 : 0;
      this.audio.playSfx('menu');
      this.refresh();
    } else if (
      Phaser.Input.Keyboard.JustDown(z) ||
      Phaser.Input.Keyboard.JustDown(enter) ||
      Phaser.Input.Keyboard.JustDown(space)
    ) {
      this.confirm();
    }
  }

  private refresh(): void {
    this.buttons.forEach((t, i) => {
      if (i === this.menuIndex) t.setColor('#ffd75e').setScale(1.12);
      else t.setColor('#e8f2ff').setScale(1);
    });
  }

  private confirm(): void {
    this.audio.playSfx('menu');
    if (this.menuIndex === 0) {
      // 같은 스테이지 재시작: 점수는 스테이지 시작값으로, 목숨은 프리셋, 파워 유지
      this.scene.start('Game', {
        stageIndex: this.result.stageIndex,
        score: this.result.stageStartScore,
        lives: DIFFICULTY_PRESETS[this.result.difficulty].lives,
        bombs: 2,
        power: this.result.power,
        charIndex: this.result.charIndex,
        difficulty: this.result.difficulty,
      });
    } else {
      this.scene.start('Title');
    }
  }
}
