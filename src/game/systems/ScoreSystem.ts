import { COMBO_WINDOW } from '../GameConfig';
import type { SaveSystem } from './SaveSystem';

/**
 * 점수/콤보 시스템. GameScene이 소유하고 매 프레임 update(dt)로 콤보 만료를 처리.
 * - addScore: 현재 콤보 배율 적용
 * - registerKill: 콤보+1 후 소/대형 기본점에 배율 적용한 값을 반환
 * - 피격 시 onPlayerHit()로 리셋, 3초 무처치 시 자동 리셋
 */
export class ScoreSystem {
  private score = 0;
  private combo = 0;
  private comboLeft = 0;
  private maxCombo = 0;
  private pendingHi = false;

  constructor(private readonly save: SaveSystem) {}

  /** 현재 콤보 배율 (1 + combo*0.1, cap 3.0) */
  get multiplier(): number {
    return Math.min(3.0, 1 + this.combo * 0.1);
  }

  get currentScore(): number {
    return Math.floor(this.score);
  }

  get currentCombo(): number {
    return this.combo;
  }

  get bestCombo(): number {
    return this.maxCombo;
  }

  get hiscore(): number {
    return this.save.hiscore;
  }

  get isNewHigh(): boolean {
    return this.pendingHi || this.currentScore > this.save.hiscore;
  }

  /** 배율을 적용해 가산 (아이템/보너스용) */
  addScore(points: number): number {
    if (!Number.isFinite(points) || points <= 0) return this.currentScore;
    const gained = Math.floor(points * this.multiplier);
    this.score += gained;
    if (this.currentScore > this.save.hiscore) this.pendingHi = true;
    return gained;
  }

  /** 배율 없이 가산 (클리어 보너스 합산 등 최종 정산용) */
  addRaw(points: number): number {
    if (!Number.isFinite(points) || points <= 0) return this.currentScore;
    const gained = Math.floor(points);
    this.score += gained;
    if (this.currentScore > this.save.hiscore) this.pendingHi = true;
    return gained;
  }

  /**
   * 처치 등록: 콤보+1 후 기본점(소형 100/대형 500)에 배율을 적용해 가산.
   * 가산된 점수를 반환한다.
   */
  registerKill(x: number, y: number, isBig: boolean): number {
    void x;
    void y;
    this.combo += 1;
    this.comboLeft = COMBO_WINDOW;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const base = isBig ? 500 : 100;
    const gained = Math.floor(base * this.multiplier);
    this.score += gained;
    if (this.currentScore > this.save.hiscore) this.pendingHi = true;
    return gained;
  }

  /** 피격 시 콤보 리셋 */
  onPlayerHit(): void {
    this.combo = 0;
    this.comboLeft = 0;
  }

  resetCombo(): void {
    this.combo = 0;
    this.comboLeft = 0;
  }

  resetRun(): void {
    this.score = 0;
    this.combo = 0;
    this.comboLeft = 0;
    this.maxCombo = 0;
    this.pendingHi = false;
  }

  update(dtMs: number): void {
    if (this.combo > 0) {
      this.comboLeft -= dtMs;
      if (this.comboLeft <= 0) {
        this.combo = 0;
        this.comboLeft = 0;
      }
    }
  }

  get comboTimeLeft(): number {
    return Math.max(0, this.comboLeft);
  }

  getDisplay(): { score: number; hi: number; combo: number; mult: number; newHigh: boolean } {
    return {
      score: this.currentScore,
      hi: Math.max(this.save.hiscore, this.currentScore),
      combo: this.combo,
      mult: this.multiplier,
      newHigh: this.isNewHigh,
    };
  }

  /** 하이스코어 갱신 체크 + 저장. 갱신됐으면 true. */
  checkAndSaveHiScore(): boolean {
    return this.save.submitScore(this.currentScore);
  }
}
