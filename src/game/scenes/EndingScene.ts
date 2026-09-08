import Phaser from 'phaser';
import { HEIGHT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { getCharacter } from '../data/characters';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = '"Courier New", monospace';

export interface EndingSceneData {
  charIndex?: number;
  score?: number;
  difficulty?: Difficulty;
}

const EPILOGUES: string[][] = [
  [
    '균열이 닫히고, 하늘은 다시 맑게 갰다.',
    '윤은 검을 거두고 계곡으로 돌아왔다.',
    '“다음 바람이 불면, 또 날면 된다.”',
    '— 균형의 검사는 오늘도 수련을 계속한다.',
  ],
  [
    '불기둥이 꺼지고, 기계도시는 고요해졌다.',
    '려화의 불꽃은 이제 사람을 따뜻하게 데운다.',
    '“태울 것과 지킬 것을 알게 됐어.”',
    '— 화염의 술사는 등불 장인이 되었다.',
  ],
  [
    '신수의 그림자가 걷히고, 밤은 물러났다.',
    '무영은 이름 없이 사라졌다 — 그림자처럼.',
    '“보이지 않아도, 지키는 자는 있다.”',
    '— 아무도 그를 보지 못했지만, 모두 기억한다.',
  ],
];

/**
 * 엔딩 씬 (키 'Ending'). 약 35초 연출:
 * 균열 봉합 → 캐릭터 후일담(타이핑) → 점수 → THANK YOU → Title.
 * 공격키를 길게 누르거나 클릭하면 단계를 건너뛴다.
 */
export class EndingScene extends Phaser.Scene {
  private charIndex = 0;
  private score = 0;
  private difficulty: Difficulty = 'NORMAL';
  private save!: SaveSystem;
  private audio!: AudioSystem;

  private step = 0;
  private holdMs = 0;
  private done = false;
  private typingTimer: Phaser.Time.TimerEvent | null = null;

  private rift!: Phaser.GameObjects.Rectangle;
  private riftGlow!: Phaser.GameObjects.Image;
  private bright!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Ending');
  }

  init(raw: EndingSceneData): void {
    const d = raw ?? {};
    this.charIndex = Math.min(2, Math.max(0, Math.floor(d.charIndex ?? 0)));
    this.score = Math.max(0, Math.floor(d.score ?? 0));
    this.difficulty = d.difficulty === 'EASY' || d.difficulty === 'HARD' ? d.difficulty : 'NORMAL';
  }

  create(): void {
    this.save = new SaveSystem();
    this.audio = new AudioSystem();
    const s = this.save.settings;
    this.audio.setMasterVolume(s.masterVol);
    this.audio.setSfxVolume(s.sfxVol);
    this.audio.setMusicVolume(s.musicVol);
    this.audio.resume();
    this.audio.startMusic('ending');
    try {
      this.input.once('pointerdown', () => this.audio.resume());
    } catch {
      // 무시
    }

    this.save.submitScore(this.score);
    this.step = 0;
    this.holdMs = 0;
    this.done = false;

    // 어두운 균열 하늘
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f).setOrigin(0);
    this.bright = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x9fd8f2, 0).setOrigin(0).setDepth(5);
    // 균열 기둥 (수축 연출 대상)
    this.rift = this.add.rectangle(WIDTH / 2, 0, 90, HEIGHT, 0xa06bff).setOrigin(0.5, 0).setDepth(2);
    this.riftGlow = this.add.image(WIDTH / 2, HEIGHT / 2, 'fx_glow').setScale(4, 8).setTint(0xa06bff).setAlpha(0.5).setDepth(1);

    this.input.on('pointerdown', () => this.skipStep());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        if (this.typingTimer) this.typingTimer.remove(false);
        this.audio.stopMusic();
        this.audio.dispose();
      } catch {
        // 무시
      }
    });

    this.time.delayedCall(800, () => this.playRiftClose());
  }

  update(_time: number, delta: number): void {
    if (this.done) return;
    const dt = Math.min(100, Math.max(1, delta));
    const kb = this.input.keyboard;
    let held = false;
    if (kb) {
      const z = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      const space = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      held = z.isDown || space.isDown;
      if (
        Phaser.Input.Keyboard.JustDown(z) ||
        Phaser.Input.Keyboard.JustDown(space) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)) ||
        Phaser.Input.Keyboard.JustDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.X))
      ) {
        this.skipStep();
        return;
      }
    }
    if (held) {
      this.holdMs += dt;
      if (this.holdMs > 700) {
        this.holdMs = 0;
        this.skipStep();
      }
    } else {
      this.holdMs = 0;
    }
  }

  // -- 연출 단계 ---------------------------------------------------------------

  /** 1) 균열이 닫히며 빛이 퍼지고 배경이 밝아진다 */
  private playRiftClose(): void {
    if (!this.scene.isActive()) return;
    this.audio.playSfx('bossDie');
    this.tweens.add({
      targets: this.rift,
      scaleX: 0.02,
      duration: 4500,
      ease: 'Cubic.easeInOut',
    });
    this.tweens.add({
      targets: this.riftGlow,
      alpha: 0.9,
      scaleX: 9,
      scaleY: 12,
      duration: 4500,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        if (!this.scene.isActive()) return;
        this.tweens.add({ targets: [this.rift, this.riftGlow], alpha: 0, duration: 1500 });
        this.tweens.add({ targets: this.bright, fillAlpha: 0.55, duration: 2500 });
        this.audio.playSfx('chargeFull');
      },
    });
    const riftText = this.add
      .text(WIDTH / 2, 120, '— 하늘이 닫힌다 —', { fontFamily: FONT, fontSize: '26px', color: '#d8c8ff' })
      .setOrigin(0.5)
      .setDepth(6)
      .setAlpha(0);
    this.tweens.add({ targets: riftText, alpha: 1, duration: 1500 });
    this.time.delayedCall(5200, () => this.playEpilogue());
  }

  /** 2) 캐릭터 + 후일담 타이핑 */
  private playEpilogue(): void {
    if (!this.scene.isActive() || this.step > 1) return;
    this.step = 1;
    const ch = getCharacter(this.charIndex);
    try {
      const img = this.add.image(WIDTH / 2, 300, ch.texture).setScale(2.05).setDepth(6).setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, y: 290, duration: 1200, ease: 'Cubic.easeOut' });
    } catch {
      // 무시
    }
    this.add
      .text(WIDTH / 2, 420, `${ch.nameKor} · ${ch.nameEng} — ${ch.title}`, {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ffd75e',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6);
    const body = this.add
      .text(WIDTH / 2, 500, '', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5, 0)
      .setDepth(6);
    const lines = EPILOGUES[this.charIndex];
    let li = 0;
    let ci = 0;
    this.typingTimer = this.time.addEvent({
      delay: 55,
      repeat: 10000,
      callback: () => {
        if (!this.scene.isActive()) return;
        if (li >= lines.length) {
          this.typingTimer?.remove(false);
          this.typingTimer = null;
          this.time.delayedCall(2500, () => this.playScore());
          return;
        }
        ci += 1;
        const shown = [...lines.slice(0, li), lines[li].slice(0, ci)];
        body.setText(shown.join('\n'));
        if (ci >= lines[li].length) {
          li += 1;
          ci = 0;
        }
      },
    });
  }

  /** 3) 최종 점수/하이스코어 */
  private playScore(): void {
    if (!this.scene.isActive() || this.step > 2) return;
    this.step = 2;
    const isHigh = this.score >= this.save.hiscore && this.score > 0;
    this.add
      .text(
        WIDTH / 2,
        150,
        `SCORE  ${this.score.toString().padStart(8, '0')}\nHI-SCORE  ${this.save.hiscore.toString().padStart(8, '0')}${
          isHigh ? '\n★ NEW HIGH SCORE ★' : ''
        }\n${this.difficulty} CLEAR`,
        { fontFamily: FONT, fontSize: '24px', color: '#ffe9a0', align: 'center', lineSpacing: 10, fontStyle: 'bold' },
      )
      .setOrigin(0.5)
      .setDepth(6);
    this.audio.playSfx('item');
    this.time.delayedCall(5000, () => this.playThanks());
  }

  /** 4) THANK YOU → Title */
  private playThanks(): void {
    if (!this.scene.isActive() || this.step > 3) return;
    this.step = 3;
    const thanks = this.add
      .text(WIDTH / 2, 620, 'THANK YOU FOR PLAYING', {
        fontFamily: FONT,
        fontSize: '34px',
        color: '#8fd3ff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6)
      .setAlpha(0);
    this.tweens.add({ targets: thanks, alpha: 1, duration: 1200 });
    this.time.delayedCall(5000, () => this.finish());
  }

  private skipStep(): void {
    if (this.done || !this.scene.isActive()) return;
    this.audio.playSfx('menu');
    if (this.step === 0) {
      this.tweens.killTweensOf([this.rift, this.riftGlow, this.bright]);
      this.rift.setScale(0.02, 1).setAlpha(0);
      this.riftGlow.setAlpha(0);
      this.bright.setFillStyle(0x9fd8f2, 0.55);
      this.playEpilogue();
    } else if (this.step === 1) {
      if (this.typingTimer) {
        this.typingTimer.remove(false);
        this.typingTimer = null;
      }
      this.playScore();
    } else if (this.step === 2) {
      this.playThanks();
    } else {
      this.finish();
    }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    try {
      this.audio.stopMusic();
    } catch {
      // 무시
    }
    this.scene.start('Title');
  }
}
