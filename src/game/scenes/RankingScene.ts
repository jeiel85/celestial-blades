import Phaser from 'phaser';
import { DIFFICULTIES, HEIGHT, UI_FONT, WIDTH } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { CHARACTERS } from '../data/characters';
import { STAGES } from '../data/stages';
import {
  NICKNAME_RULE,
  errorMessage,
  fetchTop,
  loadNickname,
  saveNickname,
  submitScore,
} from '../systems/RankingService';
import type { PilotId, RankRow, ScoreEntry } from '../systems/RankingService';

const FONT = UI_FONT;
const DIFFS: Difficulty[] = DIFFICULTIES;
const TOP = 20;
const PILOT_NAME = Object.fromEntries(CHARACTERS.map((c) => [c.id, c.nameKor])) as Record<PilotId, string>;
const STAGE_NAME = STAGES.map((st) => st.nameKor);
/** 닉네임 칸 폭(px). 한글 12자는 20px 글꼴로 약 240px라 넘치면 줄인다. */
const NICK_MAX_W = 140;

/** 글자가 maxWidth보다 넓으면 비율을 유지해 줄인다(세로 중심 유지). */
function fitWidth(t: Phaser.GameObjects.Text, maxWidth: number): Phaser.GameObjects.Text {
  if (t.width > maxWidth) {
    const s = maxWidth / t.width;
    t.setScale(s).setY(t.y + (t.height * (1 - s)) / 2);
  }
  return t;
}

export interface RankingSceneData {
  /** 게임오버·엔딩에서 넘어온 등록 대기 기록(닉네임 제외) */
  pending?: Omit<ScoreEntry, 'nickname'>;
}

/**
 * 온라인 랭킹 (키 'Ranking'). 난이도 탭 + TOP 20.
 * pending이 있으면 닉네임 입력 창을 먼저 띄우고, 등록 후 내 기록을 강조한다.
 */
export class RankingScene extends Phaser.Scene {
  private save!: SaveSystem;
  private audio!: AudioSystem;
  private diffIndex = 1;
  private pending: RankingSceneData['pending'] = undefined;
  private highlightId: number | null = null;
  private myRank: { rank: number; row: RankRow } | null = null;
  private loadToken = 0;
  private tabs: Phaser.GameObjects.Text[] = [];
  private list: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private form: HTMLDivElement | null = null;
  private onFullscreenChange: (() => void) | null = null;

  constructor() {
    super('Ranking');
  }

  init(raw: RankingSceneData): void {
    this.pending = raw?.pending;
    this.highlightId = null;
    this.myRank = null;
    this.tabs = [];
    this.list = [];
  }

  create(): void {
    this.save = new SaveSystem();
    this.audio = new AudioSystem();
    const s = this.save.settings;
    this.audio.setMasterVolume(s.masterVol);
    this.audio.setSfxVolume(s.sfxVol);
    this.audio.resume();
    this.diffIndex = DIFFS.indexOf(this.pending?.difficulty ?? s.difficulty);
    if (this.diffIndex < 0) this.diffIndex = 1;

    this.add.image(0, 0, 'title_bg').setOrigin(0).setDisplaySize(WIDTH, HEIGHT);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.78).setOrigin(0);
    this.add
      .text(WIDTH / 2, 60, 'RANKING', { fontFamily: FONT, fontSize: '42px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.subtitle = this.add
      .text(WIDTH / 2, 100, '천하의 천명사들', { fontFamily: FONT, fontSize: '16px', color: '#8fd3ff' })
      .setOrigin(0.5);

    DIFFS.forEach((d, i) => {
      const t = this.add
        .text(WIDTH / 2 + (i - (DIFFS.length - 1) / 2) * 170, 148, d, { fontFamily: FONT, fontSize: '24px', color: '#e8f2ff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => this.selectDiff(i));
      this.tabs.push(t);
    });

    this.status = this.add
      .text(WIDTH / 2, 400, '', { fontFamily: FONT, fontSize: '20px', color: '#c9d4e0', align: 'center' })
      .setOrigin(0.5);
    const back = this.add
      .text(WIDTH / 2, 686, '←→ 난이도 · ESC/X 돌아가기', { fontFamily: FONT, fontSize: '16px', color: '#5e7a8f' })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => this.leave());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closeForm();
      this.audio.dispose();
    });

    this.refreshTabs();
    if (this.pending) this.openForm(this.pending);
    else void this.loadList();
  }

  update(): void {
    if (this.form) return;
    const kb = this.input.keyboard;
    if (!kb) return;
    const J = Phaser.Input.Keyboard.JustDown;
    const K = Phaser.Input.Keyboard.KeyCodes;
    if (J(kb.addKey(K.LEFT))) this.selectDiff((this.diffIndex + DIFFS.length - 1) % DIFFS.length);
    else if (J(kb.addKey(K.RIGHT))) this.selectDiff((this.diffIndex + 1) % DIFFS.length);
    else if (J(kb.addKey(K.ESC)) || J(kb.addKey(K.X))) this.leave();
  }

