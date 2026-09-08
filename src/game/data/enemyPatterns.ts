import { DIFFICULTY_PRESETS } from '../GameConfig';
import type { IGameWorld, ItemType } from '../GameConfig';

/**
 * Enemy가 패턴 함수(move/fire)에 노출하는 가변 상태.
 * Enemy 클래스가 이 인터페이스를 그대로 구현한다.
 */
export interface EnemyAgent {
  x: number;
  y: number;
  /** 돌진형이 fire()에서 확정하는 돌진 속도 (px/s) */
  vx: number;
  vy: number;
  /** 생존 시간 (ms) */
  age: number;
  /** 개체별 랜덤 위상 (0..2PI) */
  seed: number;
  /** 강화형/wave opts 배율 */
  speedScale: number;
  /** 다음 발사까지 남은 시간 (ms) */
  fireTimer: number;
  /** 발사 간격 (ms, 난이도 밀도 반영済) */
  fireInterval: number;
  /** 패턴 페이즈 (돌진형 상태머신/엘리트 교대 발리 공용) */
  phase: number;
  /** 페이즈 진입 후 경과 (ms) */
  phaseTime: number;
  /** 돌진형이 조준 확정하는 목표점 */
  lockX: number;
  lockY: number;
  /** 등장 시 y (사인곡선 중심축) */
  baseY: number;
  /** true면 경고 점멸 (Enemy.update가 알파로 표시) */
  warnOn: boolean;
  /** 소환형의 소환 타이머 (ms) */
  spawnTimer: number;
}

export interface EnemyTypeDef {
  tex: string;
  hp: number;
  /** 피격/충돌 반경 (px) */
  radius: number;
  /** 처치 보너스 점수 (registerKill 기본점 100/500에 더해 addScore로 가산) */
  score: number;
  tint?: number;
  /** 기본 발사 간격 (ms) */
  fireInterval?: number;
  /** 아이템 드롭 추가 확률 (기본 DROP_RATE_*에 가산) */
  dropBias?: Partial<Record<ItemType, number>>;
  move: (e: EnemyAgent, t: number, dt: number) => void;
  fire: (e: EnemyAgent, t: number, dt: number, world: IGameWorld) => void;
}

// -- 공용 헬퍼 ---------------------------------------------------------------

function aimAngle(world: IGameWorld, x: number, y: number): number {
  const p = world.getPlayerPos();
  return Math.atan2(p.y - y, p.x - x);
}

function bulletSpeed(world: IGameWorld, base: number, e: EnemyAgent): number {
  return base * DIFFICULTY_PRESETS[world.getDifficulty()].bulletSpeed * e.speedScale;
}

/** 발사 타이머를 dt만큼 깎고, 발사 시점이면 true (간격 리필 포함) */
function fireReady(e: EnemyAgent, dt: number): boolean {
  e.fireTimer -= dt;
  if (e.fireTimer <= 0) {
    e.fireTimer += e.fireInterval;
    return true;
  }
  return false;
}

function ringBullets(world: IGameWorld, x: number, y: number, count: number, speed: number, tex: string, tint: number, offset: number): void {
  for (let i = 0; i < count; i += 1) {
    const a = offset + (i / count) * Math.PI * 2;
    world.spawnEnemyBullet(x, y, a, speed, tex, tint);
  }
}

function fanBullets(
  world: IGameWorld,
  x: number,
  y: number,
  center: number,
  count: number,
  spread: number,
  speed: number,
  tex: string,
  tint: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    world.spawnEnemyBullet(x, y, center + t * spread, speed, tex, tint);
  }
}

// -- 타입별 패턴 ---------------------------------------------------------------

/** 소형 비행 요괴: 직선 좌진 + 주기적 조준탄 1발 */
function smallMove(e: EnemyAgent, t: number, dt: number): void {
  const sec = dt / 1000;
  e.x -= 132 * e.speedScale * sec;
  e.y += Math.sin(t / 700 + e.seed) * 12 * sec;
}

function smallFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  if (!fireReady(e, dt)) return;
  if (!world.isPlayerAlive()) return;
  world.spawnEnemyBullet(e.x - 14, e.y, aimAngle(world, e.x, e.y), bulletSpeed(world, 220, e), 'eb_small', 0xff8fb3);
}

