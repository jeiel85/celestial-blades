import type Phaser from 'phaser';
import { DIFFICULTY_PRESETS } from '../GameConfig';
import type { IGameWorld } from '../GameConfig';

// ---------------------------------------------------------------------------
// 보스 공격/페이즈 데이터 계약
// ---------------------------------------------------------------------------

/** 공격 함수에 넘어가는 추가 파라미터 (공격별 실제 값) */
export type AttackParams = any;

/** Boss가 공격 함수에 노출하는 최소 컨텍스트 (순환 import 방지용 구조적 타입) */
export interface BossAttackContext {
  readonly x: number;
  readonly y: number;
  readonly scene: Phaser.Scene;
  /** 공격별 누적 상태 (나선 회전각, 링 갭 회전 등) */
  attackState: Record<string, number>;
  /** 플레이어를 향한 조준각 (rad) */
  getAimAngle(): number;
  /** 공격 전 경고 연출 (ms 동안 점멸/오라) */
  telegraph(ms: number, color?: number): void;
  /** 돌진 개시 (경고 후 목표점으로 돌진했다 복귀) */
  startDash(tx: number, ty: number): void;
  /** 순간이동 개시 (페이드 아웃 → 지정 위치로 이동 → 페이드 인) */
  startTeleport(nx: number, ny: number): void;
  /** 분신 소환 (일시적인 가짜 이미지, 실제 탄 발사) */
  spawnClones(): void;
}

export type BossAttackFn = (boss: BossAttackContext, world: IGameWorld, params: AttackParams) => void;

export interface AttackSpec {
  /** ATTACKS 레지스트리 키 */
  name: string;
  params?: AttackParams;
  /** 발사 간격 (ms) */
  interval: number;
  /** 전투 시작 후 첫 발사까지 지연 (ms) */
  delay?: number;
  /** 발사 직전 경고 연출 (ms, 0이면 없음) */
  telegraph?: number;
}

export interface BossPhase {
  /** 이 페이즈에 진입하는 HP 비율 상한 (1.0 ~ 0, 내림차순 배열) */
  hpAbove: number;
  /** 페이즈 진입 후 다음 페이즈로 넘어가기 위한 최소 유지 시간 (ms) */
  duration: number;
  attacks: AttackSpec[];
  /** 페이즈 진입 시 교체할 텍스처 (없으면 유지) */
  tex?: string;
  /** 페이즈 진입 시 적용할 스케일 (없으면 유지) */
  scale?: number;
  /** 페이즈 진입 시 화면 어둠 (0 ~ 0.75, undefined면 유지) */
  darkness?: number;
  /** 페이즈 진입 시 배경 스크롤 배율 (undefined면 유지) */
  scrollMult?: number;
  /** 페이즈 진입 플래시 색 */
  flashColor?: number;
}

export interface BossMoveState {
  x: number;
  y: number;
  seed: number;
  anchorX: number;
  anchorY: number;
}

export type BossMoveFn = (s: BossMoveState, tMs: number) => { x: number; y: number };

export interface BossDef {
  id: string;
  tex: string;
  displayName: string;
  /** 기본 HP (EASY 0.85x / HARD 1.25x 스케일 적용) */
  hp: number;
  /** 피격/충돌 반경 (px) */
  radius: number;
  scale: number;
  entrance: { x: number; y: number; durationMs: number };
  hover: { xMin: number; xMax: number; yMin: number; yMax: number };
  movement: BossMoveFn;
  phases: BossPhase[];
}

// -- 공용 헬퍼 ---------------------------------------------------------------

function aimAngle(boss: BossAttackContext, world: IGameWorld): number {
  const p = world.getPlayerPos();
  return Math.atan2(p.y - boss.y, p.x - boss.x);
}

/** 난이도별 탄속/밀도 배율 */
function diff(world: IGameWorld): { speed: number; density: number } {
  const preset = DIFFICULTY_PRESETS[world.getDifficulty()];
  return { speed: preset.bulletSpeed, density: preset.density };
}

