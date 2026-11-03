import Phaser from 'phaser';
import { DIFFICULTIES, DIFFICULTY_PRESETS, HEIGHT, LOGO_FONT, MAX_BOMBS, PLAYER_SPEED, UI_FONT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { BASE_CHARACTER_COUNT, CHARACTERS, clampCharIndex, pilotRoster, speedScale } from '../data/characters';
import { bombInvulnMs } from '../entities/Player';
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
/** 능력치 막대(실측 기준): 줄 위치·막대 폭 */
const STAT_Y = 388;
const STAT_GAP = 18;
const STAT_BAR_W = 250;
/** 막대의 만점: 모든 천명사 중 가장 높은 값 */
const MAX_BOSS_DPS = Math.max(...CHARACTERS.map((c) => c.measured.bossDps));
const MAX_SPEED_SCALE = Math.max(...CHARACTERS.map((c) => speedScale(c)));
/** 천명사를 바꿀 때 새 일러스트를 드러내는 천명사 색 판: 쓸고 지나가는 시간·판 폭 */
const WIPE_MS = 420;
const WIPE_BAND_W = 180;
/**
 * 새 일러스트가 드러나며 제 크기로 가라앉기 전의 배율. 옆으로 밀어 넣으면 가장자리에 옛 그림이 비치므로
 * 띠를 늘 덮도록 확대에서 줄인다(쓸기와 같은 시간에 끝나 마스크를 벗긴 뒤 띠 밖으로 넘치지 않는다).
 */
const WIPE_ZOOM = 1.06;
/** 이름 자모를 하나씩 조립하는 간격(ms) */
const TYPE_STEP_MS = 40;
/** 이름 패널 오른쪽 글·능력치가 차례로 밀려 들어오는 거리와 줄 사이 지연 */
const SLIDE_IN_X = 18;
const STAGGER_MS = 45;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

/** 한글을 자모를 하나씩 더해 가는 단계로 펼친다: '방상' → ㅂ, 바, 방, 방ㅅ, 방사, 방상 */
function hangulTypingSteps(text: string): string[] {
  const steps: string[] = [];
  let done = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code < 11172) {
      const cho = Math.floor(code / 588);
      steps.push(done + CHO[cho]);
      // 받침이 있으면 받침 없는 글자를 한 번 거친다
      if (code % 28 !== 0) steps.push(done + String.fromCharCode(0xac00 + code - (code % 28)));
    }
    done += ch;
    steps.push(done);
  }
  return steps;
}

