/**
 * 긴박감 측정(개발 서버 전용). 실제 GameScene을 무적 봇으로 고정 프레임(60fps) 빠르게 돌려,
 * 스테이지 도중·중간보스·보스 구간마다 화면 위 적탄 수, 적탄이 하나도 없는 시간, 잡몹 등장 수,
 * 기체 곁을 스친 탄 수, 피하지 않았다면 맞았을 탄 수를 잰다. tools/tension.mjs가 헤드리스 Chrome으로 읽는다.
 *
 * 봇: 계속 쏜다. 도중에는 weave(x 260에서 위아래로 천천히 오르내림) 또는 camp(왼쪽 가운데 x 150에 가만히),
 * 보스전에는 보스 높이를 따라 680px 떨어져 쏜다. 피하지 않으므로 '맞았을 탄'은 회피 없이 받는 압박의 크기다.
 */
import type Phaser from 'phaser';

const DT = 1000 / 60;
/** 이 거리 안에 처음 들어온 적탄 = 스침 */
const GRAZE_R = 32;
/** 이 거리 안에 처음 들어온 적탄 = 피하지 않았다면 맞았을 탄(판정 반지름 6 + 탄 몸통) */
const HIT_R = 12;

export interface TensionRun {
  name: string;
  stage: number;
  difficulty?: 'EASY' | 'NORMAL' | 'HARD' | 'EXTREME';
  char?: number;
  power?: number;
  /** 도중 이동 방식 (기본 weave) */
  bot?: 'weave' | 'camp';
  /** 게임 시간 상한(초). 그 전에 스테이지를 깨면 끝난다. */
  maxSec?: number;
}

export interface SegmentStats {
  sec: number;
  /** 화면 안 적탄 평균·90백분위·최대 */
  bulletsAvg: number;
  bulletsP90: number;
  bulletsMax: number;
  /** 화면 안 적탄이 0발인 시간 비율(%) */
  emptyPct: number;
  /** 분당 새로 나온 잡몹 수 */
  enemiesPerMin: number;
  /** 초당 스친 탄 수 */
  grazePerSec: number;
  /** 분당 피하지 않았다면 맞았을 탄 수 */
  hitsPerMin: number;
}

export interface TensionResult {
  name: string;
  /** 스테이지를 깼는가(보스 격파) */
  cleared: boolean;
  sec: number;
  road?: SegmentStats;
  midboss?: SegmentStats;
  boss?: SegmentStats;
  /** 처치한 잡몹 가운데 한 발도 쏘지 못한 비율(%) */
  silentKillPct: number;
}

interface LooseEnemy {
  active: boolean;
  x: number;
  y: number;
  fireTimer: number;
  hp: number;
  __seen?: boolean;
  __fired?: boolean;
  __lastFT?: number;
}

interface LooseBullet {
  active: boolean;
  x: number;
  y: number;
  __graze?: boolean;
  __hit?: boolean;
}

interface LooseGameScene extends Phaser.Scene {
  player: { x: number; y: number; godMode: boolean };
  inputSys: unknown;
  enemies: LooseEnemy[];
  enemyBullets: LooseBullet[];
  boss: { x: number; y: number } | null;
  bossState: string;
  bossId: string;
  clearShown: boolean;
}

interface HeadlessGame extends Phaser.Game {
  headlessStep(time: number, delta: number): void;
}

function fakeInput() {
  const f = {
    axis: { x: 0, y: 0 },
    attackDown: true,
    attackJustPressed: false,
    attackJustReleased: false,
    bombJustPressed: false,
    pauseJustPressed: false,
    muteJustPressed: false,
    focusDown: false,
    update() {},
    getAxis() {
      return f.axis;
    },
    consumeDebug() {
      return { box: false, invincible: false, boss: false, next: false };
    },
  };
  return f;
}

interface Acc {
  samples: number[];
  frames: number;
  spawned: number;
  graze: number;
  hits: number;
}

const newAcc = (): Acc => ({ samples: [], frames: 0, spawned: 0, graze: 0, hits: 0 });

function stats(a: Acc): SegmentStats | undefined {
  if (a.frames === 0 || a.samples.length === 0) return undefined;
  const sec = a.frames / 60;
  const sorted = [...a.samples].sort((x, y) => x - y);
  const round1 = (v: number) => Math.round(v * 10) / 10;
  return {
    sec: Math.round(sec),
    bulletsAvg: round1(a.samples.reduce((s, v) => s + v, 0) / a.samples.length),
    bulletsP90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))],
    bulletsMax: sorted[sorted.length - 1],
    emptyPct: Math.round((a.samples.filter((v) => v === 0).length / a.samples.length) * 100),
    enemiesPerMin: round1((a.spawned / sec) * 60),
    grazePerSec: Math.round((a.graze / sec) * 100) / 100,
    hitsPerMin: round1((a.hits / sec) * 60),
  };
}