function num(p: any, key: string, fallback: number): number {
  const v = p !== undefined && p !== null ? p[key] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(p: any, key: string, fallback: string): string {
  const v = p !== undefined && p !== null ? p[key] : undefined;
  return typeof v === 'string' ? v : fallback;
}

/** 밀도 배율을 발수에 반영 (최소 1, 최대 1.6x) */
function scaledCount(world: IGameWorld, base: number): number {
  return Math.max(1, Math.round(base * Math.min(1.6, Math.max(0.6, diff(world).density))));
}

/** 호버 이동 생성기: 앵커 주변 타원 궤적 (우측 60~85% x 범위 고정) */
function hoverMove(rx: number, ry: number, sx: number, sy: number, phase = 0): BossMoveFn {
  return (s: BossMoveState, tMs: number) => {
    const t = tMs / 1000;
    return {
      x: s.anchorX + Math.sin(t * sx + phase + s.seed) * rx,
      y: s.anchorY + Math.sin(t * sy + phase * 1.7 + s.seed * 2) * ry,
    };
  };
}

// -- 공격 함수 레지스트리 ------------------------------------------------------
// 모든 패턴은 안전 경로를 보장한다: 전면 동시 커버 금지, 링/부채꼴은 탄 사이
// 간격 또는 회전하는 빈틈(gap)을 둔다. 탄속은 난이도 배율을 적용한다.

/** 조준탄 n발 (좁은 산포, 사이 간격으로 회피 가능) */
function aimed(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const n = Math.max(1, Math.min(7, Math.round(num(params, 'count', 3))));
  const speed = num(params, 'speed', 250) * diff(world).speed;
  const tex = str(params, 'tex', 'eb_small');
  const tint = num(params, 'tint', 0xff8fb3);
  const spread = num(params, 'spread', 0.09);
  const center = aimAngle(boss, world);
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
    world.spawnEnemyBullet(boss.x - 20, boss.y, center + t * spread, speed, tex, tint);
  }
}

/** 부채꼴 탄 (중앙은 조준, 양옆 빈틈으로 탈출 가능) */
function fan(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = scaledCount(world, num(params, 'count', 5));
  const spread = num(params, 'spread', 0.75);
  const speed = num(params, 'speed', 205) * diff(world).speed;
  const tex = str(params, 'tex', 'eb_mid');
  const tint = num(params, 'tint', 0xff6f8f);
  const center = aimAngle(boss, world);
  // 부채꼴은 발사 지점(보스)에서 퍼지므로 멀어질수록 탄 사이가 벌어진다
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    world.spawnEnemyBullet(boss.x - 24, boss.y, center + t * spread, speed, tex, tint);
  }
}

/** 원형 링 (매 발리마다 2발분을 비워 회전하는 안전 통로 확보) */
function ring(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = Math.max(8, scaledCount(world, num(params, 'count', 14)));
  const skip = Math.max(1, Math.min(4, Math.round(num(params, 'skip', 2))));
  const speed = num(params, 'speed', 150) * diff(world).speed;
  const tex = str(params, 'tex', 'eb_mid');
  const tint = num(params, 'tint', 0xc9a8ff);
  const key = `ring_${str(params, 'tag', 'a')}`;
  const rot = (boss.attackState[key] ?? 0) + num(params, 'step', 0.31);
  boss.attackState[key] = rot;
  const gapStart = Math.floor(((rot * 3) % 1 + 1) % 1 * count);
  for (let i = 0; i < count; i += 1) {
    const rel = (i - gapStart + count * 2) % count;
    if (rel < skip) continue;
    const a = rot + (i / count) * Math.PI * 2;
    world.spawnEnemyBullet(boss.x, boss.y, a, speed, tex, tint);
  }
}

/** 나선 탄막 (2~3축 회전, 저속이라 사이를 비집고 이동 가능) */
function spiral(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const arms = Math.max(1, Math.min(4, Math.round(num(params, 'arms', 2))));
  const step = num(params, 'step', 0.42);
  const speed = num(params, 'speed', 165) * diff(world).speed;
  const tex = str(params, 'tex', 'eb_small');
  const tint = num(params, 'tint', 0x8fd3ff);
  const key = `spiral_${str(params, 'tag', 'a')}`;
  const base = (boss.attackState[key] ?? 0) + step;
  boss.attackState[key] = base;
  for (let k = 0; k < arms; k += 1) {
    const a = base + (k / arms) * Math.PI * 2;
    world.spawnEnemyBullet(boss.x, boss.y, a, speed, tex, tint);
  }
}

