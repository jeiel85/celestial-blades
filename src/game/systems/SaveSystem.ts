import { parseDifficulty } from '../GameConfig';
import type { Difficulty } from '../GameConfig';
import { CHARACTERS, clampCharIndex } from '../data/characters';
import type { CharacterId } from '../data/characters';
import { STORY } from '../data/story';

export const SAVE_KEY = 'celestial-blades-save';

export interface SaveSettings {
  masterVol: number;
  sfxVol: number;
  musicVol: number;
  shake: boolean;
  difficulty: Difficulty;
  lastChar: number;
}

/** 스토리 다시보기 해금 기록: 본 장 번호, 엔딩을 본(= 그 캐릭터로 클리어한) 천명사 */
export interface StoryProgress {
  chapters: number[];
  endings: CharacterId[];
}

export interface SaveData {
  hiscore: number;
  settings: SaveSettings;
  story: StoryProgress;
  /** 캐릭터 선택 화면 비밀 커맨드로 숨겨진 천명사를 연 적이 있다 */
  secretPilots: boolean;
}

const DEFAULTS: SaveData = {
  hiscore: 0,
  story: { chapters: [], endings: [] },
  secretPilots: false,
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
  if (typeof raw !== 'object' || raw === null) return fresh();
  const r = raw as Partial<SaveData>;
  const out: SaveData = {
    hiscore: typeof r.hiscore === 'number' && Number.isFinite(r.hiscore) && r.hiscore > 0 ? Math.floor(r.hiscore) : 0,
    settings: { ...DEFAULTS.settings },
    story: sanitizeStory(r.story),
    secretPilots: r.secretPilots === true,
  };
  const s = r.settings;
  if (typeof s === 'object' && s !== null) {
    const ps = s as Partial<SaveSettings>;
    if (typeof ps.masterVol === 'number') out.settings.masterVol = clamp01(ps.masterVol);
    if (typeof ps.sfxVol === 'number') out.settings.sfxVol = clamp01(ps.sfxVol);
    if (typeof ps.musicVol === 'number') out.settings.musicVol = clamp01(ps.musicVol);
    if (typeof ps.shake === 'boolean') out.settings.shake = ps.shake;
    if (ps.difficulty !== undefined) out.settings.difficulty = parseDifficulty(ps.difficulty);
    if (ps.lastChar !== undefined) out.settings.lastChar = clampCharIndex(ps.lastChar);
  }
  return out;
}

function fresh(): SaveData {
  return copy(DEFAULTS);
}

function copy(d: SaveData): SaveData {
  return {
    hiscore: d.hiscore,
    settings: { ...d.settings },
    story: { chapters: [...d.story.chapters], endings: [...d.story.endings] },
    secretPilots: d.secretPilots,
  };
}

/** 저장된 해금 기록 중 지금 게임에 있는 장·캐릭터만 남긴다(구버전 저장에는 없음 → 빈 기록). */
function sanitizeStory(raw: unknown): StoryProgress {
  const out: StoryProgress = { chapters: [], endings: [] };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Partial<Record<keyof StoryProgress, unknown>>;
  if (Array.isArray(r.chapters)) {
    const set = new Set<number>();
    for (const c of r.chapters) if (Number.isInteger(c) && c >= 0 && c < STORY.length) set.add(c as number);
    out.chapters = [...set].sort((a, b) => a - b);
  }
  if (Array.isArray(r.endings)) {
    const ids = new Set(CHARACTERS.map((c) => c.id));
    out.endings = [...new Set(r.endings.filter((e): e is CharacterId => ids.has(e as CharacterId)))];
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
        return fresh();
      }
      return sanitize(JSON.parse(raw) as unknown);
    } catch {
      return fresh();
    }
  }

  /** 현재 데이터의 방어적 복사본 */
  get(): SaveData {
    return copy(this.data);
  }

  get story(): StoryProgress {
    return copy(this.data).story;
  }

  /** 스토리 장을 봤다고 기록(다시보기 해금) */
  markChapterSeen(chapter: number): void {
    if (!Number.isInteger(chapter) || chapter < 0 || chapter >= STORY.length) return;
    if (this.data.story.chapters.includes(chapter)) return;
    this.data = copy(this.data);
    this.data.story.chapters = [...this.data.story.chapters, chapter].sort((a, b) => a - b);
    this.save();
  }

  /** 캐릭터 엔딩을 봤다고 기록(다시보기 해금) */
  markEndingSeen(id: CharacterId): void {
    if (this.data.story.endings.includes(id)) return;
    this.data = copy(this.data);
    this.data.story.endings = [...this.data.story.endings, id];
    this.save();
  }

  /** 숨겨진 천명사 해금: 아무 천명사로나 한 번 클리어(엔딩을 봄)했거나 비밀 커맨드를 입력했다 */
  get hiddenPilotsUnlocked(): boolean {
    return this.data.secretPilots || this.data.story.endings.length > 0;
  }

  /** 비밀 커맨드 입력 기록 */
  unlockHiddenPilots(): void {
    if (this.data.secretPilots) return;
    this.data = { ...copy(this.data), secretPilots: true };
    this.save();
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
    if (patch.difficulty !== undefined) next.difficulty = parseDifficulty(patch.difficulty);
    if (patch.lastChar !== undefined) next.lastChar = clampCharIndex(patch.lastChar);
    this.data = { ...copy(this.data), settings: next };
    this.save();
    return this.get();
  }

  /** 점수가 최고기록을 넘으면 갱신+저장하고 true 반환 */
  submitScore(score: number): boolean {
    const s = Math.floor(score);
    if (!Number.isFinite(s) || s <= this.data.hiscore) return false;
    this.data = { ...copy(this.data), hiscore: s };
    this.save();
    return true;
  }
}