export async function runTension(game: Phaser.Game, runs: TensionRun[]): Promise<TensionResult[]> {
  const g = game as HeadlessGame;
  while (!g.scene.isActive('Title')) await new Promise((r) => setTimeout(r, 100));
  g.loop.sleep();
  let now = performance.now();
  // 트윈(TweenManager)은 Date.now로 시간을 재므로 벽시계도 가상 프레임 시계를 따르게 한다.
  let wall = Date.now();
  Date.now = () => wall;
  let sinceYield = 0;
  const step = async (): Promise<void> => {
    now += DT;
    wall += DT;
    g.headlessStep(now, DT);
    sinceYield += 1;
    if (sinceYield >= 600) {
      sinceYield = 0;
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  const results: TensionResult[] = [];
  let from: Phaser.Scene = g.scene.getScene('Title');
  for (const run of runs) {
    from.scene.start('Game', {
      stageIndex: run.stage,
      charIndex: run.char ?? 0,
      difficulty: run.difficulty ?? 'NORMAL',
      lives: 9,
      bombs: 0,
      power: run.power ?? 3,
    });
    await step();
    await step();
    const gs = g.scene.getScene('Game') as LooseGameScene;
    from = gs;
    gs.player.godMode = true;
    const inp = fakeInput();
    gs.inputSys = inp;

    const seg: Record<'road' | 'midboss' | 'boss', Acc> = { road: newAcc(), midboss: newAcc(), boss: newAcc() };
    let killed = 0;
    let silent = 0;
    let t = 0;
    let sampleAcc = 0;
    let cleared = false;
    const maxMs = (run.maxSec ?? 480) * 1000;
    while (t < maxMs) {
      const p = gs.player;
      const st = gs.bossState;
      const boss = gs.boss;
      let tx = 260;
      let ty = 360 + Math.sin(t / 2600) * 210;
      if (boss && st === 'active') {
        tx = Math.max(120, boss.x - 680);
        ty = boss.y;
      } else if (run.bot === 'camp') {
        tx = 150;
        ty = 360;
      }
      const dx = tx - p.x;
      const dy = ty - p.y;
      inp.axis = { x: Math.abs(dx) > 8 ? Math.sign(dx) : 0, y: Math.abs(dy) > 5 ? Math.sign(dy) * Math.min(1, Math.abs(dy) / 30) : 0 };
      await step();
      t += DT;

      const key = st === 'none' ? 'road' : st === 'active' ? (String(gs.bossId).startsWith('midboss') ? 'midboss' : 'boss') : null;
      const acc = key ? seg[key] : null;
      if (acc) acc.frames += 1;

      // 잡몹: 새로 나온 수, 한 발이라도 쏘고 죽었는지(발사 타이머가 다시 채워지면 쏜 것)
      for (const e of gs.enemies) {
        if (e.active) {
          if (!e.__seen) {
            e.__seen = true;
            e.__fired = false;
            e.__lastFT = e.fireTimer;
            if (acc) acc.spawned += 1;
          } else {
            if (e.fireTimer > (e.__lastFT ?? 0) + 1) e.__fired = true;
            e.__lastFT = e.fireTimer;
          }
        } else if (e.__seen) {
          e.__seen = false;
          if (e.hp <= 0) {
            killed += 1;
            if (!e.__fired) silent += 1;
          }
        }
      }
      // 스침·맞았을 탄: 각 탄이 처음 그 거리 안에 들어온 순간 한 번 센다
      for (const b of gs.enemyBullets) {
        if (!b.active) {
          b.__graze = false;
          b.__hit = false;
          continue;
        }
        const ddx = b.x - p.x;
        const ddy = b.y - p.y;
        const d2 = ddx * ddx + ddy * ddy;
        if (!b.__graze && d2 < GRAZE_R * GRAZE_R) {
          b.__graze = true;
          if (acc) acc.graze += 1;
        }
        if (!b.__hit && d2 < HIT_R * HIT_R) {
          b.__hit = true;
          if (acc) acc.hits += 1;
        }
      }
      sampleAcc += DT;
      if (sampleAcc >= 250) {
        sampleAcc = 0;
        if (acc) {
          let n = 0;
          for (const b of gs.enemyBullets) {
            if (b.active && b.x >= 0 && b.x <= 1280 && b.y >= 0 && b.y <= 720) n += 1;
          }
          acc.samples.push(n);
        }
      }
      if (st === 'done' || gs.clearShown) {
        cleared = true;
        break;
      }
    }
    results.push({
      name: run.name,
      cleared,
      sec: Math.round(t / 1000),
      road: stats(seg.road),
      midboss: stats(seg.midboss),
      boss: stats(seg.boss),
      silentKillPct: killed > 0 ? Math.round((silent / killed) * 100) : 0,
    });
  }
  return results;
}

/** 기본 측정 세트: 6스테이지 NORMAL(윤, 파워 3) + 1스테이지 파워 0(weave·camp) */
export function defaultRuns(): TensionRun[] {
  const out: TensionRun[] = [];
  for (let s = 0; s < 6; s += 1) out.push({ name: `S${s + 1} NORMAL P3`, stage: s });
  out.push({ name: 'S1 NORMAL P0', stage: 0, power: 0 });
  out.push({ name: 'S1 NORMAL P0 camp', stage: 0, power: 0, bot: 'camp' });
  return out;
}