/** 박쥐형: 사인 곡선 + 3방향 탄 */
function batMove(e: EnemyAgent, t: number, dt: number): void {
  const sec = dt / 1000;
  e.x -= 112 * e.speedScale * sec;
  e.y = e.baseY + Math.sin(t / 620 + e.seed) * 78;
}

function batFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  if (!fireReady(e, dt)) return;
  if (!world.isPlayerAlive()) return;
  const center = aimAngle(world, e.x, e.y);
  fanBullets(world, e.x - 12, e.y, center, 3, 0.22, bulletSpeed(world, 195, e), 'eb_small', 0xc9a8ff);
}

/**
 * 돌진형: 등장(0.85초) → 경고(0.6초, 점멸) → 조준 확정 후 고속 돌진 → 이탈.
 * 조준 확정은 world가 필요한 작업이라 fire() 쪽에서 수행한다.
 */
const RUSH_ENTER = 850;
const RUSH_WARN = 600;
const RUSH_DASH = 780;
const RUSH_SPEED = 580;

function rusherMove(e: EnemyAgent, _t: number, dt: number): void {
  const sec = dt / 1000;
  if (e.phase === 0) {
    e.x -= 175 * e.speedScale * sec;
    e.phaseTime += dt;
    if (e.phaseTime >= RUSH_ENTER) {
      e.phase = 1;
      e.phaseTime = 0;
      e.warnOn = true;
    }
  } else if (e.phase === 1) {
    e.x -= 22 * sec;
    e.phaseTime += dt;
  } else if (e.phase === 2) {
    e.x += e.vx * sec;
    e.y += e.vy * sec;
    e.phaseTime += dt;
    if (e.phaseTime >= RUSH_DASH) {
      e.phase = 3;
      e.phaseTime = 0;
      e.vx = 0;
      e.vy = 0;
    }
  } else {
    e.x -= 70 * e.speedScale * sec;
  }
}

function rusherFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  // 경고 종료 시점에 플레이어 위치를 확정하고 돌진 벡터를 만든다
  if (e.phase === 1 && e.phaseTime >= RUSH_WARN) {
    const p = world.getPlayerPos();
    e.lockX = p.x;
    e.lockY = p.y;
    const a = Math.atan2(e.lockY - e.y, e.lockX - e.x);
    const sp = RUSH_SPEED * e.speedScale;
    e.vx = Math.cos(a) * sp;
    e.vy = Math.sin(a) * sp;
    e.phase = 2;
    e.phaseTime = 0;
    e.warnOn = false;
    return;
  }
  if (e.phase !== 3) return;
  if (!fireReady(e, dt)) return;
  if (!world.isPlayerAlive()) return;
  world.spawnEnemyBullet(e.x - 16, e.y, aimAngle(world, e.x, e.y), bulletSpeed(world, 230, e), 'eb_small', 0xffb347);
}

/** 포대형: 느리게 이동 + 주기적 원형 탄막 링 (EASY 12 / NORMAL 14 / HARD 16) */
function turretMove(e: EnemyAgent, t: number, dt: number): void {
  const sec = dt / 1000;
  e.x -= 34 * e.speedScale * sec;
  e.y += Math.sin(t / 900 + e.seed) * 14 * sec;
}

function turretFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  if (!fireReady(e, dt)) return;
  const d = DIFFICULTY_PRESETS[world.getDifficulty()].density;
  const count = d >= 1.2 ? 16 : d <= 0.8 ? 12 : 14;
  const offset = e.seed + e.phase * 0.35;
  e.phase += 1;
  ringBullets(world, e.x, e.y, count, bulletSpeed(world, 150, e), 'eb_mid', 0xff6f8f, offset);
}

/** 방패형: 느린 전진 + 2방향 조준탄. 정면 피해는 Enemy.takeDamage가 15%로 감쇠. */
function shieldMove(e: EnemyAgent, _t: number, dt: number): void {
  const sec = dt / 1000;
  e.x -= 50 * e.speedScale * sec;
}

function shieldFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  if (!fireReady(e, dt)) return;
  if (!world.isPlayerAlive()) return;
  const center = aimAngle(world, e.x, e.y);
  fanBullets(world, e.x - 10, e.y, center, 2, 0.24, bulletSpeed(world, 215, e), 'eb_mid', 0x8fd3ff);
}