/** 십자탄 (4방향 + 22.5도 회전 교대, 대각선 빈틈 유지) */
function cross(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const speed = num(params, 'speed', 195) * diff(world).speed;
  const tex = str(params, 'tex', 'eb_mid');
  const tint = num(params, 'tint', 0xffd75e);
  const key = `cross_${str(params, 'tag', 'a')}`;
  const n = Math.round(boss.attackState[key] ?? 0) + 1;
  boss.attackState[key] = n;
  const off = n % 2 === 0 ? 0 : Math.PI / 8;
  for (let i = 0; i < 4; i += 1) {
    const a = off + (i / 4) * Math.PI * 2;
    world.spawnEnemyBullet(boss.x, boss.y, a, speed, tex, tint);
  }
}

/** 웨이브 탄 (조준 방향으로 수직 오프셋을 준 5연탄, 위아래 빈틈 존재) */
function wave(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = Math.max(3, Math.min(7, Math.round(num(params, 'count', 5))));
  const speed = num(params, 'speed', 215) * diff(world).speed;
  const gap = num(params, 'gap', 34);
  const tex = str(params, 'tex', 'eb_small');
  const tint = num(params, 'tint', 0x53e0b0);
  const center = aimAngle(boss, world);
  const px = Math.cos(center);
  const py = Math.sin(center);
  const nx = -py;
  const ny = px;
  const mid = (count - 1) / 2;
  for (let i = 0; i < count; i += 1) {
    const off = (i - mid) * gap;
    world.spawnEnemyBullet(boss.x - 20 + nx * off, boss.y + ny * off, center, speed, tex, tint);
  }
}

/** 조각탄 분열 (느린 대형탄 1발 + 0.9초 뒤 예상 위치에서 6방향 소형 분열) */
function shard(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const speed = num(params, 'speed', 150) * diff(world).speed;
  const tint = num(params, 'tint', 0xffb347);
  const ox = boss.x - 20;
  const oy = boss.y;
  const a = aimAngle(boss, world);
  world.spawnEnemyBullet(ox, oy, a, speed, 'eb_big', tint, 1, 1);
  const scene = boss.scene;
  scene.time.delayedCall(900, () => {
    try {
      if (!scene.scene.isActive() || !world.isPlayerAlive()) return;
      const px = Math.max(60, Math.min(1220, ox + Math.cos(a) * speed * 0.9));
      const py = Math.max(60, Math.min(660, oy + Math.sin(a) * speed * 0.9));
      // 6방향 중 1방향을 비워 안전 경로 확보 (나머지 5방향 분열)
      for (let i = 1; i < 6; i += 1) {
        const sa = (i / 6) * Math.PI * 2 + 0.3;
        world.spawnEnemyBullet(px, py, sa, 175 * diff(world).speed, 'eb_shard', tint);
      }
    } catch {
      // 무시
    }
  });
}

/** 적 소환 (동시 상한 준수, 소환 이펙트 포함) */
function summon(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  const typeId = str(params, 'typeId', 'small');
  const count = Math.max(1, Math.min(4, Math.round(num(params, 'count', 2))));
  const cap = Math.max(2, Math.min(10, Math.round(num(params, 'cap', 5))));
  for (let i = 0; i < count; i += 1) {
    if (world.getActiveEnemyCount(typeId) >= cap) return;
    const sx = Math.max(900, Math.min(1240, boss.x - 60 + (i - (count - 1) / 2) * 90));
    const sy = Math.max(90, Math.min(630, boss.y + (i % 2 === 0 ? -70 : 70)));
    world.spawnEnemy(typeId, sx, sy);
    world.fx.explosion(sx, sy, 0.6, 0x53e0b0);
  }
}

