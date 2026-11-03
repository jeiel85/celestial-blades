import Phaser from 'phaser';
import { HEIGHT, UI_FONT, WIDTH } from '../GameConfig';

export interface TalkLine {
  speaker: string;
  text: string;
  /** 'pilot'이면 왼쪽(천명사 초상화), 'boss'면 오른쪽(보스 그림) */
  side: 'pilot' | 'boss';
}

const TYPE_MS = 28;
/** 다음 줄로 자동으로 넘어가기까지(글자가 다 찍힌 뒤) */
const AUTO_MS = 2200;
const PANEL_Y = HEIGHT - 150;
const DEPTH = 870;

/**
 * 보스전 직전 대화창(텐가이식). 화면 아래 패널에 천명사 초상화(왼쪽)와 보스 그림(오른쪽)을 두고
 * 말하는 쪽을 밝게 한다. 공격키: 다 찍기 → 다음, 필살키: 전부 건너뛰기. 가만히 두면 저절로 넘어간다.
 * GameScene이 매 프레임 update(dt, advance, skip)을 부르고, 끝나면 onDone을 한 번 부른다.
 */
export class BossTalkPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly pilotImg: Phaser.GameObjects.Image;
  private readonly bossImg: Phaser.GameObjects.Image;
  private readonly speaker: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private index = 0;
  private chars = 0;
  private typeAcc = 0;
  private waitAcc = 0;
  private finished = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly lines: TalkLine[],
    pilotTex: string,
    bossTex: string,
    private readonly onDone: () => void,
  ) {
    const bg = scene.add.rectangle(0, PANEL_Y, WIDTH, HEIGHT - PANEL_Y, 0x05040f, 0.82).setOrigin(0);
    const rule = scene.add.rectangle(0, PANEL_Y, WIDTH, 2, 0xffd75e, 0.6).setOrigin(0);
    this.pilotImg = scene.add.image(150, PANEL_Y + 2, pilotTex).setOrigin(0.5, 1).setScale(1.1);
    this.bossImg = scene.add.image(WIDTH - 150, PANEL_Y + 2, bossTex).setOrigin(0.5, 1);
    // 보스 그림은 크기가 제각각이라 높이 150 안에 맞춘다.
    const s = Math.min(1, 150 / Math.max(1, this.bossImg.height), 240 / Math.max(1, this.bossImg.width));
    this.bossImg.setScale(s);
    this.speaker = scene.add.text(300, PANEL_Y + 18, '', { fontFamily: UI_FONT, fontSize: '20px', color: '#ffd75e', fontStyle: 'bold' });
    this.body = scene.add.text(300, PANEL_Y + 54, '', {
      fontFamily: UI_FONT,
      fontSize: '22px',
      color: '#ffffff',
      lineSpacing: 8,
      wordWrap: { width: WIDTH - 600, useAdvancedWrap: true },
    });
    const hint = scene.add
      .text(WIDTH / 2, HEIGHT - 10, 'Z 다음 · X 건너뛰기', { fontFamily: UI_FONT, fontSize: '13px', color: '#6f86a0' })
      .setOrigin(0.5, 1);
    this.root = scene.add
      .container(0, 0, [bg, rule, this.pilotImg, this.bossImg, this.speaker, this.body, hint])
      .setDepth(DEPTH)
      .setScrollFactor(0)
      .setAlpha(0);
    scene.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.show(0);
  }

  update(dtMs: number, advance: boolean, skip: boolean): void {
    if (this.finished) return;
    if (skip) {
      this.finish();
      return;
    }
    const line = this.lines[this.index];
    if (this.chars < line.text.length) {
      if (advance) {
        this.chars = line.text.length;
      } else {
        this.typeAcc += dtMs;
        while (this.typeAcc >= TYPE_MS && this.chars < line.text.length) {
          this.typeAcc -= TYPE_MS;
          this.chars += 1;
        }
      }
      this.body.setText(line.text.slice(0, this.chars));
      return;
    }
    this.waitAcc += dtMs;
    if (advance || this.waitAcc >= AUTO_MS) {
      if (this.index + 1 >= this.lines.length) this.finish();
      else this.show(this.index + 1);
    }
  }

  private show(i: number): void {
    this.index = i;
    this.chars = 0;
    this.typeAcc = 0;
    this.waitAcc = 0;
    const line = this.lines[i];
    this.speaker.setText(line.speaker).setColor(line.side === 'boss' ? '#ff8f8f' : '#8fd3ff');
    this.body.setText('');
    const pilot = line.side === 'pilot';
    this.pilotImg.setAlpha(pilot ? 1 : 0.35);
    this.bossImg.setAlpha(pilot ? 0.35 : 1);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const root = this.root;
    this.scene.tweens.add({ targets: root, alpha: 0, duration: 200, onComplete: () => root.destroy() });
    this.onDone();
  }

  destroy(): void {
    this.finished = true;
    this.root.destroy();
  }
}
