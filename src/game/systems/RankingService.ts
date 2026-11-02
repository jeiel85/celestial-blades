import type { Difficulty } from '../GameConfig';
import type { CharacterId } from '../data/characters';

/**
 * 온라인 랭킹(Supabase `public.scores`, supabase/migrations 참고).
 * supabase-js 없이 PostgREST를 fetch로 직접 부른다.
 *
 * publishable 키는 브라우저에 공개되는 용도의 키다. 쓰기 권한은 RLS·컬럼 권한·트리거로 제한되어 있다
 * (조회·제출만 가능, 수정·삭제 불가, 닉네임별 1분 3회). 순수 클라이언트 게임이라 점수 위조를 완전히 막지는 못한다.
 */
const SUPABASE_URL = 'https://zexxkfjmyayyuewqkxee.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_nWVKphXlj57jNhS_-Vyfeg_F-3_6a9D';
const ENDPOINT = `${SUPABASE_URL}/rest/v1/scores`;
const TIMEOUT_MS = 6000;
const NICKNAME_KEY = 'celestial-blades-nickname';

/** DB 제약과 같은 규칙: 2~12자, 한글·영문·숫자·_·- */
export const NICKNAME_RULE = /^[0-9A-Za-z가-힣_-]{2,12}$/;

export type PilotId = CharacterId;

export interface ScoreEntry {
  nickname: string;
  score: number;
  pilot: PilotId;
  difficulty: Difficulty;
  /** 도달 스테이지 1~4 (4 = 천문) */
  stage: number;
  cleared: boolean;
}

export interface RankRow extends ScoreEntry {
  id: number;
  created_at: string;
}

export type RankingError = 'network' | 'rate' | 'invalid' | 'server';

export type Result<T> = { ok: true; value: T } | { ok: false; error: RankingError };

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}`, ...extra };
}

async function request(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/** 난이도별 상위 기록(점수 내림차순, 동점은 먼저 올린 기록(작은 id)이 위). */
export async function fetchTop(difficulty: Difficulty, limit = 20): Promise<Result<RankRow[]>> {
  const q = new URLSearchParams({
    select: 'id,nickname,score,pilot,difficulty,stage,cleared,created_at',
    difficulty: `eq.${difficulty}`,
    order: 'score.desc,id.asc',
    limit: String(limit),
  });
  try {
    const res = await request(`${ENDPOINT}?${q}`, { headers: headers() });
    if (!res.ok) return { ok: false, error: 'server' };
    return { ok: true, value: (await res.json()) as RankRow[] };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** 기록을 올리고, 저장된 행과 그 난이도에서의 순위(1부터, 조회 실패 시 0)를 돌려준다. */
export async function submitScore(entry: ScoreEntry): Promise<Result<{ row: RankRow; rank: number }>> {
  if (!NICKNAME_RULE.test(entry.nickname)) return { ok: false, error: 'invalid' };
  try {
    const res = await request(ENDPOINT, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      if (body?.message === 'rate limited') return { ok: false, error: 'rate' };
      // 23514: check 제약 위반, 42501: RLS 위반
      if (body?.code === '23514' || body?.code === '42501') return { ok: false, error: 'invalid' };
      return { ok: false, error: 'server' };
    }
    const [row] = (await res.json()) as RankRow[];
    // 저장은 끝났으므로 순위 조회가 실패해도 성공으로 돌려준다(재시도하면 같은 기록이 또 저장된다).
    return { ok: true, value: { row, rank: await rankOf(row) } };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** fetchTop과 같은 정렬 기준의 순위: 더 높은 점수 + 같은 점수 중 먼저 올린 기록 수 + 1. 실패하면 0. */
async function rankOf(row: RankRow): Promise<number> {
  const q = new URLSearchParams({
    select: 'id',
    difficulty: `eq.${row.difficulty}`,
    or: `(score.gt.${row.score},and(score.eq.${row.score},id.lt.${row.id}))`,
  });
  try {
    const res = await request(`${ENDPOINT}?${q}`, { method: 'HEAD', headers: headers({ Prefer: 'count=exact' }) });
    if (!res.ok) return 0;
    const ahead = Number(res.headers.get('content-range')?.split('/')[1]);
    return Number.isFinite(ahead) ? ahead + 1 : 0;
  } catch {
    return 0;
  }
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(name: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, name);
  } catch {
    // 저장 실패(사생활 보호 모드 등)는 다음에 다시 입력하면 되므로 무시
  }
}

export function errorMessage(error: RankingError): string {
  switch (error) {
    case 'rate':
      return '잠시 후 다시 시도해 주세요 (같은 닉네임은 1분에 3번까지).';
    case 'invalid':
      return '닉네임은 2~12자, 한글·영문·숫자·_·- 만 쓸 수 있어요.';
    case 'network':
      return '랭킹 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.';
    default:
      return '랭킹 서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
  }
}