/** 레이저 (0.8초 경고 라인 → 라인 위를 따라 고속탄 10연발, 탄 사이 70px 간격) */
function laser(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const scene = boss.scene;
  const ax = boss.x;
  const ay = boss.y;
  const aim = aimAngle(boss, world);
  const sweep = num(params, 'sweep', 0);
  const tint = num(params, 'tint', 0xff4d5e);
  const warnMs = 800;
  boss.telegraph(warnMs, 0xff2d3f);
  let g: Phaser.GameObjects.Graphics | null = null;
  try {
    g = scene.add.graphics().setDepth(490);
    g.lineStyle(3, 0xff2d3f, 0.85);
    const len = 1400;
    g.lineBetween(ax, ay, ax + Math.cos(aim) * len, ay + Math.sin(aim) * len);
    scene.tweens.add({ targets: g, alpha: 0.25, duration: 130, yoyo: true, repeat: 5 });
  } catch {
    g = null;
  }
  scene.time.delayedCall(warnMs, () => {
    try {
      if (g) g.destroy();
      if (!scene.scene.isActive() || !world.isPlayerAlive()) return;
      const speed = 430 * diff(world).speed;
      const angles = sweep > 0 ? [aim - sweep, aim, aim + sweep] : [aim];
      for (const la of angles) {
        for (let i = 0; i < 10; i += 1) {
          const d = 60 + i * 70;
          world.spawnEnemyBullet(ax + Math.cos(la) * d, ay + Math.sin(la) * d, la, speed, 'eb_mid', tint, 1.1, 1);
        }
      }
      world.audio.playSfx('chargeShot');
    } catch {
      // 무시
    }
  });
}

/** 미사일 (느린 조준탄 2연발 — 연속 발리로 플레이어를 따라가는 유도 느낌) */
function missile(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = Math.max(1, Math.min(4, Math.round(num(params, 'count', 2))));
  const speed = num(params, 'speed', 135) * diff(world).speed;
  const tint = num(params, 'tint', 0xffb347);
  const scene = boss.scene;
  for (let i = 0; i < count; i += 1) {
    scene.time.delayedCall(i * 220, () => {
      try {
        if (!scene.scene.isActive() || !world.isPlayerAlive()) return;
        const a = aimAngle(boss, world) + (i % 2 === 0 ? -0.08 : 0.08);
        world.spawnEnemyBullet(boss.x - 30, boss.y + (i - (count - 1) / 2) * 26, a, speed, 'eb_big', tint, 0.8, 1);
      } catch {
        // 무시
      }
    });
  }
}

/** 추적탄 (빠르지만 좁은 산포의 3연 조준탄, 좌우 회피 가능) */
function seeker(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = scaledCount(world, num(params, 'count', 3));
  const speed = num(params, 'speed', 295) * diff(world).speed;
  const tint = num(params, 'tint', 0xd8c8ff);
  const center = aimAngle(boss, world);
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
    world.spawnEnemyBullet(boss.x - 16, boss.y, center + t * 0.14, speed, 'eb_small', tint);
  }
}

/** 돌진 (Boss 본체의 경고→돌진→복귀 시퀀스 + 착탄 시 소형 링) */
function dash(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const p = world.getPlayerPos();
  const lead = num(params, 'lead', 260);
  void lead;
  boss.startDash(Math.max(420, p.x + 260), Math.max(90, Math.min(630, p.y)));
}

/** 순간이동 (Boss 본체 페이드 + 글로우 + 착지 소형 링) */
function teleport(boss: BossAttackContext, world: IGameWorld, _params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const nx = 800 + Math.random() * 260;
  const ny = 130 + Math.random() * 460;
  boss.startTeleport(nx, ny);
}

/** 분신 (Boss 본체가 가짜 이미지 2기를 소환, 실제 탄 발사) */
function clone(boss: BossAttackContext, world: IGameWorld, _params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  boss.spawnClones();
}

/** 낙하탄 (화면 상단에서 낙하 — 안전 기둥 1개를 비워둠) */
function rain(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = Math.max(4, scaledCount(world, num(params, 'count', 7)));
  const speed = num(params, 'speed', 200) * diff(world).speed;
  const tint = num(params, 'tint', 0x8fd3ff);
  const p = world.getPlayerPos();
  const safeX = Math.max(120, Math.min(1160, p.x + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 120)));
  const safeHalf = 150;
  for (let i = 0; i < count; i += 1) {
    const rx = 80 + (i / Math.max(1, count - 1)) * 1120 + (Math.random() - 0.5) * 60;
    if (Math.abs(rx - safeX) < safeHalf) continue;
    const ry = -20 - Math.random() * 40;
    const wob = (Math.random() - 0.5) * 0.22;
    world.spawnEnemyBullet(rx, ry, Math.PI / 2 + wob, speed * (0.9 + Math.random() * 0.2), 'eb_mid', tint);
  }
  void boss;
}

