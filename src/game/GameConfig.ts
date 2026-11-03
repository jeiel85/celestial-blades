import type { AudioSystem } from './systems/AudioSystem';
import type { Effects } from './effects/Effects';

// ---------------------------------------------------------------------------
// 기본 해상도 (논리 해상도 1280x720, Scale.FIT + CENTER_BOTH)
// ---------------------------------------------------------------------------
export const WIDTH = 1280;
export const HEIGHT = 720;

// 글꼴(둘 다 OFL, @fontsource로 번들). BootScene이 실제로 쓰이는 글자의 조각을 미리 받은 뒤 장면을 연다.
/** 메뉴·HUD·대사 */
export const UI_FONT = '"Gowun Dodum", "Malgun Gothic", sans-serif';
/** 타이틀 로고 */
export const LOGO_FONT = '"Song Myung", serif';
export const LOGO_TEXT = '천명비행록';

// ---------------------------------------------------------------------------
// 플레이어 / 전투 밸런스 상수
// ---------------------------------------------------------------------------
/** 플레이어 기본 이동 속도 (px/s) */
export const PLAYER_SPEED = 380;
/** 집중(이동 저속) 배율 */
export const FOCUS_SPEED_MULT = 0.6;
/** 차지 최대까지 걸리는 시간 (ms) */
export const CHARGE_TIME = 1200;
/** 피격 후 무적 시간 (ms) */
export const PLAYER_INVULN = 2000;
/** 기본 목숨 수 (EASY는 프리셋에서 +1) */
export const BASE_LIVES = 3;
/** 필살기(폭탄) 최대 보유 수 */
export const MAX_BOMBS = 4;
/** 스테이지 시작 시 필살기 보유 수 */
export const START_BOMBS = 2;
/** 콤보 유지 윈도우 (ms, 이 시간 무처치 시 리셋) */
export const COMBO_WINDOW = 3000;
/** 파워 단계 수 (0..MAX_POWER_LEVEL) */
export const MAX_POWER = 4;
export const MAX_POWER_LEVEL = 3;
/** 피격 판정 반경 (px, 본체보다 작은 코어 판정) */
export const HITBOX_RADIUS = 5;
/** 탄 화면 밖 제거 여유 (px) */
export const BULLET_DESPAWN_MARGIN = 80;
/** 플레이어 이동 가능 영역: 화면 좌측 70% */
export const PLAYER_MIN_X = 40;
export const PLAYER_MAX_X = Math.floor(WIDTH * 0.7);
export const PLAYER_MIN_Y = 48;
export const PLAYER_MAX_Y = HEIGHT - 48;
/** 필살기 무적 시간 (ms, 컷인이 끝나 공격이 나간 뒤부터) */
export const BOMB_INVULN = 1500;
/** 필살기 컷인 길이 (ms, 실제 시간). 이 동안 게임 시간은 거의 멈춘다. */
export const CUTIN_MS = 900;
/** 돌진(무영 차지) 거리/무적 */
export const DASH_DISTANCE = 420;
export const DASH_INVULN = 250;

// ---------------------------------------------------------------------------
// 아이템 드롭 확률 (적 처치 시, 0..1)
// ---------------------------------------------------------------------------
export const DROP_RATE_P = 0.06;
export const DROP_RATE_B = 0.02;
export const DROP_RATE_L = 0.008;
export const DROP_RATE_G = 0.12;

export type ItemType = 'P' | 'B' | 'L' | 'G';

// ---------------------------------------------------------------------------
// 난이도
// ---------------------------------------------------------------------------
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME';

/** 선택 화면·랭킹 탭에 나오는 순서 */
export const DIFFICULTIES: Difficulty[] = ['EASY', 'NORMAL', 'HARD', 'EXTREME'];

/** 저장값·씬 데이터에서 온 난이도를 검증한다(모르는 값은 NORMAL). */
export function parseDifficulty(v: unknown): Difficulty {
  return DIFFICULTIES.includes(v as Difficulty) ? (v as Difficulty) : 'NORMAL';
}

export interface DifficultyPreset {
  /** 적탄 속도 배율 */
  bulletSpeed: number;
  /** 탄 밀도(발사 수/빈도) 배율 */
  density: number;
  /** 밀도를 발수에 반영할 때의 상한 배율 */
  countCap: number;
  /** 시작 목숨 */
  lives: number;
  /** 스테이지 시작 시 필살기 수(이월분이 더 많으면 이월분) */
  startBombs: number;
  /** 보스 공격 빈도 배율(클수록 자주 쏜다) */
  bossRate: number;
  /** 보스·적 HP 배율 */
  bossHp: number;
  enemyHp: number;
  /** 원형 탄막에서 비우는 탄 수의 상한(작을수록 빈틈이 좁다) */
  ringSkipMax: number;
  /** 적이 죽을 때 되갚음탄(격파탄)을 남긴다 */
  revenge: boolean;
  /** 목숨(L) 아이템이 나오는가 */
  lifeDrops: boolean;
  /** 게임오버 후 RETRY가 그 스테이지부터 이어 하는가(false면 1스테이지부터) */
  stageRetry: boolean;
  label: string;
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  EASY: { bulletSpeed: 0.8, density: 0.75, countCap: 1.6, lives: 4, startBombs: 3, bossRate: 1, bossHp: 0.85, enemyHp: 0.9, ringSkipMax: 4, revenge: false, lifeDrops: true, stageRetry: true, label: 'EASY' },
  NORMAL: { bulletSpeed: 1.0, density: 1.0, countCap: 1.6, lives: 3, startBombs: 2, bossRate: 1, bossHp: 1, enemyHp: 1, ringSkipMax: 4, revenge: false, lifeDrops: true, stageRetry: true, label: 'NORMAL' },
  HARD: { bulletSpeed: 1.15, density: 1.3, countCap: 1.6, lives: 3, startBombs: 2, bossRate: 1, bossHp: 1.25, enemyHp: 1.3, ringSkipMax: 4, revenge: false, lifeDrops: true, stageRetry: true, label: 'HARD' },
  // 거의 완벽한 회피를 요구하는 난이도: 목숨 1·필살기 0으로 시작, 목숨 아이템 없음, 격파탄,
  // 탄속 1.45배·탄 수 2.1배(상한 2.4배), 원형탄 빈틈 1발분. 안전 경로는 모든 패턴에 남아 있다.
  EXTREME: { bulletSpeed: 1.45, density: 2.1, countCap: 2.4, lives: 1, startBombs: 0, bossRate: 1.35, bossHp: 1.6, enemyHp: 1.5, ringSkipMax: 1, revenge: true, lifeDrops: false, stageRetry: false, label: 'EXTREME' },
};

