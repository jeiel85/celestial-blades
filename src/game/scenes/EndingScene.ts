import Phaser from 'phaser';
import { HEIGHT, UI_FONT, WIDTH } from '../GameConfig';
import { MAX_LOOP, parseDifficulty, presetFor } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { clampCharIndex, getCharacter } from '../data/characters';
import { STAGES } from '../data/stages';
import { AudioSystem } from '../systems/AudioSystem';
import { InputSystem } from '../systems/InputSystem';
import { SaveSystem } from '../systems/SaveSystem';

const FONT = UI_FONT;

export interface EndingSceneData {
  charIndex?: number;
  score?: number;
  difficulty?: Difficulty;
  /** 스토리 다시보기에서 연 경우: 점수·랭킹 없이 후일담까지만 보고 Archive로 돌아간다 */
  replay?: boolean;
  /** 다시보기 목록에서 돌아갈 위치 */
  cursor?: number;
  /** 주차와 이월 상태(1주차 엔딩 뒤 2주차로 이어 갈 때 쓴다) */
  loop?: number;
  lives?: number;
  bombs?: number;
  power?: number;
  continues?: number;
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
  [
    '마지막 화살이 균열을 꿰뚫고, 하늘은 다시 이어졌다.',
    '소율은 활을 내리고 매를 불러 앉혔다.',
    '“빗나간 적은 없어. 돌아갈 길도.”',
    '— 관통의 궁수는 숲의 파수꾼으로 돌아갔다.',
  ],
  [
    '사신의 결계가 걷히자, 무명천의 가면이 바람에 날렸다.',
    '해랑은 산 위 작은 사당에서 흩어진 부적을 쓸어 모았다.',
    '“천명은 끊는 게 아니라, 함께 지는 거였어.”',
    '— 결계의 술사는 오늘도 누군가의 하늘을 지킨다.',
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
  private replay = false;
  private cursor = 0;
  private loop = 1;
  private carry = { lives: 0, bombs: 0, power: 0, continues: 0 };
  /** 1주차 엔딩 끝: 2주차 도전 여부를 묻는 중 / 거절함 */
  private asking = false;
  private declined = false;
  private save!: SaveSystem;
  /** 2주차 질문을 게임패드로도 답하게 한다 */
  private inputSys!: InputSystem;
  private audio!: AudioSystem;

  private step = 0;
  private holdMs = 0;
  private done = false;
  private typingTimer: Phaser.Time.TimerEvent | null = null;

  private rift!: Phaser.GameObjects.Image;
  private riftBaseScaleY = 1;
  private riftGlow!: Phaser.GameObjects.Image;
  private bright!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Ending');
  }

  init(raw: EndingSceneData): void {
    const d = raw ?? {};
    this.charIndex = clampCharIndex(d.charIndex);
    this.score = Math.max(0, Math.floor(d.score ?? 0));
    this.difficulty = parseDifficulty(d.difficulty);
    this.replay = d.replay === true;
    this.cursor = Math.max(0, Math.floor(d.cursor ?? 0));
    this.loop = d.loop === MAX_LOOP ? MAX_LOOP : 1;
    this.carry = {
      lives: Math.max(1, Math.floor(d.lives ?? 1)),
      bombs: Math.max(0, Math.floor(d.bombs ?? 0)),
      power: Math.max(0, Math.min(3, Math.floor(d.power ?? 0))),
      continues: Math.max(0, Math.floor(d.continues ?? 0)),
    };
    this.asking = false;
    this.declined = false;
  }

