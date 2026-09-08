import { HEIGHT, WIDTH } from '../GameConfig';
import type { IGameWorld } from '../GameConfig';
import type { GroupPattern, StageDef, WaveAction, WaveSpawnOpts } from '../data/stages';

const MAX_ACTIVE = 64;

/**
 * 웨이브 타임라인 실행기. 경과 시간(ms) 기준으로 이벤트를 한 번씩 실행한다.
 * 보스전 동안에는 GameScene이 setSuspended(true)로 시간을 멈춘다.
 */
export class EnemySpawner {
  private elapsed = 0;
  private index = 0;
  private suspended = false;
  private readonly events: StageDef['waves'];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: IGameWorld,
    private readonly stage: StageDef,
  ) {
    this.events = [...stage.waves].sort((a, b) => a.t - b.t);
  }

  setSuspended(s: boolean): void {
    this.suspended = s;
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
  }

  /** 모든 이벤트 소진 + 화면 내 적 없음 (GameScene 클리어 판정용) */
  isStageWavesDone(): boolean {
    return this.index >= this.events.length && this.world.getActiveEnemyCount() === 0;
  }

  reset(): void {
    this.elapsed = 0;
    this.index = 0;
    this.suspended = false;
  }

  // -- 액션 실행 ---------------------------------------------------------------

  private runAction(a: WaveAction): void {
    switch (a.type) {
      case 'spawn':
        this.world.spawnEnemy(a.typeId, a.x, a.y, a.opts);
        break;
      case 'group':
        this.runGroup(a.typeId, a.count, a.pattern, a.x, a.y, a.gap, a.interval, a.opts);
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
      if (this.world.getActiveEnemyCount() >= MAX_ACTIVE) return;
      const off = i - center;
      if (pattern === 'line') {
        // x 간격으로 종대 진입 (뒤따를수록 늦게 도착)
        this.world.spawnEnemy(typeId, x + i * gap, cy, opts);
      } else if (pattern === 'v') {
        // y 대칭 + 완만한 갈매기 날개
        this.world.spawnEnemy(typeId, x + Math.abs(off) * 36, cy + off * gap, opts);
      } else if (pattern === 'arc') {
        // 포물선: 가장자리가 뒤로 처짐
        this.world.spawnEnemy(typeId, x + off * off * 18, cy + off * gap, opts);
      } else {
        // stream: 같은 x, 시차 진입
        const sy = Math.max(70, Math.min(HEIGHT - 70, cy + (i % 2 === 0 ? -24 : 24)));
        if (i === 0) {
          this.world.spawnEnemy(typeId, x, sy, opts);
        } else {
          const delay = i * Math.max(200, interval);
          this.scene.time.delayedCall(delay, () => {
            try {
              if (!this.scene.scene.isActive()) return;
              if (this.world.getActiveEnemyCount() >= MAX_ACTIVE) return;
              this.world.spawnEnemy(typeId, x, sy, opts);
            } catch {
              // 무시
            }
          });
        }
      }
    }
  }
}