// ---------------------------------------------------------------------------
// 공용 색 상수
// ---------------------------------------------------------------------------
export const COLORS = {
  bg: 0x05070d,
  white: 0xffffff,
  playerBlue: 0x4db2ff,
  playerBlueDark: 0x1a4d8f,
  flameOrange: 0xff7b2d,
  flameRed: 0xe63b2e,
  shadowPurple: 0xa06bff,
  shadowDark: 0x3d2a6e,
  gold: 0xffd75e,
  jade: 0x53e0b0,
  enemyPink: 0xff5f8f,
  enemyGreen: 0x7ee06b,
  warnRed: 0xff2d3f,
  uiCyan: 0x8fd3ff,
} as const;

// ---------------------------------------------------------------------------
// 씬 간 스폰/연출 계약 타입
// ---------------------------------------------------------------------------
export interface PlayerBulletSpawn {
  texture: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  scale?: number;
  tint?: number;
  pierce?: number;
  clearsBullets?: boolean;
  homing?: boolean;
  homingTurn?: number;
  life?: number;
}

export interface EnemySpawnOpts {
  hpScale?: number;
  speedScale?: number;
  scoreScale?: number;
  elite?: boolean;
}

/** 추적탄이 바라보는 목표(적)의 최소 정보. active가 false면 직진한다. */
export interface TargetRef {
  x: number;
  y: number;
  active: boolean;
}

/**
 * Boss.ts (3단계) 계약:
 * createBoss(scene: GameScene, world: IGameWorld, bossId: string): Boss
 * class Boss: x/y/active, getHpRatio(): number, getDisplayName(): string,
 *   takeDamage(dmg: number): void, update(dtMs: number): void, destroy(): void,
 *   isDefeated: boolean, getHitRadius(): number, onDefeated 콜백은 GameScene이 폴링(isDefeated)로 처리
 *
 * 순환 import 방지를 위해 GameScene/Boss 양쪽이 이 구조적 타입으로 협업한다.
 */
export interface BossLike {
  x: number;
  y: number;
  active: boolean;
  isDefeated: boolean;
  getHpRatio(): number;
  getDisplayName(): string;
  getHitRadius(): number;
  takeDamage(dmg: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

/**
 * Player/Enemy/Boss가 GameScene에 의존하지 않게 하는 계약.
 * GameScene이 구조적 타이핑으로 구현한다 (import 사이클 방지를 위해
 * GameConfig는 AudioSystem/Effects를 type-only로만 참조).
 */
export interface IGameWorld {
  spawnPlayerBullet(cfg: PlayerBulletSpawn): void;
  spawnEnemyBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    tex: string,
    tint: number,
    scale?: number,
    damage?: number,
  ): void;
  spawnItem(type: ItemType, x: number, y: number): void;
  addScore(points: number): void;
  registerKill(x: number, y: number, isBig: boolean): void;
  /** 화면의 적탄 전체 소거 (이펙트 포함) */
  clearEnemyBullets(): void;
  /** 지정 위치 주변 적탄 소거 */
  clearEnemyBulletsNear(x: number, y: number, radius: number): void;
  getDifficulty(): Difficulty;
  isPlayerAlive(): boolean;
  getPlayerPos(): { x: number; y: number };
  shake(intensity: number, dur: number): void;
  hitStop(ms: number): void;
  /** 실제 시간 ms 동안 게임 시간을 factor배(0~1)로 늦춘다(필살기 컷인 등). */
  slowMotion(factor: number, ms: number): void;
  audio: AudioSystem;
  fx: Effects;
  spawnEnemy(typeId: string, x: number, y: number, opts?: EnemySpawnOpts): void;
  /** 가장 가까운 적 조회 (추적탄용, 없으면 null). GameScene이 구현. */
  findTarget?(x: number, y: number, maxDist?: number): TargetRef | null;
  /** 범위 내 적에게 직접 피해 (돌진/필살기 연출용). GameScene이 구현. */
  dealDamageInRadius?(x: number, y: number, radius: number, damage: number): void;
  /** 보스전 시작 요청 (EnemySpawner의 midboss/boss 액션이 호출). GameScene이 구현. */
  startBoss(bossId: string): void;
  /** 현재 보스 (없으면 null). GameScene이 구현. */
  getBoss(): BossLike | null;
  /** 화면 내 활성 적 수 (스포너 동시 제한/클리어 판정용). GameScene이 구현. */
  getActiveEnemyCount(typeId?: string): number;
  /** 배경 스크롤 배율 (스테이지 연출/보스전 정지용). GameScene이 구현. */
  setScrollSpeed(mult: number): void;
  /** 화면 어둠 (0 ~ 0.75, 보스 페이즈 연출용). GameScene이 Parallax에 위임. */
  setDarkness?(alpha: number): void;
}
