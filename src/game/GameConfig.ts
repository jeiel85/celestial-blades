import type { AudioSystem } from './systems/AudioSystem';
import type { Effects } from './effects/Effects';

// ---------------------------------------------------------------------------
// 기본 해상도 (논리 해상도 1280x720, Scale.FIT + CENTER_BOTH)
// ---------------------------------------------------------------------------
export const WIDTH = 1280;
export const HEIGHT = 720;

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
/** 필살기 무적 시간 (ms) */
export const BOMB_INVULN = 1500;
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
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface DifficultyPreset {
  /** 적탄 속도 배율 */
  bulletSpeed: number;
  /** 탄 밀도(발사 수/빈도) 배율 */
  density: number;
  /** 시작 목숨 */
  lives: number;
  /** 보스 강화 패턴 사용 여부 */
  bossEnrage: boolean;
  label: string;
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  EASY: { bulletSpeed: 0.8, density: 0.75, lives: 4, bossEnrage: false, label: 'EASY' },
  NORMAL: { bulletSpeed: 1.0, density: 1.0, lives: 3, bossEnrage: false, label: 'NORMAL' },
  HARD: { bulletSpeed: 1.15, density: 1.3, lives: 3, bossEnrage: true, label: 'HARD' },
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

export interface StageTheme {
  key: string;
  title: string;
  skyTop: number;
  skyBottom: number;
  far: number;
  near: number;
  accent: number;
}

export const STAGE_THEMES: StageTheme[] = [
  { key: 'stage1', title: 'STAGE 1 — 청운계곡', skyTop: 0x0a1a33, skyBottom: 0x2c5f8a, far: 0x3a6e8f, near: 0x274d3d, accent: COLORS.playerBlue },
  { key: 'stage2', title: 'STAGE 2 — 붉은 기계도시', skyTop: 0x1a0a12, skyBottom: 0x6e2a1e, far: 0x5e3a2a, near: 0x3d2a2a, accent: COLORS.flameOrange },
  { key: 'stage3', title: 'STAGE 3 — 천공성', skyTop: 0x0d0a2e, skyBottom: 0x4d3a8f, far: 0x6e5fc0, near: 0x2e2a5e, accent: COLORS.shadowPurple },
  { key: 'final', title: 'FINAL — 천문', skyTop: 0x02030a, skyBottom: 0x1e1a4d, far: 0x3d2a6e, near: 0x10102a, accent: COLORS.gold },
];

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
