import { HEIGHT, WIDTH } from '../GameConfig';
import type { EnemyEntry, IGameWorld } from '../GameConfig';
import type { EnemySpawnArgs } from '../entities/Enemy';
import type { FlowAction, GroupPattern, StageDef, WaveAction, WaveSpawnOpts } from '../data/stages';

const MAX_ACTIVE = 64;
/** 위·아래·뒤에서 들어오는 잡몹은 이만큼 먼저 들어올 길에 경고선을 보인다 (ms, 게임 시간) */
const ENTRY_WARN_MS = 700;
const ENTRY_WARN_COLOR = 0xffb347;
/** fx_warn_line 그림에서 불투명한 가운데 부분의 비율(512px 중 123~388) */
const WARN_LINE_OPAQUE = 0.52;
/** flow로 나온 잡몹의 아이템 확률 배율: 잡몹 수가 늘어도 스테이지당 아이템(특히 목숨·필살기)은 크게 늘지 않게 */
const FLOW_DROP_SCALE = 0.3;
/** flow 기본 출발 x (화면 오른쪽 밖) */
const FLOW_X = WIDTH + 80;

/** 시차를 두고 나올 잡몹(stream·flow·가장자리 등장의 경고 시간) */
interface PendingSpawn {
  /** 경고선을 띄울 시각 (경과 ms, 가장자리 등장만) */
  warnAt: number;
  /** 실제로 나오는 시각 (경과 ms) */
  at: number;
  typeId: string;
  x: number;
  y: number;
  opts?: EnemySpawnArgs;
  warn: Phaser.GameObjects.Image | null;
}

/**
 * 웨이브 타임라인 실행기. 경과 시간(ms) 기준으로 이벤트를 한 번씩 실행한다.
 * 보스전 동안에는 GameScene이 setSuspended(true)로 시간을 멈추고, 아직 나오지 않은 잡몹(시차 스폰)은 취소한다.
 */
export class EnemySpawner {
  private elapsed = 0;
  private index = 0;
  private suspended = false;
  private readonly events: StageDef['waves'];
  private pending: PendingSpawn[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: IGameWorld,
    private readonly stage: StageDef,
  ) {
    this.events = [...stage.waves].sort((a, b) => a.t - b.t);
  }

