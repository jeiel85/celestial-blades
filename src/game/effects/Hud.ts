import Phaser from 'phaser';
import { COMBO_WINDOW, LOGO_FONT, UI_FONT, WIDTH, HEIGHT } from '../GameConfig';

/** 한 프레임에 HUD가 보여 줄 값 */
export interface HudState {
  score: number;
  hi: number;
  newHigh: boolean;
  combo: number;
  mult: number;
  /** 콤보가 끊기기까지 남은 시간(ms) */
  comboLeft: number;
  lives: number;
  bombs: number;
  maxBombs: number;
  /** 0..3 */
  power: number;
}

/** 위쪽 그늘. 적탄(650) 아래에 두어 탄은 그늘에 묻히지 않는다. */
const SHADE_DEPTH = 640;
const DEPTH = 801;
const LABEL_STYLE = { fontFamily: UI_FONT, fontSize: '13px', color: '#8ea3b8' };
const ASSIST_COLOR = '#53e0b0';
const LIFE_COLOR = 0xff5f7e;
const BOMB_COLOR = 0xffd75e;
const POWER_COLOR = 0x53e0b0;
const MAX_LIFE_ICONS = 6;

/** 왼쪽 점수 묶음 · 오른쪽 상태 묶음의 기준 좌표 */
const LEFT_X = 24;
const RIGHT_X = WIDTH - 24;
/** 오른쪽 줄: 레이블은 아이콘 왼쪽에 오른쪽 정렬, 아이콘은 ROW_ICON_X부터 */
const ROW_ICON_X = RIGHT_X - 106;
const ROW_LABEL_X = ROW_ICON_X - 14;
const ROW_Y = [24, 48, 72];

/** 보스 체력바 */
const BOSS_BAR_W = 520;
const BOSS_BAR_H = 8;
const BOSS_BAR_Y = 54;
/** 맞은 뒤 잔상이 줄기 시작하기까지(ms)와 줄어드는 속도(체력 비율/초) */
const TRAIL_HOLD_MS = 320;
const TRAIL_DRAIN = 0.55;

/** 기체가 이 영역에 들어오면 그 위의 HUD를 옅게 해 기체·탄을 가리지 않는다 */
const LEFT_ZONE = { x: 330, y: 110 };
const BOSS_ZONE = { halfW: 320, y: 100 };
const FADED = 0.3;

const comma = (n: number): string => Math.floor(n).toLocaleString('en-US');

/**
 * 인게임 HUD. 화면 위 띠 한 줄에 기호를 늘어놓던 오락실식 대신, 모서리 두 묶음(왼쪽 점수, 오른쪽 목숨·필살기·파워)에
 * 작은 자간 레이블과 큰 숫자, 그림 아이콘을 쓰고, 보스는 가운데 위에 서체 이름과 페이즈 눈금·피해 잔상이 있는 체력바를 띄운다.
 * 값이 바뀔 때만 다시 그리고, 매 프레임에는 점수 굴리기·잔상·콤보 시간·가림 방지 페이드만 갱신한다.
 */
export class Hud {
  private readonly score: Phaser.GameObjects.Text;
  private readonly hi: Phaser.GameObjects.Text;
  private readonly hiLabel: Phaser.GameObjects.Text;
  private readonly left: Phaser.GameObjects.Container;
  private readonly icons: Phaser.GameObjects.Graphics;
  private readonly powerLabel: Phaser.GameObjects.Text;
  private readonly combo: Phaser.GameObjects.Container;
  private readonly comboNum: Phaser.GameObjects.Text;
  private readonly comboSub: Phaser.GameObjects.Text;
  private readonly comboTimer: Phaser.GameObjects.Rectangle;

  private readonly boss: Phaser.GameObjects.Container;
  private readonly bossName: Phaser.GameObjects.Text;
  private readonly bossFill: Phaser.GameObjects.Image;
  private readonly bossTrail: Phaser.GameObjects.Rectangle;
  private readonly bossMarks: Phaser.GameObjects.Graphics;
  private readonly bossOrnament: Phaser.GameObjects.Graphics;
  private bossRatio = 1;
  private trailRatio = 1;
  private lastBossHitAt = 0;

  private shownScore = 0;
  private iconKey = '';
  private lastCombo = 0;

