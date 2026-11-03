/**
 * 화력 측정(개발 서버 전용, `?bench`로 열면 실행). 실제 GameScene·Player·Boss 코드를 화면 없이
 * 고정 프레임(60fps)으로 빠르게 돌려, 천명사·파워·공격 방식별로 보스가 실제로 받은 피해를 잰다.
 * 결과는 window.__benchResult(JSON)에 남는다. tools/bench.mjs가 헤드리스 Chrome으로 읽는다.
 *
 * 조작 모델(숙련자 상한): 보스 높이에 맞춰 움직이며 쏜다. 사거리가 짧은 천명사는 가까이 붙는다.
 */
import type Phaser from 'phaser';
import { CHARACTERS } from '../game/data/characters';

const DT = 1000 / 60;

export type BenchMode = 'hold' | 'charge' | 'bomb';

export interface BenchCase {
  char: number;
  power: number;
  mode: BenchMode;
  /** 측정 시간(ms, 게임 시간). untilDead면 상한 */
  ms: number;
  /** true면 보스 HP를 그대로 두고 쓰러뜨릴 때까지 걸린 시간을 잰다(페이즈 전환 무적 포함) */
  untilDead?: boolean;
}

export interface BenchRow extends BenchCase {
  id: string;
  /** 측정 구간 동안 보스가 실제로 잃은 HP */
  applied: number;
  /** 보스에 닿은 공격의 피해 합(무적·피격 간격으로 버려진 것 포함) */
  attempted: number;
  elapsedMs: number;
  dps: number;
  /** untilDead: 쓰러뜨렸는지 */
  killed?: boolean;
}

interface LooseBoss {
  hp: number;
  x: number;
  y: number;
  isDefeated: boolean;
  invulnLeft: number;
  takeDamage(dmg: number): void;
}

interface FakeInput {
  axis: { x: number; y: number };
  attackDown: boolean;
  attackJustPressed: boolean;
  attackJustReleased: boolean;
  bombJustPressed: boolean;
  pauseJustPressed: boolean;
  muteJustPressed: boolean;
  focusDown: boolean;
  update(): void;
  getAxis(): { x: number; y: number };
  consumeDebug(): { box: boolean; invincible: boolean; boss: boolean; next: boolean };
}

interface LooseGameScene extends Phaser.Scene {
  player: { x: number; y: number; godMode: boolean; isAlive(): boolean };
  spawner: { setSuspended(v: boolean): void };
  inputSys: unknown;
  boss: LooseBoss | null;
  bossState: string;
  startBoss(id: string): void;
}

interface HeadlessGame extends Phaser.Game {
  headlessStep(time: number, delta: number): void;
}

