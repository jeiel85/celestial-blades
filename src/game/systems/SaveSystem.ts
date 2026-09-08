import type { Difficulty } from '../GameConfig';

export const SAVE_KEY = 'celestial-blades-save';

export interface SaveSettings {
  masterVol: number;
  sfxVol: number;
  musicVol: number;
  shake: boolean;
  difficulty: Difficulty;
  lastChar: number;
}

export interface SaveData {
  hiscore: number;
  settings: SaveSettings;
}

const DEFAULTS: SaveData = {
  hiscore: 0,
  settings: {
    masterVol: 0.8,
    sfxVol: 0.9,
    musicVol: 0.7,
    shake: true,
    difficulty: 'NORMAL',
    lastChar: 0,
  },
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function sanitize(raw: unknown): SaveData {
  const fallback: SaveData = {
    hiscore: DEFAULTS.hiscore,
    settings: { ...DEFAULTS.settings },
  };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r = raw as Partial<SaveData>;
  const out: SaveData = {
    hiscore: typeof r.hiscore === 'number' && Number.isFinite(r.hiscore) && r.hiscore > 0 ? Math.floor(r.hiscore) : 0,
    settings: { ...DEFAULTS.settings },
  };
  const s = r.settings;
  if (typeof s === 'object' && s !== null) {
    const ps = s as Partial<SaveSettings>;
    if (typeof ps.masterVol === 'number') out.settings.masterVol = clamp01(ps.masterVol);
    if (typeof ps.sfxVol === 'number') out.settings.sfxVol = clamp01(ps.sfxVol);
    if (typeof ps.musicVol === 'number') out.settings.musicVol = clamp01(ps.musicVol);
    if (typeof ps.shake === 'boolean') out.settings.shake = ps.shake;
    if (ps.difficulty === 'EASY' || ps.difficulty === 'NORMAL' || ps.difficulty === 'HARD') {
      out.settings.difficulty = ps.difficulty;
    }
    if (typeof ps.lastChar === 'number' && Number.isFinite(ps.lastChar)) {
      out.settings.lastChar = Math.min(2, Math.max(0, Math.floor(ps.lastChar)));
    }
  }
  return out;
}

export class SaveSystem {
  private data: SaveData;

  constructor() {
    this.data = this.load();
  }

  load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        return { hiscore: DEFAULTS.hiscore, settings: { ...DEFAULTS.settings } };
      }
      return sanitize(JSON.parse(raw) as unknown);
    } catch {
      return { hiscore: DEFAULTS.hiscore, settings: { ...DEFAULTS.settings } };
    }
  }

  /** 현재 데이터의 방어적 복사본 */
  get(): SaveData {
    return { hiscore: this.data.hiscore, settings: { ...this.data.settings } };
  }

  get hiscore(): number {
    return this.data.hiscore;
  }

  get settings(): SaveSettings {
    return { ...this.data.settings };
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // 저장 실패(사설 모드 등)는 무시하고 메모리 값으로 계속 플레이
    }
  }

  /** 설정 일부만 갱신하고 즉시 저장 */
  updateSettings(patch: Partial<SaveSettings>): SaveData {
    const next: SaveSettings = { ...this.data.settings };
    if (patch.masterVol !== undefined) next.masterVol = clamp01(patch.masterVol);
    if (patch.sfxVol !== undefined) next.sfxVol = clamp01(patch.sfxVol);
    if (patch.musicVol !== undefined) next.musicVol = clamp01(patch.musicVol);
    if (patch.shake !== undefined) next.shake = patch.shake;
    if (patch.difficulty === 'EASY' || patch.difficulty === 'NORMAL' || patch.difficulty === 'HARD') {
      next.difficulty = patch.difficulty;
    }
    if (patch.lastChar !== undefined && Number.isFinite(patch.lastChar)) {
      next.lastChar = Math.min(2, Math.max(0, Math.floor(patch.lastChar)));
    }
    this.data = { hiscore: this.data.hiscore, settings: next };
    this.save();
    return this.get();
  }

  /** 점수가 최고기록을 넘으면 갱신+저장하고 true 반환 */
  submitScore(score: number): boolean {
    const s = Math.floor(score);
    if (!Number.isFinite(s) || s <= this.data.hiscore) return false;
    this.data = { hiscore: s, settings: { ...this.data.settings } };
    this.save();
    return true;
  }
}
