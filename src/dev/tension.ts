/**
 * 긴박감 측정(개발 서버 전용). 실제 GameScene을 무적 봇으로 고정 프레임(60fps) 빠르게 돌려,
 * 스테이지 도중·중간보스·보스 구간마다 화면 위 적탄 수, 적탄이 하나도 없는 시간, 잡몹 등장 수,
 * 기체 곁을 스친 탄 수, 피하지 않아 판정에 닿은 탄 수를 잰다. tools/tension.mjs가 헤드리스 Chrome으로 읽는다.
 *
 * 봇: 계속 쏜다. 도중에는 weave(x 260에서 위아래로 천천히 오르내림) 또는 camp(왼쪽 가운데 x 150에 가만히),
 * 보스전에는 보스 높이를 따라 680px 떨어져 쏜다. 피하지 않으므로 '닿은 탄'은 회피 없이 받는 압박의 크기다.
 *
 * 계측은 프레임 뒤 훑기가 아니라 사건에 붙인다. 적과 탄은 풀에서 재사용되고, 물리(충돌로 죽음·탄 소멸)가
 * 스포너보다 먼저 돌아 같은 프레임에 죽은 객체가 곧바로 새 적·새 탄으로 쓰일 수 있기 때문이다.
 * - 적: Enemy.spawn(한 마리의 삶 시작·등장 수), Enemy.update 동안의 spawnEnemyBullet(그 적이 쏨), Enemy.die(처치)
 * - 탄: Bullet.fire(스침·닿음 표시 초기화), 적탄↔기체 충돌 콜백(무적이라 맞지 않고 사라지기 직전에 닿음으로 셈)
 */
import type Phaser from 'phaser';
import { Bullet } from '../game/entities/Bullet';
import { Enemy } from '../game/entities/Enemy';

const DT = 1000 / 60;
/** 이 거리 안에 처음 들어온 적탄 = 스침 */
const GRAZE_R = 32;

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
  /** 분당 판정에 닿은 탄 수(피하지 않았다면 맞았을 탄) */
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

/** 계측용으로 덧붙이는 필드 */
interface TrackedEnemy {
  __life?: { fired: boolean };
}

interface TrackedBullet {
  active: boolean;
  x: number;
  y: number;
  __graze?: boolean;
  __hit?: boolean;
}

interface EnemyProto {
  spawn(...args: unknown[]): void;
  update(dtMs: number): void;
  die(): void;
}

interface BulletProto {
  fire(...args: unknown[]): void;
}

interface LooseCollider {
  object1: unknown;
  object2: unknown;
  collideCallback: ((a: unknown, b: unknown) => void) | null;
  callbackContext: unknown;
}

interface LooseGameScene extends Phaser.Scene {
  player: { x: number; y: number; godMode: boolean; sprite: unknown };
  inputSys: unknown;
  enemyBullets: TrackedBullet[];
  enemyBulletGroup: unknown;
  boss: { x: number; y: number } | null;
  bossState: string;
  bossId: string;
  clearShown: boolean;
  spawnEnemyBullet(...args: unknown[]): void;
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

  // -- 사건 계측 (측정이 끝나면 되돌린다) --
  /** 지금 진행 중인 프레임이 속한 구간(보스 상태는 프레임 시작 기준) */
  let curAcc: Acc | null = null;
  /** update 중인 잡몹: 이때 나온 적탄은 그 잡몹이 쏜 것 */
  let shooter: TrackedEnemy | null = null;
  let killed = 0;
  let silent = 0;
  const eproto = Enemy.prototype as unknown as EnemyProto;
  const bproto = Bullet.prototype as unknown as BulletProto;
  const orig = { spawn: eproto.spawn, update: eproto.update, die: eproto.die, fire: bproto.fire };
  eproto.spawn = function (this: TrackedEnemy, ...args: unknown[]) {
    orig.spawn.apply(this, args);
    this.__life = { fired: false };
    if (curAcc) curAcc.spawned += 1;
  };
  eproto.update = function (this: TrackedEnemy, dtMs: number) {
    shooter = this;
    try {
      orig.update.call(this, dtMs);
    } finally {
      shooter = null;
    }
  };
  eproto.die = function (this: TrackedEnemy) {
    const life = this.__life;
    if (life) {
      killed += 1;
      if (!life.fired) silent += 1;
      this.__life = undefined;
    }
    orig.die.call(this);
  };
  bproto.fire = function (this: TrackedBullet, ...args: unknown[]) {
    this.__graze = false;
    this.__hit = false;
    orig.fire.apply(this, args);
  };

  const results: TensionResult[] = [];
  try {
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

      // 잡몹이 쏜 탄: 씬 인스턴스의 spawnEnemyBullet을 감싼다(Enemy가 this.world.spawnEnemyBullet로 부른다)
      const origShoot = gs.spawnEnemyBullet;
      gs.spawnEnemyBullet = (...args: unknown[]) => {
        if (shooter?.__life) shooter.__life.fired = true;
        origShoot.apply(gs, args);
      };
      // 판정에 닿은 탄: 적탄↔기체 충돌 콜백이 탄을 없애기 직전에 센다
      const sprite = gs.player.sprite;
      const colliders = gs.physics.world.colliders.getActive() as unknown as LooseCollider[];
      const hitCol = colliders.find(
        (c) => (c.object1 === gs.enemyBulletGroup && c.object2 === sprite) || (c.object2 === gs.enemyBulletGroup && c.object1 === sprite),
      );
      if (!hitCol || !hitCol.collideCallback) throw new Error('적탄↔기체 충돌을 찾지 못했습니다');
      const origHit = hitCol.collideCallback;
      hitCol.collideCallback = (a: unknown, b: unknown) => {
        const bullet = (a === sprite ? b : a) as TrackedBullet;
        if (bullet.active && curAcc) {
          if (!bullet.__hit) {
            bullet.__hit = true;
            curAcc.hits += 1;
          }
          if (!bullet.__graze) {
            bullet.__graze = true;
            curAcc.graze += 1;
          }
        }
        origHit.call(hitCol.callbackContext, a, b);
      };

      const seg: Record<'road' | 'midboss' | 'boss', Acc> = { road: newAcc(), midboss: newAcc(), boss: newAcc() };
      killed = 0;
      silent = 0;
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
        const key = st === 'none' ? 'road' : st === 'active' ? (String(gs.bossId).startsWith('midboss') ? 'midboss' : 'boss') : null;
        curAcc = key ? seg[key] : null;
        await step();
        t += DT;
        const acc = curAcc;
        if (acc) acc.frames += 1;

        // 스침: 살아 있는 적탄이 처음 이 거리 안에 들어온 순간 한 번(표시는 Bullet.fire가 초기화)
        for (const b of gs.enemyBullets) {
          if (!b.active || b.__graze) continue;
          const ddx = b.x - p.x;
          const ddy = b.y - p.y;
          if (ddx * ddx + ddy * ddy < GRAZE_R * GRAZE_R) {
            b.__graze = true;
            if (acc) acc.graze += 1;
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
      curAcc = null;
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
  } finally {
    eproto.spawn = orig.spawn;
    eproto.update = orig.update;
    eproto.die = orig.die;
    bproto.fire = orig.fire;
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