  /** assist: 켜진 어시스트 이름(없으면 빈 문자열). 점수 묶음 아래에 늘 띄워 둔다. */
  constructor(private readonly scene: Phaser.Scene, accent: number, assist = '') {
    const shade = scene.add.graphics().setDepth(SHADE_DEPTH).setScrollFactor(0);
    shade.fillGradientStyle(0x05070d, 0x05070d, 0x05070d, 0x05070d, 0.55, 0.55, 0, 0).fillRect(0, 0, WIDTH, 120);

    // -- 왼쪽: 천명사 색 띠 + SCORE / 점수 / HI
    const bar = scene.add.rectangle(LEFT_X, 18, 3, 54, accent).setOrigin(0);
    const scoreLabel = this.label(LEFT_X + 13, 14, 'SCORE');
    this.score = scene.add
      .text(LEFT_X + 11, 28, '0', { fontFamily: UI_FONT, fontSize: '30px', color: '#ffffff' })
      .setShadow(0, 2, '#000000', 6, false, true);
    this.hiLabel = this.label(LEFT_X + 13, 66, 'HI');
    this.hi = scene.add.text(LEFT_X + 38, 64, '0', { fontFamily: UI_FONT, fontSize: '15px', color: '#c3d2e0' });
    this.left = scene.add.container(0, 0, [bar, scoreLabel, this.score, this.hiLabel, this.hi]).setDepth(DEPTH).setScrollFactor(0);
    if (assist) {
      const tag = this.label(LEFT_X + 13, 88, 'ASSIST').setColor(ASSIST_COLOR);
      const names = scene.add.text(tag.x + tag.width + 8, 86, assist, { ...LABEL_STYLE, color: '#a8ecd2' });
      this.left.add([tag, names]);
    }

    // -- 오른쪽: LIFE / BOMB / POWER 줄. 아이콘은 icons 하나에 그린다.
    this.icons = scene.add.graphics();
    this.powerLabel = this.label(ROW_LABEL_X, ROW_Y[2] - 7, 'POWER').setOrigin(1, 0);
    const lifeLabel = this.label(ROW_LABEL_X, ROW_Y[0] - 7, 'LIFE').setOrigin(1, 0);
    const bombLabel = this.label(ROW_LABEL_X, ROW_Y[1] - 7, 'BOMB').setOrigin(1, 0);
    scene.add
      .container(0, 0, [lifeLabel, bombLabel, this.powerLabel, this.icons])
      .setDepth(DEPTH)
      .setScrollFactor(0);

    // -- 콤보: 오른쪽 묶음 아래. 큰 숫자 + 배율 + 남은 시간 선
    this.comboNum = scene.add
      .text(0, 0, '', { fontFamily: UI_FONT, fontSize: '34px', color: '#ffcf7a' })
      .setOrigin(1, 0)
      .setShadow(0, 2, '#000000', 6, false, true);
    this.comboSub = scene.add.text(0, 40, '', { ...LABEL_STYLE, color: '#e8b866' }).setOrigin(1, 0).setLetterSpacing(2);
    this.comboTimer = scene.add.rectangle(0, 60, 110, 2, 0xffcf7a, 0.9).setOrigin(1, 0.5);
    this.combo = scene.add
      .container(RIGHT_X, 92, [this.comboNum, this.comboSub, this.comboTimer])
      .setDepth(DEPTH)
      .setScrollFactor(0)
      .setAlpha(0);

    // -- 보스: 서체 이름 + 양옆 장식선 + 잔상·채움·페이즈 눈금 체력바
    const cx = WIDTH / 2;
    this.bossName = scene.add
      .text(cx, BOSS_BAR_Y - 30, '', { fontFamily: LOGO_FONT, fontSize: '22px', color: '#f3e3b5' })
      .setOrigin(0.5, 0)
      .setShadow(0, 2, '#000000', 6, false, true);
    this.bossOrnament = scene.add.graphics();
    const track = scene.add.rectangle(cx, BOSS_BAR_Y, BOSS_BAR_W + 4, BOSS_BAR_H + 4, 0x0b0d18, 0.75).setStrokeStyle(1, 0xffffff, 0.18);
    this.bossTrail = scene.add.rectangle(cx - BOSS_BAR_W / 2, BOSS_BAR_Y, BOSS_BAR_W, BOSS_BAR_H, 0xffe2c4, 0.85).setOrigin(0, 0.5);
    this.bossFill = scene.add.image(cx - BOSS_BAR_W / 2, BOSS_BAR_Y, Hud.bossFillTexture(scene)).setOrigin(0, 0.5);
    this.bossMarks = scene.add.graphics();
    this.boss = scene.add
      .container(0, 0, [this.bossOrnament, this.bossName, track, this.bossTrail, this.bossFill, this.bossMarks])
      .setDepth(DEPTH + 1)
      .setScrollFactor(0)
      .setVisible(false);

    // 조작 안내는 처음 몇 초만 보이고 사라진다.
    const hint = scene.add
      .text(WIDTH - 16, HEIGHT - 12, 'Z 공격 · X 필살 · SHIFT 집중 · ESC 정지 · M 음소거', { ...LABEL_STYLE, fontSize: '13px', color: '#7f93a6' })
      .setOrigin(1, 1)
      .setDepth(DEPTH)
      .setScrollFactor(0);
    scene.tweens.add({ targets: hint, alpha: 0, delay: 8000, duration: 1200, onComplete: () => hint.destroy() });
  }