  private leave(): void {
    this.audio.playSfx('menu');
    this.scene.start('Title');
  }

  private selectDiff(i: number): void {
    if (i === this.diffIndex) return;
    this.audio.playSfx('menu');
    this.diffIndex = i;
    this.refreshTabs();
    void this.loadList();
  }

  private refreshTabs(): void {
    this.tabs.forEach((t, i) => {
      if (i === this.diffIndex) t.setColor('#ffd75e').setScale(1.1);
      else t.setColor('#5e7a8f').setScale(1);
    });
  }

  // -- 목록 -------------------------------------------------------------------

  private async loadList(): Promise<void> {
    const token = ++this.loadToken;
    const diff = DIFFS[this.diffIndex];
    this.clearList();
    this.status.setText('불러오는 중…').setVisible(true);
    const res = await fetchTop(diff, TOP);
    // 응답이 오기 전에 탭을 바꾸거나 장면을 떠났으면 버린다.
    if (token !== this.loadToken || !this.scene.isActive()) return;
    if (!res.ok) {
      this.status.setText(errorMessage(res.error));
      return;
    }
    if (res.value.length === 0) {
      this.status.setText('아직 기록이 없어요. 첫 번째 천명사가 되어 보세요!');
      return;
    }
    this.status.setVisible(false);
    this.renderList(res.value);
  }

  private clearList(): void {
    for (const o of this.list) o.destroy();
    this.list = [];
  }