  setSuspended(s: boolean): void {
    this.suspended = s;
    if (s) this.clearPending();
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  /** 스테이지 경과 시간 (초) */
  getStageTime(): number {
    return this.elapsed / 1000;
  }

  update(dtMs: number): void {
    if (this.suspended) return;
    this.elapsed += dtMs;
    while (this.index < this.events.length && this.events[this.index].t * 1000 <= this.elapsed) {
      const ev = this.events[this.index];
      this.index += 1;
      for (const action of ev.actions) {
        this.runAction(action);
      }
    }
    if (this.pending.length > 0) this.updatePending();
  }

  /** 모든 이벤트 소진 + 나올 잡몹 없음 + 화면 내 적 없음 (GameScene 클리어 판정용) */
  isStageWavesDone(): boolean {
    return this.index >= this.events.length && this.pending.length === 0 && this.world.getActiveEnemyCount() === 0;
  }

  reset(): void {
    this.elapsed = 0;
    this.index = 0;
    this.suspended = false;
    this.clearPending();
  }

  // -- 액션 실행 ---------------------------------------------------------------

  private runAction(a: WaveAction): void {
    switch (a.type) {
      case 'spawn':
        this.queueSpawn(a.typeId, a.x, a.y, a.opts, 0);
        break;
      case 'group':
        this.runGroup(a.typeId, a.count, a.pattern, a.x, a.y, a.gap, a.interval, a.opts);
        break;
      case 'flow':
        this.runFlow(a);
        break;
      case 'scroll':
        this.world.setScrollSpeed(a.speed);
        break;
      case 'midboss':
      case 'boss':
        this.world.startBoss(a.bossId);
        break;
      case 'pause':
        // 시간 기반 타임라인의 호흡 표식. 별도 동작 없음.
        break;
    }
  }

  private runGroup(
    typeId: string,
    count: number,
    pattern: GroupPattern,
    x = WIDTH + 60,
    y = 360,
    gap = 90,
    interval = 550,
    opts?: WaveSpawnOpts,
  ): void {
    const n = Math.max(1, Math.min(8, Math.floor(count)));
    const cy = Math.max(70, Math.min(HEIGHT - 70, y));
    const center = (n - 1) / 2;
    for (let i = 0; i < n; i += 1) {
      const off = i - center;
      if (pattern === 'line') {
        // x 간격으로 종대 진입 (뒤따를수록 늦게 도착)
        this.queueSpawn(typeId, x + i * gap, cy, opts, 0);
      } else if (pattern === 'v') {
        // y 대칭 + 완만한 갈매기 날개
        this.queueSpawn(typeId, x + Math.abs(off) * 36, cy + off * gap, opts, 0);
      } else if (pattern === 'arc') {
        // 포물선: 가장자리가 뒤로 처짐
        this.queueSpawn(typeId, x + off * off * 18, cy + off * gap, opts, 0);
      } else {
        // stream: 같은 x, 시차 진입
        const sy = Math.max(70, Math.min(HEIGHT - 70, cy + (i % 2 === 0 ? -24 : 24)));
        this.queueSpawn(typeId, x, sy, opts, i * Math.max(200, interval));
      }
    }
  }

  private runFlow(a: FlowAction): void {
    // 탄 밀도가 1보다 낮은 난이도(EASY)는 흐름 잡몹 수도 그만큼 줄인다. 높은 난이도는 수를 늘리지 않는다(발사 빈도로 올라간다).
    const n = Math.max(1, Math.round(Math.floor(a.count) * Math.min(1, this.world.getPreset().density)));
    const period = Math.max(1, a.period ?? n);
    const amp = a.amp ?? 0;
    const opts: EnemySpawnArgs = { ...a.opts, dropScale: FLOW_DROP_SCALE };
    for (let i = 0; i < n; i += 1) {
      const y = Math.max(70, Math.min(HEIGHT - 70, a.y + amp * Math.sin((2 * Math.PI * (i + 0.25)) / period)));
      this.queueSpawn(a.typeId, a.x ?? FLOW_X, y, opts, i * Math.max(120, a.every));
    }
  }

  /** delayMs 뒤에 잡몹을 낸다. 가장자리 등장이면 그 앞에 경고선 시간(ENTRY_WARN_MS)을 더 둔다. */
  private queueSpawn(typeId: string, x: number, y: number, opts: EnemySpawnArgs | undefined, delayMs: number): void {
    const edge = opts?.entry !== undefined && opts.entry !== 'right';
    if (!edge && delayMs <= 0) {
      this.spawnNow(typeId, x, y, opts);
      return;
    }
    const warnAt = this.elapsed + delayMs;
    this.pending.push({ warnAt, at: warnAt + (edge ? ENTRY_WARN_MS : 0), typeId, x, y, opts, warn: null });
  }

  private updatePending(): void {
    const keep: PendingSpawn[] = [];
    for (const p of this.pending) {
      if (p.at <= this.elapsed) {
        this.dropWarn(p);
        this.spawnNow(p.typeId, p.x, p.y, p.opts);
        continue;
      }
      const entry = p.opts?.entry;
      if (!p.warn && entry !== undefined && entry !== 'right' && p.warnAt <= this.elapsed) {
        p.warn = this.showEntryWarn(entry, p.x, p.y);
        // 뒤·위·아래는 눈길 밖일 수 있어 소리로도 알린다(무리가 한꺼번에 와도 AudioSystem이 0.2초에 한 번으로 거른다)
        this.world.audio.playSfx('edgeWarn');
      }
      keep.push(p);
    }
    this.pending = keep;
  }

  private spawnNow(typeId: string, x: number, y: number, opts?: EnemySpawnArgs): void {
    if (this.world.getActiveEnemyCount() >= MAX_ACTIVE) return;
    this.world.spawnEnemy(typeId, x, y, opts);
  }

  /** 가장자리에서 도착점까지 들어올 길을 깜빡이는 선으로 보인다(레이저 경고보다 가늘고 주황). */
  private showEntryWarn(entry: Exclude<EnemyEntry, 'right'>, x: number, y: number): Phaser.GameObjects.Image | null {
    try {
      // 선은 가장자리 점(ex, ey)에서 도착점까지. 그림은 가운데 52%만 불투명하고 양 끝이 투명하므로
      // 가운데에 놓고 길이를 그만큼 늘려 보이는 부분이 정확히 가장자리~도착점이 되게 한다.
      let ex = 0;
      let ey = y;
      if (entry === 'top') {
        ex = x;
        ey = 0;
      } else if (entry === 'bottom') {
        ex = x;
        ey = HEIGHT;
      }
      const len = Math.max(40, Math.hypot(x - ex, y - ey));
      const img = this.scene.add
        .image((ex + x) / 2, (ey + y) / 2, 'fx_warn_line')
        .setRotation(entry === 'back' ? 0 : Math.PI / 2)
        .setDisplaySize(len / WARN_LINE_OPAQUE, 8)
        .setTint(ENTRY_WARN_COLOR)
        .setAlpha(0.75)
        .setDepth(490);
      this.scene.tweens.add({ targets: img, alpha: 0.2, duration: 120, yoyo: true, repeat: -1 });
      return img;
    } catch {
      // 경고선을 못 그려도 잡몹은 나온다
      return null;
    }
  }

  private dropWarn(p: PendingSpawn): void {
    if (!p.warn) return;
    this.scene.tweens.killTweensOf(p.warn);
    p.warn.destroy();
    p.warn = null;
  }

  private clearPending(): void {
    for (const p of this.pending) this.dropWarn(p);
    this.pending = [];
  }
}