/** 화면 스윕탄 (보스에서 좌측으로 부채꼴 — 중앙 2발분을 비워 회피 통로 유지) */
function sweep(boss: BossAttackContext, world: IGameWorld, params: AttackParams): void {
  if (!world.isPlayerAlive()) return;
  const count = Math.max(5, scaledCount(world, num(params, 'count', 9)));
  const speed = num(params, 'speed', 225) * diff(world).speed;
  const tint = num(params, 'tint', 0xff8f5f);
  const key = `sweep_${str(params, 'tag', 'a')}`;
  const n = Math.round(boss.attackState[key] ?? 0) + 1;
  boss.attackState[key] = n;
  const drift = Math.sin(n * 0.9) * 0.22;
  const gapIdx = Math.floor(count / 2);
  for (let i = 0; i < count; i += 1) {
    if (Math.abs(i - gapIdx) < 1) continue;
    const a = Math.PI - 0.55 + (i / (count - 1)) * 1.1 + drift;
    world.spawnEnemyBullet(boss.x - 30, boss.y, a, speed, 'eb_small', tint);
  }
}

export const ATTACKS: Record<string, BossAttackFn> = {
  aimed,
  fan,
  ring,
  spiral,
  cross,
  wave,
  shard,
  summon,
  laser,
  missile,
  seeker,
  dash,
  teleport,
  clone,
  rain,
  sweep,
};

// -- 보스 정의 ---------------------------------------------------------------
// 이동은 화면 우측 60~85% x 범위 호버가 기본. dash/teleport 때만 벗어난다.

const HOVER = { xMin: 768, xMax: 1088, yMin: 140, yMax: 580 };