function fakeInput(): FakeInput {
  const f: FakeInput = {
    axis: { x: 0, y: 0 },
    attackDown: false,
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

/** 천명사별로 붙는 거리(보스 중심과의 가로 간격). 혜각은 사거리가 약 340px라 바짝 붙는다. */
function preferredGap(charIndex: number): number {
  return CHARACTERS[charIndex].id === 'hyegak' ? 260 : 680;
}

export async function runBench(game: Phaser.Game, cases: BenchCase[], bossId = 'midboss_ray'): Promise<BenchRow[]> {
  const g = game as HeadlessGame;
  // 부팅·글꼴이 끝나 타이틀이 뜰 때까지는 평소처럼 돈다.
  while (!g.scene.isActive('Title')) await new Promise((r) => setTimeout(r, 100));
  g.loop.sleep();
  let now = performance.now();
  // 트윈(TweenManager)은 Date.now로 시간을 재므로, 측정 페이지에서는 벽시계도 가상 프레임 시계를 따르게 한다.
  let wall = Date.now();
  Date.now = () => wall;
  let stepsSinceYield = 0;
  const step = async (n = 1): Promise<void> => {
    for (let i = 0; i < n; i += 1) {
      now += DT;
      wall += DT;
      g.headlessStep(now, DT);
      stepsSinceYield += 1;
      if (stepsSinceYield >= 600) {
        stepsSinceYield = 0;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  };

  const rows: BenchRow[] = [];
  let from: Phaser.Scene = g.scene.getScene('Title');
  for (const c of cases) {
    from.scene.start('Game', {
      stageIndex: 0,
      charIndex: c.char,
      difficulty: 'NORMAL',
      lives: 9,
      bombs: c.mode === 'bomb' ? 1 : 0,
      power: c.power,
    });
    await step(2);
    const gs = g.scene.getScene('Game') as LooseGameScene;
    from = gs;
    gs.player.godMode = true;
    gs.spawner.setSuspended(true);
    const inp = fakeInput();
    gs.inputSys = inp;
    gs.startBoss(bossId);

    // 보스 등장(경고·입장 무적)이 끝날 때까지 대기
    let guard = 0;
    while (!(gs.bossState === 'active' && gs.boss && gs.boss.invulnLeft <= 0) && guard < 60 * 20) {
      await step(1);
      guard += 1;
    }
    const boss = gs.boss;
    if (!boss) throw new Error(`보스 생성 실패: ${bossId}`);
    // 화력 측정은 보스가 쓰러지지 않게 HP를 크게 둔다(받은 피해만 잰다).
    if (!c.untilDead) boss.hp = 1e9;
    let attempted = 0;
    const orig = boss.takeDamage.bind(boss);
    boss.takeDamage = (dmg: number) => {
      if (!boss.isDefeated && Number.isFinite(dmg) && dmg > 0) attempted += dmg;
      orig(dmg);
    };

    let startHp = boss.hp;
    let t = 0;
    let chargeAcc = 0;
    let bombFired = false;
    while (t < c.ms && !(c.untilDead && (boss.isDefeated || gs.boss !== boss))) {
      const p = gs.player;
      const gap = preferredGap(c.char);
      const tx = Math.max(120, boss.x - gap);
      const dx = tx - p.x;
      const dy = boss.y - p.y;
      inp.axis = { x: Math.abs(dx) > 8 ? Math.sign(dx) : 0, y: Math.abs(dy) > 5 ? Math.sign(dy) * Math.min(1, Math.abs(dy) / 30) : 0 };
      inp.bombJustPressed = false;
      inp.attackJustReleased = false;
      if (c.mode === 'hold') {
        inp.attackDown = true;
      } else if (c.mode === 'charge') {
        // 1.25초 눌렀다가 한 프레임 떼서 차지를 쏘는 것을 되풀이한다.
        chargeAcc += DT;
        if (chargeAcc >= 1250) {
          chargeAcc = 0;
          inp.attackDown = false;
          inp.attackJustReleased = true;
        } else {
          inp.attackDown = true;
        }
      } else {
        inp.attackDown = false;
        // 자리를 잡은 뒤(또는 3초 뒤) 필살기를 누르고, 그때부터 ms 동안 잰다.
        if (!bombFired && (Math.abs(dx) < 20 || t > 3000)) {
          bombFired = true;
          inp.bombJustPressed = true;
          startHp = boss.hp;
          attempted = 0;
          t = 0;
        }
      }
      await step(1);
      t += DT;
    }
    const applied = startHp - Math.max(0, boss.hp);
    rows.push({
      ...c,
      id: CHARACTERS[c.char].id,
      applied: Math.round(applied),
      attempted: Math.round(attempted),
      elapsedMs: Math.round(t),
      dps: Math.round((applied / t) * 1000 * 10) / 10,
      ...(c.untilDead ? { killed: boss.isDefeated || gs.boss !== boss } : {}),
    });
  }
  return rows;
}

/** 기본 측정 세트: 계속 쏘기(파워 0~3), 차지 섞기(파워 3), 필살기 1회(파워 3) */
export function defaultCases(): BenchCase[] {
  const out: BenchCase[] = [];
  CHARACTERS.forEach((_, char) => {
    for (let power = 0; power <= 3; power += 1) out.push({ char, power, mode: 'hold', ms: 15000 });
    out.push({ char, power: 3, mode: 'charge', ms: 15000 });
    out.push({ char, power: 3, mode: 'bomb', ms: 4500 });
  });
  return out;
}