  /** 보스 체력바 채움(빨강→주황 가로 그러데이션). 장면이 바뀌어도 텍스처는 다시 쓴다. */
  private static bossFillTexture(scene: Phaser.Scene): string {
    const key = 'hud_boss_fill';
    if (scene.textures.exists(key)) return key;
    // Graphics.generateTexture는 캔버스로 구워 그러데이션 채우기가 빠지므로 캔버스에 직접 그린다.
    const tex = scene.textures.createCanvas(key, BOSS_BAR_W, BOSS_BAR_H);
    const ctx = tex?.getContext();
    if (!tex || !ctx) return '__WHITE';
    const grad = ctx.createLinearGradient(0, 0, BOSS_BAR_W, 0);
    grad.addColorStop(0, '#d81f3a');
    grad.addColorStop(1, '#ff8a3d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BOSS_BAR_W, BOSS_BAR_H);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(0, 0, BOSS_BAR_W, 2);
    tex.refresh();
    return key;
  }

  private label(x: number, y: number, text: string): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, text, LABEL_STYLE).setLetterSpacing(3);
  }

  /** 매 프레임 호출. 값이 바뀐 부분만 다시 그린다. */
  update(s: HudState, player: { x: number; y: number }): void {
    const dt = Math.min(100, this.scene.game.loop.delta);

    // 점수는 빠르게 굴려 올린다(약 0.25초 안에 따라잡음). 줄어들 때(이어 하기로 0부터)는 바로 맞춘다.
    if (this.shownScore !== s.score) {
      const gap = s.score - this.shownScore;
      this.shownScore = gap < 1 ? s.score : this.shownScore + gap * Math.min(1, dt / 60);
      this.score.setText(comma(this.shownScore));
    }
    const hiText = comma(Math.max(s.hi, s.score));
    if (this.hi.text !== hiText) this.hi.setText(hiText);
    const hiColor = s.newHigh ? '#ffd75e' : '#8ea3b8';
    if (this.hiLabel.style.color !== hiColor) {
      this.hiLabel.setColor(hiColor);
      this.hi.setColor(s.newHigh ? '#ffd75e' : '#c3d2e0');
    }

    const lives = Math.max(0, Math.min(MAX_LIFE_ICONS, s.lives));
    const key = `${lives}|${s.bombs}|${s.maxBombs}|${s.power}`;
    if (key !== this.iconKey) {
      this.iconKey = key;
      this.drawIcons(lives, s.bombs, s.maxBombs, s.power);
    }

    this.updateCombo(s);

    // 기체가 왼쪽 위·보스 이름 아래로 오면 그 HUD를 옅게 한다.
    const nearLeft = player.x < LEFT_ZONE.x && player.y < LEFT_ZONE.y;
    this.left.setAlpha(Phaser.Math.Linear(this.left.alpha, nearLeft ? FADED : 1, Math.min(1, dt / 90)));
    if (this.boss.visible) {
      const nearBoss = player.y < BOSS_ZONE.y && Math.abs(player.x - WIDTH / 2) < BOSS_ZONE.halfW;
      this.boss.setAlpha(Phaser.Math.Linear(this.boss.alpha, nearBoss ? FADED : 1, Math.min(1, dt / 90)));
    }
  }

  private drawIcons(lives: number, bombs: number, maxBombs: number, power: number): void {
    const g = this.icons.clear();
    // 목숨: 장밋빛 보석
    for (let i = 0; i < lives; i += 1) {
      const x = ROW_ICON_X + 6 + i * 18;
      const y = ROW_Y[0];
      g.fillStyle(LIFE_COLOR, 1).fillPoints([{ x, y: y - 7 }, { x: x + 6, y }, { x, y: y + 7 }, { x: x - 6, y }], true);
      g.fillStyle(0xffd0da, 0.9).fillPoints([{ x, y: y - 7 }, { x: x + 3, y: y - 3 }, { x, y }, { x: x - 3, y: y - 3 }], true);
    }
    // 필살기: 부적. 보유 상한만큼 자리를 그리고 가진 만큼 채운다.
    for (let i = 0; i < maxBombs; i += 1) {
      const x = ROW_ICON_X + i * 18;
      const y = ROW_Y[1] - 7;
      if (i < bombs) {
        g.fillStyle(BOMB_COLOR, 1).fillRect(x, y, 10, 14);
        g.fillStyle(0xc8402e, 1).fillRect(x + 4, y + 3, 2, 8);
      } else {
        g.lineStyle(1, BOMB_COLOR, 0.35).strokeRect(x + 0.5, y + 0.5, 9, 13);
      }
    }
    // 파워: 4칸 막대(단계 0..3 → 1..4칸)
    const filled = Math.max(1, Math.min(4, power + 1));
    for (let i = 0; i < 4; i += 1) {
      const x = ROW_ICON_X + i * 24;
      const y = ROW_Y[2] - 3;
      if (i < filled) g.fillStyle(POWER_COLOR, 1).fillRect(x, y, 20, 6);
      else g.fillStyle(0xffffff, 0.14).fillRect(x, y, 20, 6);
    }
    this.powerLabel.setColor(filled === 4 ? '#53e0b0' : LABEL_STYLE.color);
    this.powerLabel.setText(filled === 4 ? 'POWER MAX' : 'POWER');
  }

  private updateCombo(s: HudState): void {
    const on = s.combo > 1;
    if (on && s.combo !== this.lastCombo) {
      this.comboNum.setText(String(s.combo));
      this.comboSub.setText(`COMBO ×${s.mult.toFixed(1)}`);
      if (s.combo > this.lastCombo) {
        this.scene.tweens.killTweensOf(this.comboNum);
        this.comboNum.setScale(1.18);
        this.scene.tweens.add({ targets: this.comboNum, scale: 1, duration: 140, ease: 'Quad.easeOut' });
      }
    }
    this.lastCombo = s.combo;
    const dt = Math.min(100, this.scene.game.loop.delta);
    this.combo.setAlpha(Phaser.Math.Linear(this.combo.alpha, on ? 1 : 0, Math.min(1, dt / 120)));
    if (on) this.comboTimer.setScale(Math.max(0, Math.min(1, s.comboLeft / COMBO_WINDOW)), 1);
  }

  /** 보스 체력바를 띄운다. marks: 페이즈가 바뀌는 체력 비율(0~1) */
  showBoss(name: string, marks: number[]): void {
    this.bossRatio = 1;
    this.trailRatio = 1;
    this.setBossName(name);
    const g = this.bossMarks.clear();
    const x0 = WIDTH / 2 - BOSS_BAR_W / 2;
    for (const m of marks) {
      if (m <= 0 || m >= 1) continue;
      g.fillStyle(0xffffff, 0.75).fillRect(Math.round(x0 + BOSS_BAR_W * m) - 1, BOSS_BAR_Y - BOSS_BAR_H / 2 - 3, 2, BOSS_BAR_H + 6);
    }
    this.bossFill.setCrop(0, 0, BOSS_BAR_W, BOSS_BAR_H);
    this.bossTrail.setScale(1, 1);
    this.boss.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.boss, alpha: 1, duration: 400 });
  }

  private setBossName(name: string): void {
    this.bossName.setText(name);
    // 이름 양옆으로 가늘어지는 장식선
    const g = this.bossOrnament.clear();
    const cx = WIDTH / 2;
    const y = BOSS_BAR_Y - 18;
    const half = this.bossName.width / 2 + 14;
    const len = 120;
    g.fillGradientStyle(0xf3e3b5, 0xf3e3b5, 0xf3e3b5, 0xf3e3b5, 0, 0.7, 0, 0.7).fillRect(cx - half - len, y, len, 1);
    g.fillGradientStyle(0xf3e3b5, 0xf3e3b5, 0xf3e3b5, 0xf3e3b5, 0.7, 0, 0.7, 0).fillRect(cx + half, y, len, 1);
    g.fillStyle(0xf3e3b5, 0.85).fillRect(cx - half - 3, y - 2, 4, 4).fillRect(cx + half - 1, y - 2, 4, 4);
  }

  /** 매 프레임: 채움은 바로, 흰 잔상은 잠깐 머물렀다 따라 줄어든다. 페이즈가 바뀌어 이름이 달라지면 갈아 끼운다. */
  updateBoss(ratio: number, name: string): void {
    if (!this.boss.visible) return;
    const now = this.scene.time.now;
    const r = Math.max(0, Math.min(1, ratio));
    if (r < this.bossRatio) this.lastBossHitAt = now;
    if (r !== this.bossRatio) {
      this.bossRatio = r;
      this.bossFill.setCrop(0, 0, BOSS_BAR_W * r, BOSS_BAR_H);
    }
    if (this.trailRatio > r && now - this.lastBossHitAt > TRAIL_HOLD_MS) {
      const dt = Math.min(100, this.scene.game.loop.delta);
      this.trailRatio = Math.max(r, this.trailRatio - (TRAIL_DRAIN * dt) / 1000);
    } else if (this.trailRatio < r) {
      this.trailRatio = r;
    }
    this.bossTrail.setScale(Math.max(0.001, this.trailRatio), 1);
    if (name !== this.bossName.text) this.setBossName(name);
  }

  hideBoss(): void {
    this.boss.setVisible(false);
  }
}