  create(): void {
    this.save = new SaveSystem();
    this.inputSys = new InputSystem(this);
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

    if (!this.replay) {
      this.save.submitScore(this.score);
      this.save.markEndingSeen(getCharacter(this.charIndex).id);
    }
    this.step = 0;
    this.holdMs = 0;
    this.done = false;

    // 어두운 균열 하늘
    this.add.image(0, 0, 'bg_rift').setOrigin(0).setDisplaySize(WIDTH, HEIGHT);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f, 0.5).setOrigin(0);
    this.bright = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x9fd8f2, 0).setOrigin(0).setDepth(5);
    // 균열 기둥 (수축 연출 대상): 가로 빛줄기 그림을 세로로 세워 화면 높이만큼 늘린다.
    // 회전했으므로 화면상 폭은 scaleY가 맡는다.
    this.rift = this.add
      .image(WIDTH / 2, HEIGHT / 2, 'fx_warn_line')
      .setRotation(Math.PI / 2)
      .setDisplaySize(HEIGHT, 90)
      .setTint(0xa06bff)
      .setDepth(2);
    this.riftBaseScaleY = this.rift.scaleY;
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
    if (this.asking) {
      // 키보드(Z/Space·X/ESC)와 게임패드(A·B)는 InputSystem이, Enter는 따로 받는다.
      const inp = this.inputSys;
      inp.update();
      const enter = kb ? Phaser.Input.Keyboard.JustDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)) : false;
      if (inp.attackJustPressed || enter) this.startSecondLoop();
      else if (inp.bombJustPressed || inp.pauseJustPressed) this.declineSecondLoop();
      return;
    }
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
      scaleY: this.riftBaseScaleY * 0.02,
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
    // 후일담 일러스트(화면 전체) + 글자 영역 어둡게
    const art = this.add.image(0, 0, ch.ending).setOrigin(0).setDisplaySize(WIDTH, HEIGHT).setDepth(5.5).setAlpha(0);
    const shade = this.add.rectangle(0, 392, WIDTH, HEIGHT - 392, 0x05040f, 0.55).setOrigin(0).setDepth(5.6).setAlpha(0);
    this.tweens.add({ targets: [art, shade], alpha: 1, duration: 1400, ease: 'Cubic.easeOut' });
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
          this.time.delayedCall(2500, () => (this.replay ? this.finish() : this.playScore()));
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
        }\n${this.difficulty}${this.loop >= MAX_LOOP ? ' 2주차' : ''} CLEAR`,
        { fontFamily: FONT, fontSize: '24px', color: '#ffe9a0', align: 'center', lineSpacing: 10, fontStyle: 'bold', stroke: '#05040f', strokeThickness: 6 },
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

  /** 2주차 도전(Z) / 기록 등록(X) 선택 */
  private askSecondLoop(): void {
    this.asking = true;
    this.step = 4;
    const box = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 620, 200, 0x05040f, 0.9).setStrokeStyle(2, 0xffd75e, 0.8).setDepth(20);
    const t1 = this.add
      .text(WIDTH / 2, HEIGHT / 2 - 50, '하늘은 아직 끝나지 않았다', { fontFamily: FONT, fontSize: '28px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(21);
    const t2 = this.add
      .text(WIDTH / 2, HEIGHT / 2 + 4, '더 빠르고 촘촘한 2주차에 도전하시겠습니까?', { fontFamily: FONT, fontSize: '20px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(21);
    // 터치로도 둘 다 고를 수 있게 버튼을 따로 둔다.
    const button = (x: number, label: string, onTap: () => void): Phaser.GameObjects.Text => {
      const b = this.add
        .text(x, HEIGHT / 2 + 58, label, {
          fontFamily: FONT,
          fontSize: '20px',
          color: '#e8f2ff',
          backgroundColor: '#1a2433',
          padding: { x: 18, y: 8 },
        })
        .setOrigin(0.5)
        .setDepth(21)
        .setInteractive({ useHandCursor: true });
      b.on('pointerover', () => b.setColor('#ffd75e'));
      b.on('pointerout', () => b.setColor('#e8f2ff'));
      b.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        onTap();
      });
      return b;
    };
    const go = button(WIDTH / 2 - 130, 'Z  2주차 도전', () => this.startSecondLoop());
    const no = button(WIDTH / 2 + 130, 'X  기록 등록', () => this.declineSecondLoop());
    for (const o of [box, t1, t2, go, no]) o.setAlpha(0);
    this.tweens.add({ targets: [box, t1, t2, go, no], alpha: 1, duration: 300 });
  }

  private declineSecondLoop(): void {
    if (!this.asking) return;
    this.audio.playSfx('menu');
    this.asking = false;
    this.declined = true;
    this.finish();
  }

  private startSecondLoop(): void {
    if (this.done) return;
    this.done = true;
    try {
      this.audio.stopMusic();
    } catch {
      // 무시
    }
    const preset = presetFor(this.difficulty, MAX_LOOP);
    this.scene.start('Game', {
      stageIndex: 0,
      score: this.score,
      lives: Math.max(preset.lives, this.carry.lives),
      bombs: Math.max(preset.startBombs, this.carry.bombs),
      power: this.carry.power,
      charIndex: this.charIndex,
      difficulty: this.difficulty,
      loop: MAX_LOOP,
      continues: this.carry.continues,
    });
  }

  private skipStep(): void {
    if (this.done || !this.scene.isActive()) return;
    if (this.asking) return;
    this.audio.playSfx('menu');
    if (this.step === 0) {
      this.tweens.killTweensOf([this.rift, this.riftGlow, this.bright]);
      this.rift.setScale(this.rift.scaleX, this.riftBaseScaleY * 0.02).setAlpha(0);
      this.riftGlow.setAlpha(0);
      this.bright.setFillStyle(0x9fd8f2, 0.55);
      this.playEpilogue();
    } else if (this.step === 1) {
      if (this.typingTimer) {
        this.typingTimer.remove(false);
        this.typingTimer = null;
      }
      if (this.replay) this.finish();
      else this.playScore();
    } else if (this.step === 2) {
      this.playThanks();
    } else {
      this.finish();
    }
  }

  private finish(): void {
    if (this.done) return;
    // 1주차를 끝내면 텐가이처럼 2주차로 이어 갈지 묻는다(다시보기·2주차 엔딩은 묻지 않음).
    if (!this.replay && this.loop < MAX_LOOP && !this.declined) {
      if (this.asking) return;
      this.askSecondLoop();
      return;
    }
    this.done = true;
    try {
      this.audio.stopMusic();
    } catch {
      // 무시
    }
    if (this.replay) {
      this.scene.start('Archive', { cursor: this.cursor, charIndex: this.charIndex });
      return;
    }
    // 클리어 기록은 랭킹 등록으로 이어진다(건너뛰기 가능).
    this.scene.start('Ranking', {
      pending: {
        score: this.score,
        pilot: getCharacter(this.charIndex).id,
        difficulty: this.difficulty,
        stage: STAGES.length * this.loop,
        cleared: true,
      },
    });
  }
}