export const BOSS_DEFS: Record<string, BossDef> = {
  // -- Stage 1 중간보스: 거대 비행 가오리 ---------------------------------------
  midboss_ray: {
    id: 'midboss_ray',
    tex: 'midboss_ray',
    displayName: '거대 비행 가오리 — 운무요',
    hp: 1600,
    radius: 70,
    scale: 1,
    entrance: { x: 1500, y: 340, durationMs: 2200 },
    hover: HOVER,
    movement: hoverMove(90, 120, 0.5, 0.7),
    phases: [
      {
        hpAbove: 1.0,
        duration: 6000,
        attacks: [
          { name: 'fan', params: { count: 5, spread: 0.7, speed: 195, tint: 0x9fd8ff }, interval: 2600, delay: 1200 },
          { name: 'aimed', params: { count: 3, speed: 235, tint: 0xff8fb3 }, interval: 1900, delay: 600 },
          { name: 'wave', params: { count: 5, speed: 205, tint: 0x53e0b0 }, interval: 3400, delay: 2400 },
        ],
      },
      {
        hpAbove: 0.45,
        duration: 0,
        flashColor: 0x9fd8ff,
        attacks: [
          { name: 'fan', params: { count: 7, spread: 0.85, speed: 210, tint: 0x9fd8ff }, interval: 2200 },
          { name: 'aimed', params: { count: 4, speed: 255, tint: 0xff8fb3 }, interval: 1600 },
          { name: 'wave', params: { count: 5, speed: 225, tint: 0x53e0b0 }, interval: 2900 },
          { name: 'ring', params: { count: 12, speed: 140, tint: 0xc9a8ff, tag: 'ray' }, interval: 4200, delay: 1500 },
        ],
      },
    ],
  },

  // -- Stage 2 중간보스: 거대 기계 지네 (마디는 Boss 내부 관리, 머리만 피격) -----
  midboss_centipede: {
    id: 'midboss_centipede',
    tex: 'midboss_seg',
    displayName: '거대 기계 지네 — 철련충',
    hp: 2200,
    radius: 30,
    scale: 1.3,
    entrance: { x: 1500, y: 360, durationMs: 2400 },
    hover: HOVER,
    movement: (s: BossMoveState, tMs: number) => {
      const t = tMs / 1000;
      return {
        x: s.anchorX + Math.sin(t * 0.9 + s.seed) * 130,
        y: s.anchorY + Math.sin(t * 1.3 + 1 + s.seed) * 190,
      };
    },
    phases: [
      {
        hpAbove: 1.0,
        duration: 6000,
        attacks: [
          { name: 'ring', params: { count: 12, speed: 145, tint: 0xffb347, tag: 'seg' }, interval: 3000, delay: 1200 },
          { name: 'aimed', params: { count: 3, speed: 240, tint: 0xff8fb3 }, interval: 1800, delay: 500 },
          { name: 'wave', params: { count: 5, speed: 210, tint: 0x53e0b0 }, interval: 3200, delay: 2200 },
        ],
      },
      {
        hpAbove: 0.5,
        duration: 0,
        flashColor: 0xffb347,
        attacks: [
          { name: 'ring', params: { count: 16, speed: 155, tint: 0xffb347, tag: 'seg' }, interval: 2600 },
          { name: 'aimed', params: { count: 4, speed: 260, tint: 0xff8fb3 }, interval: 1500 },
          { name: 'spiral', params: { arms: 2, step: 0.5, speed: 150, tint: 0xffd75e, tag: 'seg' }, interval: 900, delay: 1200 },
        ],
      },
    ],
  },

  // -- Stage 3 중간보스: 타락한 천명사 (검기 + 순간이동 + 링) --------------------
  midboss_dark: {
    id: 'midboss_dark',
    tex: 'midboss_dark',
    displayName: '타락한 천명사 — 먹구름',
    hp: 2600,
    radius: 34,
    scale: 1.1,
    entrance: { x: 1500, y: 360, durationMs: 2000 },
    hover: HOVER,
    movement: hoverMove(120, 150, 0.7, 0.9, 1.2),
    phases: [
      {
        hpAbove: 1.0,
        duration: 6000,
        attacks: [
          { name: 'aimed', params: { count: 3, speed: 265, tex: 'shot_ki', tint: 0xc9a8ff }, interval: 1700, delay: 600 },
          { name: 'ring', params: { count: 12, speed: 150, tint: 0xa06bff, tag: 'dark' }, interval: 3200, delay: 1800 },
          { name: 'teleport', params: {}, interval: 6000, delay: 4000 },
        ],
      },
      {
        hpAbove: 0.5,
        duration: 0,
        flashColor: 0xa06bff,
        attacks: [
          { name: 'aimed', params: { count: 4, speed: 285, tex: 'shot_ki', tint: 0xc9a8ff }, interval: 1400 },
          { name: 'ring', params: { count: 14, speed: 160, tint: 0xa06bff, tag: 'dark' }, interval: 2700 },
          { name: 'fan', params: { count: 5, spread: 0.6, speed: 225, tex: 'shot_ki', tint: 0xc9a8ff }, interval: 2400, delay: 1000 },
          { name: 'teleport', params: {}, interval: 4500, delay: 2000 },
        ],
      },
    ],
  },

  // -- Stage 1 보스: 철갑귀 장군 (HP 7000) --------------------------------------
  boss_iron: {
    id: 'boss_iron',
    tex: 'boss_iron',
    displayName: '철갑귀 장군 — 파철',
    hp: 7000,
    radius: 95,
    scale: 1,
    entrance: { x: 1500, y: 360, durationMs: 2600 },
    hover: HOVER,
    movement: hoverMove(70, 110, 0.45, 0.6),
    phases: [
      {
        hpAbove: 1.0,
        duration: 10000,
        attacks: [
          { name: 'aimed', params: { count: 4, speed: 250, tint: 0xff8fb3 }, interval: 1700, delay: 800, telegraph: 350 },
          { name: 'cross', params: { speed: 185, tint: 0xffd75e, tag: 'iron' }, interval: 2600, delay: 1800 },
          { name: 'wave', params: { count: 5, speed: 215, tint: 0xff6f8f }, interval: 3200, delay: 2600 },
        ],
      },
      {
        hpAbove: 0.6,
        duration: 8000,
        flashColor: 0xffd75e,
        attacks: [
          { name: 'fan', params: { count: 7, spread: 0.85, speed: 210, tint: 0xff6f8f }, interval: 2200, telegraph: 400 },
          { name: 'ring', params: { count: 16, speed: 150, tint: 0xffb347, tag: 'iron' }, interval: 3000, delay: 1200 },
          { name: 'aimed', params: { count: 4, speed: 265, tint: 0xff8fb3 }, interval: 1800 },
        ],
      },
      {
        hpAbove: 0.3,
        duration: 0,
        flashColor: 0xff2d3f,
        attacks: [
          { name: 'dash', params: { lead: 260 }, interval: 5200, delay: 1500, telegraph: 600 },
          { name: 'fan', params: { count: 7, spread: 0.9, speed: 220, tint: 0xff6f8f }, interval: 2000 },
          { name: 'ring', params: { count: 18, speed: 160, tint: 0xffb347, tag: 'iron' }, interval: 2600, delay: 800 },
          { name: 'spiral', params: { arms: 2, step: 0.45, speed: 165, tint: 0xffd75e, tag: 'iron' }, interval: 1100, delay: 2000 },
        ],
      },
    ],
  },

  // -- Stage 2 보스: 홍련기관왕 (HP 9000, 외장 파괴 → 코어) ----------------------
  boss_engine: {
    id: 'boss_engine',
    tex: 'boss_engine',
    displayName: '홍련기관왕 — 염동로',
    hp: 9000,
    radius: 110,
    scale: 1,
    entrance: { x: 1500, y: 360, durationMs: 2800 },
    hover: HOVER,
    movement: hoverMove(55, 90, 0.35, 0.5),
    phases: [
      {
        hpAbove: 1.0,
        duration: 10000,
        attacks: [
          { name: 'missile', params: { count: 2, speed: 135, tint: 0xffb347 }, interval: 2400, delay: 800, telegraph: 400 },
          { name: 'ring', params: { count: 16, speed: 145, tint: 0xff7b2d, tag: 'eng' }, interval: 3200, delay: 1800 },
          { name: 'aimed', params: { count: 3, speed: 250, tint: 0xff8fb3 }, interval: 1800, delay: 500 },
        ],
      },
      {
        hpAbove: 0.66,
        duration: 8000,
        flashColor: 0xff7b2d,
        attacks: [
          { name: 'laser', params: { sweep: 0, tint: 0xff4d5e }, interval: 5000, delay: 1200, telegraph: 800 },
          { name: 'sweep', params: { count: 9, speed: 220, tint: 0xff8f5f, tag: 'eng' }, interval: 2800 },
          { name: 'fan', params: { count: 6, spread: 0.8, speed: 215, tint: 0xff7b2d }, interval: 2300 },
          { name: 'summon', params: { typeId: 'small', count: 2, cap: 4 }, interval: 9000, delay: 4000 },
        ],
      },
      {
        hpAbove: 0.4,
        duration: 0,
        tex: 'boss_engine_core',
        scale: 2.4,
        flashColor: 0xffffff,
        attacks: [
          { name: 'laser', params: { sweep: 0.22, tint: 0xff2d3f }, interval: 4200, telegraph: 800 },
          { name: 'spiral', params: { arms: 3, step: 0.38, speed: 170, tint: 0xffd75e, tag: 'eng' }, interval: 1000, delay: 800 },
          { name: 'missile', params: { count: 3, speed: 150, tint: 0xffb347 }, interval: 2000 },
          { name: 'ring', params: { count: 18, speed: 160, tint: 0xff7b2d, tag: 'eng' }, interval: 2600 },
        ],
      },
    ],
  },

  // -- Stage 3 보스: 백야천녀 (HP 10000, HP 35%↓ 화면 어둠) ----------------------
  boss_maiden: {
    id: 'boss_maiden',
    tex: 'boss_maiden',
    displayName: '백야천녀 — 설화',
    hp: 10000,
    radius: 58,
    scale: 1.2,
    entrance: { x: 1500, y: 360, durationMs: 2600 },
    hover: HOVER,
    movement: hoverMove(110, 140, 0.55, 0.75, 2.1),
    phases: [
      {
        hpAbove: 1.0,
        duration: 10000,
        attacks: [
          { name: 'fan', params: { count: 6, spread: 0.7, speed: 220, tex: 'shot_ki', tint: 0xffffff }, interval: 2000, delay: 700, telegraph: 350 },
          { name: 'aimed', params: { count: 3, speed: 270, tint: 0xff8fb3 }, interval: 1600, delay: 400 },
          { name: 'wave', params: { count: 5, speed: 225, tex: 'shot_ki', tint: 0xd8dcf2 }, interval: 2800, delay: 1600 },
        ],
      },
      {
        hpAbove: 0.65,
        duration: 8000,
        flashColor: 0xd8dcf2,
        attacks: [
          { name: 'ring', params: { count: 16, speed: 155, tint: 0xc9a8ff, tag: 'mai' }, interval: 2600 },
          { name: 'seeker', params: { count: 3, speed: 290, tint: 0xd8c8ff }, interval: 2200, delay: 600 },
          { name: 'teleport', params: {}, interval: 6000, delay: 3000 },
          { name: 'fan', params: { count: 6, spread: 0.8, speed: 230, tex: 'shot_ki', tint: 0xffffff }, interval: 2100, telegraph: 350 },
        ],
      },
      {
        hpAbove: 0.35,
        duration: 0,
        darkness: 0.45,
        flashColor: 0xa06bff,
        attacks: [
          { name: 'laser', params: { sweep: 0.3, tint: 0xd8a8ff }, interval: 4500, delay: 1000, telegraph: 800 },
          { name: 'clone', params: {}, interval: 8000, delay: 2500, telegraph: 600 },
          { name: 'spiral', params: { arms: 3, step: 0.4, speed: 170, tint: 0x8fd3ff, tag: 'mai' }, interval: 950 },
          { name: 'ring', params: { count: 18, speed: 165, tint: 0xc9a8ff, tag: 'mai' }, interval: 2400 },
        ],
      },
    ],
  },

  // -- Final 보스: 무명천 (HP 12000, 인간형 → 신수형) ----------------------------
  final_moo: {
    id: 'final_moo',
    tex: 'final_human',
    displayName: '무명천 — 인간형',
    hp: 12000,
    radius: 62,
    scale: 1.1,
    entrance: { x: 1500, y: 360, durationMs: 3000 },
    hover: HOVER,
    movement: hoverMove(100, 130, 0.5, 0.65, 0.7),
    phases: [
      {
        hpAbove: 1.0,
        duration: 12000,
        attacks: [
          { name: 'spiral', params: { arms: 2, step: 0.4, speed: 165, tint: 0xa06bff, tag: 'moo' }, interval: 850, delay: 600 },
          { name: 'aimed', params: { count: 4, speed: 265, tint: 0xff8fb3 }, interval: 1700, delay: 400, telegraph: 300 },
          { name: 'ring', params: { count: 16, speed: 150, tint: 0xd8c8ff, tag: 'moo' }, interval: 2800, delay: 1500 },
        ],
      },
      {
        hpAbove: 0.75,
        duration: 8000,
        flashColor: 0xa06bff,
        attacks: [
          { name: 'spiral', params: { arms: 3, step: 0.36, speed: 170, tint: 0xa06bff, tag: 'moo' }, interval: 750 },
          { name: 'fan', params: { count: 7, spread: 0.85, speed: 225, tint: 0xff6f8f }, interval: 2000, telegraph: 350 },
          { name: 'aimed', params: { count: 4, speed: 280, tint: 0xff8fb3 }, interval: 1500 },
          { name: 'cross', params: { speed: 190, tint: 0xffd75e, tag: 'moo' }, interval: 2400, delay: 1000 },
        ],
      },
      {
        hpAbove: 0.5,
        duration: 0,
        tex: 'final_beast',
        scale: 1.0,
        darkness: 0.3,
        scrollMult: 1.8,
        flashColor: 0xffd75e,
        attacks: [
          { name: 'rain', params: { count: 7, speed: 200, tint: 0x8fd3ff }, interval: 2200, delay: 800 },
          { name: 'sweep', params: { count: 9, speed: 230, tint: 0xff8f5f, tag: 'beast' }, interval: 2600, delay: 1500 },
          { name: 'seeker', params: { count: 4, speed: 285, tint: 0xffb347 }, interval: 2000 },
          { name: 'ring', params: { count: 18, speed: 155, tint: 0xa06bff, tag: 'beast' }, interval: 3000, delay: 2000 },
          { name: 'shard', params: { speed: 150, tint: 0xffb347 }, interval: 3600, delay: 2800, telegraph: 400 },
        ],
      },
    ],
  },
};
