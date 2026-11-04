/**
 * 어시스트(자동 공격·자동 필살기·자동 회피). 설정(SaveSystem)에 하나씩 켜고 끄며, 모바일 기기에서는 처음부터 켜 둔다.
 * 자동 회피는 여기의 AutoDodge가 정하고, 공격·필살기는 Player가 이 플래그를 보고 처리한다.
 */
export interface AssistFlags {
  /** 공격키를 누르지 않아도 기본 공격을 계속 쏜다(차지는 공격키를 눌러 모은다) */
  shot: boolean;
  /** 맞는 순간 필살기가 남아 있으면 대신 터뜨려 목숨을 지킨다 */
  bomb: boolean;
  /** 곧 맞을 길이면 기체를 비켜 움직인다 */
  dodge: boolean;
}

/** 휴대폰·태블릿(주 입력이 손가락)인가. 터치 화면 노트북처럼 마우스가 주 입력이면 아니다. */
export function isMobileDevice(): boolean {
  try {
    if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return true;
    return typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function anyAssist(f: AssistFlags): boolean {
  return f.shot || f.bomb || f.dodge;
}

/** 랭킹 `scores.assist`에 저장하는 비트 합: 자동 공격 1 · 자동 필살기 2 · 자동 회피 4 */
export function assistMask(f: AssistFlags): number {
  return (f.shot ? 1 : 0) | (f.bomb ? 2 : 0) | (f.dodge ? 4 : 0);
}

export function assistFromMask(mask: number): AssistFlags {
  return { shot: (mask & 1) !== 0, bomb: (mask & 2) !== 0, dodge: (mask & 4) !== 0 };
}

/** 랭킹 목록용 짧은 이름("공격·회피"), 없으면 빈 문자열 */
export function assistShortNames(f: AssistFlags): string {
  const names: string[] = [];
  if (f.shot) names.push('공격');
  if (f.bomb) names.push('필살');
  if (f.dodge) names.push('회피');
  return names.join('·');
}

/** 켜진 어시스트 이름("자동 공격 · 자동 회피"), 없으면 빈 문자열 */
export function assistNames(f: AssistFlags): string {
  const names: string[] = [];
  if (f.shot) names.push('자동 공격');
  if (f.bomb) names.push('자동 필살기');
  if (f.dodge) names.push('자동 회피');
  return names.join(' · ');
}

export interface DodgeThreat {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface DodgeShip {
  x: number;
  y: number;
  /** 판정 반지름(px) */
  r: number;
  /** 지금 이동 속도(px/s, 집중 중이면 느리다) */
  speed: number;
}

export interface DodgeBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Vec {
  x: number;
  y: number;
}

/** 앞을 내다보는 시간(초)과 확인 간격. 탄은 이 동안 곧게 날아간다고 본다. */
const HORIZON = 0.45;
const STEP = 0.05;
/** 판정끼리 이보다 가까워지면 맞는 길로 본다(px) */
const MARGIN = 5;
/** 여유 공간은 이 거리까지만 점수에 넣는다(px) */
const CLEAR_CAP = 48;

/** 고를 수 있는 움직임: 멈춤 + 여덟 방향 × 전속·반속 */
const MOVES: Vec[] = (() => {
  const out: Vec[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    out.push({ x: Math.cos(a), y: Math.sin(a) });
    out.push({ x: Math.cos(a) * 0.5, y: Math.sin(a) * 0.5 });
  }
  return out;
})();

interface Outcome {
  /** 처음 맞는 시각(초), 안 맞으면 Infinity */
  hitT: number;
  /** 내다보는 동안 가장 가까웠던 판정 간격(px) */
  clear: number;
}

/**
 * 자동 회피. 플레이어가 가려는 방향이 안전하면 그대로 두고, 곧 맞을 길이면 안전한 움직임 가운데
 * 원래 의도와 가장 가깝고 여유가 큰 쪽으로 바꾼다. 안전한 길이 없으면 가장 늦게 맞는 쪽을 고른다
 * (그래도 맞으면 자동 필살기가 받아 준다). 프레임마다 방향이 뒤집혀 떨지 않게 직전 선택에 가산점을 준다.
 */
export class AutoDodge {
  private last: Vec = { x: 0, y: 0 };
  private readonly near: DodgeThreat[] = [];

  steer(want: Vec, ship: DodgeShip, threats: readonly DodgeThreat[], bounds: DodgeBounds): Vec {
    // 이번 내다보기 동안 닿을 수 없는 탄은 뺀다.
    const near = this.near;
    near.length = 0;
    for (const t of threats) {
      const reach = (Math.hypot(t.vx, t.vy) + ship.speed) * HORIZON + ship.r + t.r + MARGIN;
      if (Math.abs(t.x - ship.x) > reach || Math.abs(t.y - ship.y) > reach) continue;
      near.push(t);
    }
    if (near.length === 0 || this.simulate(want, ship, bounds).hitT === Infinity) {
      this.last = want;
      return want;
    }

    const wantLen = Math.hypot(want.x, want.y);
    let best = want;
    let bestScore = -Infinity;
    for (const m of [want, ...MOVES]) {
      const o = this.simulate(m, ship, bounds);
      const mLen = Math.hypot(m.x, m.y);
      // 의도와 비슷할수록(-1..1), 입력이 없을 때는 덜 움직일수록 낫다
      const intent = wantLen > 0.1 ? (mLen > 0 ? (m.x * want.x + m.y * want.y) / (mLen * wantLen) : 0) : -mLen;
      const sticky = Math.abs(m.x - this.last.x) < 0.01 && Math.abs(m.y - this.last.y) < 0.01 ? 1 : 0;
      const score =
        (o.hitT === Infinity ? 1000 : o.hitT * 200) + (Math.min(o.clear, CLEAR_CAP) / CLEAR_CAP) * 4 + intent * 3 + sticky;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    this.last = best;
    return best;
  }

  private simulate(move: Vec, ship: DodgeShip, bounds: DodgeBounds): Outcome {
    let clear = Infinity;
    for (let t = STEP; t <= HORIZON + 1e-6; t += STEP) {
      const px = Math.min(bounds.maxX, Math.max(bounds.minX, ship.x + move.x * ship.speed * t));
      const py = Math.min(bounds.maxY, Math.max(bounds.minY, ship.y + move.y * ship.speed * t));
      for (const b of this.near) {
        const gap = Math.hypot(b.x + b.vx * t - px, b.y + b.vy * t - py) - ship.r - b.r;
        if (gap < MARGIN) return { hitT: t, clear: gap };
        if (gap < clear) clear = gap;
      }
    }
    return { hitT: Infinity, clear };
  }
}