/**
 * 캐릭터 선택 씬 (키 'CharacterSelect'). 텐가이식: 아래 줄의 인게임 기체 중에서 고르고,
 * 고른 천명사의 필살기 일러스트가 위쪽을 가득 채운다. 고른 기체는 떠올라 기본 공격을 쏴 보인다.
 * 천명사를 바꾸면 그 천명사 색의 판이 일러스트를 쓸고 지나가며 새 그림을 드러내고, 이름은 자모 단위로
 * 조립되며 나머지 글·능력치는 차례로 밀려 들어온다.
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
  /** 진행 중인 일러스트 쓸어 넘기기를 바로 끝내는 함수(다음 천명사로 넘어가면 부른다) */
  private finishWipe: (() => void) | null = null;
  private typeTimer: Phaser.Time.TimerEvent | null = null;
  /** 이름 패널 왼쪽의 천명사 색 세로 띠 */
  private accent!: Phaser.GameObjects.Rectangle;
  private nameText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private bombText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private statFills: Phaser.GameObjects.Rectangle[] = [];
  private statValues: Phaser.GameObjects.Text[] = [];
  private statNote!: Phaser.GameObjects.Text;
  /** 천명사를 바꿀 때 차례로 밀려 들어오는 글과 그 제자리 x(부제는 이름 폭에 따라 달라 따로 다룬다) */
  private slideRows: { obj: Phaser.GameObjects.Text; x: number }[] = [];
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
    this.finishWipe = null;
    this.typeTimer = null;
    this.statFills = [];
    this.statValues = [];
    this.slideRows = [];
    this.sprites = [];
    this.glows = [];
    this.names = [];
    this.diffTexts = [];

    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f).setOrigin(0);
    this.buildHeader();
    this.buildInfo();
    this.buildRow();
    this.buildDifficulty();
    this.showPilot();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.shotTimer?.remove(false);
        // 마스크용 그래픽은 화면 목록 밖에 있어 씬과 함께 지워지지 않는다
        this.finishWipe?.();
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

    // 일러스트 위로 먼지 같은 빛 알갱이가 천천히 떠오른다
    this.add
      .particles(0, 0, 'fx_spark', {
        x: { min: 0, max: WIDTH },
        y: { min: BANNER_Y + 60, max: BANNER_Y + BANNER_H + 40 },
        speedX: { min: -6, max: 12 },
        speedY: { min: -24, max: -6 },
        lifespan: { min: 3500, max: 7000 },
        scale: { min: 0.2, max: 0.55 },
        alpha: { start: 0.65, end: 0, ease: 'Quad.easeIn' },
        frequency: 110,
      })
      .setDepth(2.5);

    // 이름 패널(일러스트 오른쪽 아래)
    this.add.rectangle(760, 262, 490, 110, 0x05040f, 0.72).setOrigin(0).setDepth(3);
    this.accent = this.add.rectangle(760, 262, 4, 110, 0xffffff).setOrigin(0).setDepth(4);
    this.nameText = this.add.text(782, 268, '', { fontFamily: LOGO_FONT, fontSize: '52px', color: '#ffffff' }).setDepth(4);
    this.subText = this.add.text(782, 268, '', { fontFamily: FONT, fontSize: '20px', color: '#e8f2ff', fontStyle: 'bold' }).setDepth(4);
    this.bombText = this.add.text(784, 338, '', { fontFamily: FONT, fontSize: '18px', color: '#ffe9a0', fontStyle: 'bold' }).setDepth(4);

    this.infoText = this.add
      .text(40, 392, '', { fontFamily: FONT, fontSize: '15px', color: '#c9d4e0', lineSpacing: 6, wordWrap: { width: 700 } })
      .setDepth(4);
    // 공격 = 실측 보스 화력, 속도 = 실제 이동 속도, 범위 = 탄이 덮는 넓이(설계 값 1~5)
    ['공격', '속도', '범위'].forEach((label, r) => {
      const y = STAT_Y + r * STAT_GAP;
      this.add.text(820, y, label, { fontFamily: FONT, fontSize: '14px', color: '#8fd3ff' }).setOrigin(0, 0.5).setDepth(4);
      this.add.rectangle(870, y, STAT_BAR_W, 9, 0x1a2530).setOrigin(0, 0.5).setDepth(4);
      // 처음 들어올 때 막대가 0에서 차오르도록 폭 0으로 시작한다
      this.statFills.push(this.add.rectangle(870, y, STAT_BAR_W, 9, 0xffd75e).setOrigin(0, 0.5).setScale(0, 1).setDepth(4));
      this.statValues.push(
        this.add.text(870 + STAT_BAR_W + 12, y, '', { fontFamily: FONT, fontSize: '14px', color: '#e8f2ff' }).setOrigin(0, 0.5).setDepth(4),
      );
    });
    this.statNote = this.add
      .text(820, STAT_Y + 3 * STAT_GAP - 8, '', { fontFamily: FONT, fontSize: '13px', color: '#c9d4e0' })
      .setDepth(4);
    this.slideRows = [this.bombText, this.infoText, ...this.statValues, this.statNote].map((obj) => ({ obj, x: obj.x }));
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
          this.showPilot();
        }
      });
      hit.on('pointerdown', () => {
        this.charIndex = i;
        this.focus = 0;
        this.showPilot();
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
    this.showPilot();
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
      this.showPilot();
      return;
    }
    const next = DIFFS[(DIFFS.indexOf(this.difficulty) + (dir > 0 ? 1 : DIFFS.length - 1)) % DIFFS.length];
    this.difficulty = next;
    this.save.updateSettings({ difficulty: next });
    this.audio.playSfx('menu');
    this.refreshFocus();
  }

  /** 고른 천명사로 일러스트·이름·설명·기체 줄을 바꾼다(처음 들어올 때도 같은 연출로 드러난다). */
  private showPilot(): void {
    const ch = this.roster[this.charIndex];
    this.wipeBanner(ch);
    this.revealInfo(ch);

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

  /**
   * 새 일러스트를 왼쪽부터 드러낸다. 드러나는 경계를 천명사 색의 판이 앞장서 쓸고 지나가고,
   * 판 뒤로 새 일러스트가 살짝 확대된 채 나타나 제 크기로 가라앉는다. 옛 일러스트는 다 덮일 때까지 그대로 둔다.
   * 쓸고 있는 도중에 또 바꾸면 앞의 것을 바로 끝내고 새로 쓴다.
   */
  private wipeBanner(ch: CharacterDef): void {
    this.finishWipe?.();
    const old = this.banner;
    const banner = this.add.image(WIDTH / 2, BANNER_Y + BANNER_H / 2, ch.cutin).setDisplaySize(WIDTH, BANNER_H).setDepth(1);
    const fitX = banner.scaleX;
    const fitY = banner.scaleY;
    banner.setScale(fitX * WIPE_ZOOM, fitY * WIPE_ZOOM);
    this.banner = banner;
    const shape = this.make.graphics({}, false);
    banner.setMask(shape.createGeometryMask());
    const band = this.add.graphics().setDepth(1.5);
    // 판의 앞쪽은 단색, 뒤쪽은 새 일러스트 위로 옅어진다
    const solidW = WIPE_BAND_W * 0.55;
    const wipe = { edge: 0 };
    const draw = (): void => {
      const e = wipe.edge;
      shape.clear().fillStyle(0xffffff).fillRect(0, BANNER_Y, Math.max(0, e - solidW), BANNER_H);
      band.clear();
      band.fillGradientStyle(ch.color, ch.color, ch.color, ch.color, 0, 1, 0, 1).fillRect(e - WIPE_BAND_W, BANNER_Y, WIPE_BAND_W - solidW, BANNER_H);
      band.fillStyle(ch.color, 1).fillRect(e - solidW, BANNER_Y, solidW, BANNER_H);
      band.fillStyle(0xffffff, 0.85).fillRect(e - 3, BANNER_Y, 3, BANNER_H);
    };
    draw();
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      banner.clearMask(true);
      shape.destroy();
      band.destroy();
      if (old) {
        this.tweens.killTweensOf(old);
        old.destroy();
      }
    };
    const tween = this.tweens.add({
      targets: wipe,
      edge: WIDTH + WIPE_BAND_W,
      duration: WIPE_MS,
      ease: 'Cubic.easeInOut',
      onUpdate: draw,
      onComplete: finish,
    });
    const settle = this.tweens.add({ targets: banner, scaleX: fitX, scaleY: fitY, duration: WIPE_MS, ease: 'Cubic.easeOut' });
    this.finishWipe = () => {
      tween.stop();
      settle.stop();
      banner.setScale(fitX, fitY);
      finish();
    };
  }

  /** 이름은 자모를 하나씩 조립해 쓰고, 나머지 글과 능력치 막대는 위에서부터 차례로 밀려 들어온다. */
  private revealInfo(ch: CharacterDef): void {
    const color = `#${ch.color.toString(16).padStart(6, '0')}`;
    // 부제 자리는 완성된 이름 폭으로 정한다
    this.nameText.setText(ch.nameKor).setColor(color);
    const subX = this.nameText.x + this.nameText.width + 24;
    const steps = hangulTypingSteps(ch.nameKor);
    this.typeTimer?.remove(false);
    this.typeTimer = null;
    this.nameText.setText(steps[0]);
    if (steps.length > 1) {
      let n = 0;
      this.typeTimer = this.time.addEvent({
        delay: TYPE_STEP_MS,
        repeat: steps.length - 2,
        callback: () => this.nameText.setText(steps[++n]),
      });
    }
    this.tweens.killTweensOf(this.accent);
    this.accent.setFillStyle(ch.color).setScale(1, 0);
    this.tweens.add({ targets: this.accent, scaleY: 1, duration: 300, ease: 'Cubic.easeOut' });

    this.subText.setText(`${ch.nameEng} · ${ch.title}`).setY(296);
    this.bombText.setText(`필살  ${ch.bombName}${ch.hidden ? '   · 숨겨진 천명사' : ''}`);
    this.infoText.setText(`${ch.desc}\n${ch.specialDesc}\n${ch.chargeDesc}`);
    const speed = speedScale(ch);
    this.statValues[0].setText(`보스 ${ch.measured.bossDps}/초`);
    this.statValues[1].setText(`${Math.round(PLAYER_SPEED * speed)}px/초`);
    this.statValues[2].setText(`${ch.stats.range} / 5`);
    this.statNote.setText(
      `판정 ${ch.hitRadius ?? 6}px · 필살 1회 약 ${ch.measured.bombDamage} · 필살 중 무적 ${(bombInvulnMs(ch.id) / 1000).toFixed(1)}초 · 필살 최대 ${ch.maxBombs ?? MAX_BOMBS}개`,
    );
    [{ obj: this.subText, x: subX }, ...this.slideRows].forEach(({ obj, x }, k) => {
      this.tweens.killTweensOf(obj);
      obj.setX(x - SLIDE_IN_X).setAlpha(0);
      this.tweens.add({ targets: obj, x, alpha: 1, delay: 60 + k * STAGGER_MS, duration: 260, ease: 'Cubic.easeOut' });
    });
    // 막대는 앞 천명사 값에서 새 값으로 늘거나 준다
    [ch.measured.bossDps / MAX_BOSS_DPS, speed / MAX_SPEED_SCALE, ch.stats.range / 5].forEach((v, r) => {
      const fill = this.statFills[r];
      this.tweens.killTweensOf(fill);
      this.tweens.add({ targets: fill, scaleX: Math.max(8, v * STAT_BAR_W) / STAT_BAR_W, delay: 80 + r * STAGGER_MS, duration: 380, ease: 'Cubic.easeOut' });
    });
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
