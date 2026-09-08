/**
 * 범용 오브젝트 풀.
 * Phaser Group을 쓰기 어려운 순수 객체/조금 특수한 재활용에 사용한다.
 * 탄/적/파티클의 물리 풀은 Phaser.Physics.Arcade.Group(maxSize + recycle)이
 * 담당하고, 이 클래스는 그 외 재활용이 필요한 곳의 최소 헬퍼다.
 */
export interface PoolHooks<T> {
  onAcquire?: (obj: T) => void;
  onRelease?: (obj: T) => void;
}

export class Pool<T> {
  private free: T[] = [];
  private usedCount = 0;

  constructor(
    private readonly factory: () => T,
    private readonly hooks: PoolHooks<T> = {},
    initialSize = 0,
  ) {
    for (let i = 0; i < initialSize; i += 1) {
      this.free.push(this.factory());
    }
  }

  get size(): number {
    return this.free.length + this.usedCount;
  }

  get available(): number {
    return this.free.length;
  }

  get active(): number {
    return this.usedCount;
  }

  acquire(): T {
    const obj = this.free.pop() ?? this.factory();
    this.usedCount += 1;
    if (this.hooks.onAcquire) this.hooks.onAcquire(obj);
    return obj;
  }

  release(obj: T): void {
    if (this.hooks.onRelease) this.hooks.onRelease(obj);
    this.free.push(obj);
    this.usedCount = Math.max(0, this.usedCount - 1);
  }

  /** 풀 전체를 비우고 팩토리로 다시 채운다 (씬 재시작용). */
  reset(releaseAll: T[]): void {
    for (const obj of releaseAll) {
      if (this.hooks.onRelease) this.hooks.onRelease(obj);
      this.free.push(obj);
    }
    this.usedCount = 0;
  }

  /** 유휴 객체를 미리 확보해 프레임 드랍을 방지한다. */
  prewarm(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.free.push(this.factory());
    }
  }

  forEachFree(fn: (obj: T) => void): void {
    for (const obj of this.free) fn(obj);
  }
}