/** 소환형: 우측에 정박하며 2.5초마다 small 소환 (small 동시 6기 상한) */
const SPAWNER_INTERVAL = 2500;
const SPAWNER_CAP = 6;

function spawnerMove(e: EnemyAgent, t: number, dt: number): void {
  const sec = dt / 1000;
  if (e.x > 1030) {
    e.x -= 75 * e.speedScale * sec;
  } else {
    e.y = e.baseY + Math.sin(t / 1100 + e.seed) * 42;
    e.x += Math.sin(t / 1700 + e.seed * 2) * 10 * sec;
  }
}

function spawnerFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  e.spawnTimer -= dt;
  if (e.spawnTimer <= 0) {
    e.spawnTimer += SPAWNER_INTERVAL;
    if (world.getActiveEnemyCount('small') < SPAWNER_CAP) {
      const side = e.phase % 2 === 0 ? -42 : 42;
      e.phase += 1;
      world.spawnEnemy('small', e.x - 24, e.y + side, { speedScale: e.speedScale });
      world.fx.explosion(e.x - 24, e.y + side, 0.5, 0x53e0b0);
    }
  }
  if (!fireReady(e, dt)) return;
  if (!world.isPlayerAlive()) return;
  world.spawnEnemyBullet(e.x - 18, e.y, aimAngle(world, e.x, e.y), bulletSpeed(world, 175, e), 'eb_small', 0x53e0b0);
}

/** 엘리트: 부채꼴+조준 교대. 처치 시 B 아이템 확정 드롭 (Enemy.takeDamage 처리). */
function eliteMove(e: EnemyAgent, t: number, dt: number): void {
  const sec = dt / 1000;
  if (e.x > 950) {
    e.x -= 95 * e.speedScale * sec;
  } else {
    e.y = e.baseY + Math.sin(t / 850 + e.seed) * 62;
    e.x += Math.sin(t / 1500 + e.seed) * 14 * sec;
  }
}

function eliteFire(e: EnemyAgent, _t: number, dt: number, world: IGameWorld): void {
  if (!fireReady(e, dt)) return;
  if (!world.isPlayerAlive()) return;
  const center = aimAngle(world, e.x, e.y);
  if (e.phase % 2 === 0) {
    const d = DIFFICULTY_PRESETS[world.getDifficulty()].density;
    fanBullets(world, e.x - 30, e.y, center, d >= 1.2 ? 7 : 5, 0.32, bulletSpeed(world, 225, e), 'eb_mid', 0xffd75e);
  } else {
    fanBullets(world, e.x - 30, e.y, center, 3, 0.16, bulletSpeed(world, 260, e), 'eb_small', 0xff8f5f);
  }
  e.phase += 1;
}

// -- 정의 테이블 ---------------------------------------------------------------

export const ENEMY_TYPES: Record<string, EnemyTypeDef> = {
  small: {
    tex: 'enemy_small',
    hp: 3,
    radius: 14,
    score: 50,
    fireInterval: 2300,
    move: smallMove,
    fire: smallFire,
  },
  bat: {
    tex: 'enemy_bat',
    hp: 4,
    radius: 15,
    score: 80,
    fireInterval: 2600,
    tint: 0xd8c8ff,
    move: batMove,
    fire: batFire,
  },
  rusher: {
    tex: 'enemy_rusher',
    hp: 6,
    radius: 16,
    score: 120,
    fireInterval: 2800,
    tint: 0xffd0a0,
    move: rusherMove,
    fire: rusherFire,
  },
  turret: {
    tex: 'enemy_turret',
    hp: 15,
    radius: 22,
    score: 220,
    fireInterval: 3200,
    move: turretMove,
    fire: turretFire,
  },
  shield: {
    tex: 'enemy_shield',
    hp: 22,
    radius: 20,
    score: 260,
    fireInterval: 2400,
    move: shieldMove,
    fire: shieldFire,
  },
  spawner: {
    tex: 'enemy_spawner',
    hp: 28,
    radius: 24,
    score: 420,
    fireInterval: 3400,
    dropBias: { P: 0.08, G: 0.1 },
    move: spawnerMove,
    fire: spawnerFire,
  },
  elite: {
    tex: 'enemy_elite',
    hp: 65,
    radius: 32,
    score: 1500,
    fireInterval: 1750,
    tint: 0xffe9c0,
    move: eliteMove,
    fire: eliteFire,
  },
};