  private renderList(rows: RankRow[]): void {
    const colX = [120, 660];
    const headY = 196;
    // 오른쪽 열(11~20위)은 기록이 10개를 넘을 때만 머리글을 단다.
    for (const x of rows.length > 10 ? colX : colX.slice(0, 1)) {
      this.list.push(
        this.add.text(x, headY, '순위', { fontFamily: FONT, fontSize: '14px', color: '#5e7a8f' }),
        this.add.text(x + 64, headY, '닉네임', { fontFamily: FONT, fontSize: '14px', color: '#5e7a8f' }),
        this.add.text(x + 250, headY, '도달', { fontFamily: FONT, fontSize: '14px', color: '#5e7a8f' }),
        this.add.text(x + 500, headY, '점수', { fontFamily: FONT, fontSize: '14px', color: '#5e7a8f' }).setOrigin(1, 0),
      );
    }
    rows.forEach((r, i) => {
      const x = colX[Math.floor(i / 10)];
      const y = 232 + (i % 10) * 42;
      const mine = r.id === this.highlightId;
      const color = mine ? '#ffd75e' : i < 3 ? '#fff4c2' : '#e8f2ff';
      if (mine) {
        this.list.push(this.add.rectangle(x - 12, y - 6, 524, 38, 0xffd75e, 0.14).setOrigin(0));
      }
      const medal = ['#ffd75e', '#d8e0ea', '#e0a060'][i];
      this.list.push(
        this.add.text(x, y, `${i + 1}`, { fontFamily: FONT, fontSize: '22px', color: medal ?? color, fontStyle: 'bold' }),
        this.add.image(x + 74, y + 13, `portrait_${r.pilot}`).setScale(0.17),
        fitWidth(this.add.text(x + 100, y + 2, r.nickname, { fontFamily: FONT, fontSize: '20px', color }), NICK_MAX_W),
        this.add.text(x + 250, y + 4, `${r.cleared ? 'CLEAR' : STAGE_NAME[r.stage - 1] ?? ''} · ${PILOT_NAME[r.pilot]}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: r.cleared ? '#53e0b0' : '#8fa4b8',
        }),
        this.add
          .text(x + 500, y + 1, r.score.toLocaleString('ko-KR'), { fontFamily: FONT, fontSize: '22px', color, fontStyle: 'bold' })
          .setOrigin(1, 0),
      );
    });
    // 내 기록이 TOP 밖이면 아래에 따로 보여 준다.
    if (this.myRank && !rows.some((r) => r.id === this.myRank?.row.id) && this.myRank.row.difficulty === DIFFS[this.diffIndex]) {
      this.list.push(
        this.add
          .text(
            WIDTH / 2,
            656,
            `내 기록  ${this.myRank.rank > 0 ? `${this.myRank.rank}위` : ''}  ${this.myRank.row.nickname}  ${this.myRank.row.score.toLocaleString('ko-KR')}`,
            { fontFamily: FONT, fontSize: '18px', color: '#ffd75e' },
          )
          .setOrigin(0.5),
      );
    }
  }

  // -- 닉네임 입력 (HTML 입력창) ------------------------------------------------

  private openForm(pending: Omit<ScoreEntry, 'nickname'>): void {
    // 입력하는 동안 Phaser가 키를 가로채지 않게 한다(Z·X 등이 입력창에 안 들어가는 문제 방지).
    const kb = this.input.keyboard;
    if (kb) {
      kb.enabled = false;
      kb.disableGlobalCapture();
    }
    const form = document.createElement('div');
    form.className = 'rank-form';
    form.innerHTML = `
      <div class="rank-form__panel" role="dialog" aria-modal="true" aria-labelledby="rank-form-title">
        <h2 id="rank-form-title">랭킹 등록</h2>
        <p class="rank-form__score"></p>
        <input class="rank-form__input" maxlength="12" autocomplete="nickname" spellcheck="false" placeholder="닉네임 (2~12자)" />
        <p class="rank-form__error" aria-live="polite"></p>
        <div class="rank-form__buttons">
          <button type="button" class="rank-form__skip">건너뛰기</button>
          <button type="button" class="rank-form__submit">등록</button>
        </div>
      </div>`;
    const scoreLine = form.querySelector('.rank-form__score') as HTMLParagraphElement;
    scoreLine.textContent = `${pending.difficulty} · ${PILOT_NAME[pending.pilot]} · ${pending.score.toLocaleString('ko-KR')}점`;
    const input = form.querySelector('.rank-form__input') as HTMLInputElement;
    const error = form.querySelector('.rank-form__error') as HTMLParagraphElement;
    const submit = form.querySelector('.rank-form__submit') as HTMLButtonElement;
    const skip = form.querySelector('.rank-form__skip') as HTMLButtonElement;
    input.value = loadNickname();

    let sending = false;
    const send = async (): Promise<void> => {
      // Enter 연타·키 반복으로 같은 기록이 여러 번 저장되지 않게 한다.
      if (sending) return;
      const nickname = input.value.trim();
      if (!NICKNAME_RULE.test(nickname)) {
        error.textContent = errorMessage('invalid');
        return;
      }
      sending = true;
      submit.disabled = true;
      skip.disabled = true;
      error.textContent = '등록 중…';
      const res = await submitScore({ ...pending, nickname });
      if (!this.scene.isActive()) return;
      if (!res.ok) {
        error.textContent = errorMessage(res.error);
        sending = false;
        submit.disabled = false;
        skip.disabled = false;
        return;
      }
      saveNickname(nickname);
      this.audio.playSfx('item');
      this.highlightId = res.value.row.id;
      this.myRank = res.value;
      this.closeForm();
      this.toast(res.value.rank > 0 ? `${res.value.rank}위로 등록됐어요!` : '등록됐어요!');
      void this.loadList();
    };
    submit.addEventListener('click', () => void send());
    skip.addEventListener('click', () => {
      this.closeForm();
      void this.loadList();
    });
    input.addEventListener('keydown', (e) => {
      // 한글 조합 중의 Enter(글자 확정)·Escape(조합 취소)는 입력기에 맡긴다. 229는 구형 브라우저의 조합 중 키 코드.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') void send();
      else if (e.key === 'Escape') skip.click();
    });

    // 전체화면이면 Phaser가 캔버스를 감싼 요소만 전체화면으로 띄우므로, 그 안에 붙여야 입력창이 보인다.
    // 전체화면이 바뀌면(특히 해제 시 Phaser가 감싼 요소를 지운다) 입력창을 다시 붙인다.
    const mount = (): void => {
      (document.fullscreenElement ?? document.body).appendChild(form);
    };
    mount();
    this.form = form;
    // 닫힌 뒤에 예약된 다시 붙이기가 실행되지 않도록 아직 열려 있는지 확인한다.
    this.onFullscreenChange = () => {
      window.setTimeout(() => {
        if (this.form === form) mount();
      }, 0);
    };
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    input.focus();
    input.select();
  }

  private closeForm(): void {
    if (!this.form) return;
    if (this.onFullscreenChange) document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.onFullscreenChange = null;
    this.form.remove();
    this.form = null;
    this.pending = undefined;
    const kb = this.input.keyboard;
    if (kb) {
      kb.enableGlobalCapture();
      kb.resetKeys();
      kb.enabled = true;
    }
  }

  /** 부제목 자리에 잠깐 알림을 띄운다. */
  private toast(msg: string): void {
    this.subtitle.setVisible(false);
    const t = this.add
      .text(WIDTH / 2, 100, msg, { fontFamily: FONT, fontSize: '20px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 2600,
      duration: 600,
      onComplete: () => {
        t.destroy();
        this.subtitle.setVisible(true);
      },
    });
  }
}
