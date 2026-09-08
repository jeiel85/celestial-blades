import Phaser from 'phaser';
import { DIFFICULTY_PRESETS } from '../GameConfig';
import type { BossLike, IGameWorld } from '../GameConfig';
import { ATTACKS, BOSS_DEFS } from '../data/bossPatterns';
import type { BossAttackContext, BossDef } from '../data/bossPatterns';

/**
 * 데이터 기반 보스 (BossLike + BossAttackContext 계약 준수).
 * 페이즈 전환 시 탄 소거 + 짧은 무적 + 플래시/오라 + (필요 시) 텍스처 교체.
 * 사망 연출은 GameScene이 담당하므로 여기서는 isDefeated 설정 후 정지한다.
 *
 * 필살기 남발 방지: 25ms 히트 게이트(장갑)로 초당 최대 40회까지만 피해를 받는다.
 * 기본 공격(약 10~36회/초)은 그대로 통과하고, 필살기의 다단히트만 감쇠된다.
 */

const HIT_GATE_MS = 25;
const HIT_SFX_GAP_MS = 90;
const BOSS_FLASH_GAP_MS = 150;
const TRAIL_PUSH_MS = 26;

interface AttackTimer {
  elapsed: number;
}

interface Clone {
  img: Phaser.GameObjects.Image;
  life: number;
  fireT: number;
}

interface Part {
  img: Phaser.GameObjects.Image;
  angle: number;
  fireT: number;
}

export class Boss implements BossLike, BossAttackContext {
  attackState: Record<string, number> = {};

  /** 공격 컨텍스트용 공개 씬 참조 */
  readonly scene: Phaser.Scene;
  private readonly world: IGameWorld;
  private readonly def: BossDef;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly seed: number = Math.random() * Math.PI * 2;
  private readonly anchorX: number;
  private readonly anchorY: number;
  private baseScale: number;

  private maxHp: number;
  private hp: number;
  private timeMs = 0;
  private entered = false;
  private destroyed = false;
  isDefeated = false;

  private invulnLeft = 0;
  private hitGateLeft = 0;
  private lastSfxAt = -1000;
  private lastFlashAt = -1000;
  private phaseIndex = 0;
  private phaseTime = 0;
  private timers: AttackTimer[] = [];

  private dashing = false;
  private teleporting = false;
  private warnBlinkLeft = 0;

  // 기계 지네 마디
  private segments: Phaser.GameObjects.Image[] = [];
  private trail: Array<{ x: number; y: number }> = [];
  private trailAcc = 0;

  // 기관왕 분리 부품
  private parts: Part[] = [];

  // 천녀 분신
  private clones: Clone[] = [];

  constructor(scene: Phaser.Scene, world: IGameWorld, bossId: string) {
    const def = BOSS_DEFS[bossId];
    if (!def) throw new Error(`unknown bossId: ${bossId}`);
    this.scene = scene;
    this.world = world;
    this.def = def;

    const mult = world.getDifficulty() === 'HARD' ? 1.25 : world.getDifficulty() === 'EASY' ? 0.85 : 1;
    this.maxHp = Math.round(def.hp * mult);
    this.hp = this.maxHp;
    this.baseScale = def.scale;

    this.anchorX = (def.hover.xMin + def.hover.xMax) / 2;
    this.anchorY = (def.hover.yMin + def.hover.yMax) / 2;

    const e = def.entrance;
    this.sprite = scene.add.image(e.x, e.y, def.tex).setScale(def.scale).setDepth(60);
    this.invulnLeft = e.durationMs;
    scene.tweens.add({
      targets: this.sprite,
      x: this.anchorX,
      y: this.anchorY,
      duration: e.durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.entered = true;
      },
    });

    if (bossId === 'midboss_centipede') this.buildSegments();

    this.timers = def.phases[0].attacks.map((a) => ({ elapsed: -(a.delay ?? 0) }));
    this.applyPhaseVisual(def.phases[0], false);
  }

  // -- BossLike ------------------------------------------------------------

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get active(): boolean {
    return !this.destroyed;
  }

  getHpRatio(): number {
    return Math.max(0, Math.min(1, this.hp / this.maxHp));
  }

  getDisplayName(): string {
    if (this.def.id === 'final_moo' && this.phaseIndex >= 2) return '무명천 — 신수형';
    return this.def.displayName;
  }

  getHitRadius(): number {
    return this.def.radius;
  }

  takeDamage(dmg: number): void {
    if (this.isDefeated || this.destroyed) return;
    if (this.invulnLeft > 0 || this.hitGateLeft > 0) return;
    if (!Number.isFinite(dmg) || dmg <= 0) return;
    this.hitGateLeft = HIT_GATE_MS;
    this.hp -= dmg;
    this.world.addScore(Math.max(1, Math.ceil(dmg)));

    // 피격 플래시 (기본 틴트 없음 — 흰색 후 클리어)
    // 연속 피격 시 흰색에 영구히 덮이지 않도록 시각 플래시만 스로틀한다.
    const now = this.timeMs;
    if (now - this.lastFlashAt > BOSS_FLASH_GAP_MS) {
      this.lastFlashAt = now;
      try {
        this.sprite.setTintFill(0xffffff);
        this.scene.time.delayedCall(70, () => {
          try {
            if (!this.destroyed) this.sprite.clearTint();
          } catch {
            // 무시
          }
        });
      } catch {
        // 무시
      }
    }
    if (now - this.lastSfxAt > HIT_SFX_GAP_MS) {
      this.lastSfxAt = now;
      this.world.audio.playSfx('enemyHit');
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.isDefeated = true;
    }
  }

  update(dtMs: number): void {
    if (this.destroyed || this.isDefeated) return;
    const dt = Math.min(100, Math.max(1, dtMs));
    this.timeMs += dt;
    if (this.invulnLeft > 0) this.invulnLeft -= dt;
    if (this.hitGateLeft > 0) this.hitGateLeft -= dt;
    if (!this.entered) {
      this.syncFollowers(dt);
      return;
    }

    // 경고 점멸
    if (this.warnBlinkLeft > 0) {
      this.warnBlinkLeft -= dt;
      this.sprite.setAlpha(Math.floor(this.timeMs / 90) % 2 === 0 ? 0.35 : 1);
      if (this.warnBlinkLeft <= 0) this.sprite.setAlpha(1);
    }

    // 페이즈 판정 (HP 기준 후보 + 최소 유지 시간)
    const ratio = this.getHpRatio();
    let target = 0;
    for (let i = 0; i < this.def.phases.length; i += 1) {
      if (ratio <= this.def.phases[i].hpAbove + 1e-6) target = i;
    }
    this.phaseTime += dt;
    if (target > this.phaseIndex && this.phaseTime >= this.def.phases[this.phaseIndex].duration) {
      this.enterPhase(target);
    }

    // 호버 이동 (돌진/텔레포트 중에는 시퀀스가 위치를 장악)
    if (!this.dashing && !this.teleporting) {
      const t = this.def.movement(
        { x: this.sprite.x, y: this.sprite.y, seed: this.seed, anchorX: this.anchorX, anchorY: this.anchorY },
        this.timeMs,
      );
      const k = Math.min(1, (dt / 1000) * 1.8);
      this.sprite.x += (Math.max(720, Math.min(1130, t.x)) - this.sprite.x) * k;
      this.sprite.y += (Math.max(90, Math.min(630, t.y)) - this.sprite.y) * k;
    }

    // 공격 스케줄
    if (this.scene.scene.isActive()) {
      const phase = this.def.phases[this.phaseIndex];
      for (let i = 0; i < phase.attacks.length; i += 1) {
        const spec = phase.attacks[i];
        const tm = this.timers[i];
        if (!tm) continue;
        tm.elapsed += dt;
        if (tm.elapsed >= spec.interval) {
          tm.elapsed = 0;
          if (spec.telegraph) this.telegraph(spec.telegraph);
          try {
            const fn = ATTACKS[spec.name];
            if (fn) fn(this, this.world, spec.params);
          } catch {
            // 단일 공격 실패가 보스 전체를 멈추지 않게
          }
        }
      }
    }

    this.syncFollowers(dt);
    this.updateClones(dt);
    this.updateParts(dt);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    try {
      this.scene.tweens.killTweensOf(this.sprite);
    } catch {
      // 무시
    }
    try {
      this.world.setDarkness?.(0);
    } catch {
      // 무시
    }
    try {
      this.world.setScrollSpeed(1);
    } catch {
      // 무시
    }
    for (const s of this.segments) {
      try {
        this.scene.tweens.killTweensOf(s);
        s.destroy();
      } catch {
        // 무시
      }
    }
    this.segments.length = 0;
    for (const p of this.parts) {
      try {
        p.img.destroy();
      } catch {
        // 무시
      }
    }
    this.parts.length = 0;
    for (const c of this.clones) {
      try {
        c.img.destroy();
      } catch {
        // 무시
      }
    }
    this.clones.length = 0;
    try {
      this.sprite.destroy();
    } catch {
      // 무시
    }
  }

  // -- BossAttackContext -----------------------------------------------------

  getAimAngle(): number {
    const p = this.world.getPlayerPos();
    return Math.atan2(p.y - this.sprite.y, p.x - this.sprite.x);
  }

  telegraph(ms: number, color = 0xffd75e): void {
    const dur = Math.min(1200, Math.max(120, Math.floor(ms)));
    this.warnBlinkLeft = Math.max(this.warnBlinkLeft, Math.min(600, dur));
    try {
      this.sprite.setTint(color);
      this.scene.time.delayedCall(140, () => {
        try {
          if (!this.destroyed && !this.isDefeated) this.sprite.clearTint();
        } catch {
          // 무시
        }
      });
      const glow = this.scene.add
        .image(this.sprite.x, this.sprite.y, 'fx_glow')
        .setTint(color)
        .setScale(this.baseScale * 2.2)
        .setAlpha(0.5)
        .setDepth(59);
      this.scene.tweens.add({
        targets: glow,
        alpha: 0,
        scale: this.baseScale * 3.2,
        duration: dur,
        ease: 'Cubic.easeOut',
        onUpdate: () => {
          try {
            glow.setPosition(this.sprite.x, this.sprite.y);
          } catch {
            // 무시
          }
        },
        onComplete: () => glow.destroy(),
      });
    } catch {
      // 무시
    }
  }

  startDash(tx: number, ty: number): void {
    if (this.dashing || this.teleporting || this.isDefeated || this.destroyed) return;
    this.dashing = true;
    this.telegraph(550, 0xff2d3f);
    this.scene.time.delayedCall(550, () => {
      try {
        if (this.destroyed || this.isDefeated || !this.scene.scene.isActive()) {
          this.dashing = false;
          return;
        }
        const hx = this.sprite.x;
        const hy = this.sprite.y;
        this.scene.tweens.add({
          targets: this.sprite,
          x: Math.max(420, Math.min(1130, tx)),
          y: Math.max(90, Math.min(630, ty)),
          duration: 320,
          ease: 'Cubic.easeIn',
          onComplete: () => {
            try {
              if (this.destroyed) return;
              this.world.fx.explosion(this.sprite.x, this.sprite.y, 1.1, 0xff6f8f);
              this.world.shake(0.006, 250);
              const fn = ATTACKS.ring;
              if (fn) fn(this, this.world, { count: 12, speed: 145, tint: 0xffb347, tag: 'dash' });
              this.scene.tweens.add({
                targets: this.sprite,
                x: hx,
                y: hy,
                duration: 700,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                  this.dashing = false;
                },
              });
            } catch {
              this.dashing = false;
            }
          },
        });
      } catch {
        this.dashing = false;
      }
    });
  }

  startTeleport(nx: number, ny: number): void {
    if (this.dashing || this.teleporting || this.isDefeated || this.destroyed) return;
    this.teleporting = true;
    this.invulnLeft = Math.max(this.invulnLeft, 700);
    this.world.fx.explosion(this.sprite.x, this.sprite.y, 0.9, 0xa06bff);
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      duration: 220,
      onComplete: () => {
        try {
          if (this.destroyed) return;
          this.sprite.setPosition(Math.max(768, Math.min(1088, nx)), Math.max(120, Math.min(600, ny)));
          this.world.fx.explosion(this.sprite.x, this.sprite.y, 1.0, 0xa06bff);
          this.scene.tweens.add({
            targets: this.sprite,
            alpha: 1,
            duration: 260,
            onComplete: () => {
              this.teleporting = false;
              try {
                const fn = ATTACKS.ring;
                if (fn && !this.isDefeated) fn(this, this.world, { count: 12, speed: 140, tint: 0xa06bff, tag: 'tp' });
              } catch {
                // 무시
              }
            },
          });
        } catch {
          this.teleporting = false;
        }
      },
    });
  }

  spawnClones(): void {
    if (this.isDefeated || this.destroyed) return;
    // 기존 분신 정리 후 2기 소환 (7초 유지, 실제 탄 발사)
    for (const c of this.clones) {
      try {
        c.img.destroy();
      } catch {
        // 무시
      }
    }
    this.clones.length = 0;
    const preset = DIFFICULTY_PRESETS[this.world.getDifficulty()];
    void preset;
    const offs = [
      { dx: -110, dy: -120 },
      { dx: -110, dy: 120 },
    ];
    for (const o of offs) {
      try {
        const img = this.scene.add
          .image(
            Math.max(700, this.sprite.x + o.dx),
            Math.max(90, Math.min(630, this.sprite.y + o.dy)),
            this.def.tex,
          )
          .setScale(this.baseScale * 0.8)
          .setAlpha(0.65)
          .setTint(0x8f9fd6)
          .setDepth(58);
        this.scene.tweens.add({ targets: img, alpha: 0.4, duration: 400, yoyo: true, repeat: -1 });
        this.clones.push({ img, life: 7000, fireT: 900 });
        this.world.fx.explosion(img.x, img.y, 0.8, 0xa06bff);
      } catch {
        // 무시
      }
    }
  }

  // -- 내부 ------------------------------------------------------------------

  private enterPhase(idx: number): void {
    this.phaseIndex = idx;
    this.phaseTime = 0;
    const phase = this.def.phases[idx];
    this.world.clearEnemyBullets();
    this.invulnLeft = Math.max(this.invulnLeft, 1200);
    this.applyPhaseVisual(phase, true);
    this.timers = phase.attacks.map((a) => ({ elapsed: -((a.delay ?? 0) + 400) }));
    this.attackState = {};
    this.world.audio.playSfx('bossWarn');
    this.world.hitStop(120);
  }

  private applyPhaseVisual(phase: { tex?: string; scale?: number; darkness?: number; scrollMult?: number; flashColor?: number }, burst: boolean): void {
    if (phase.tex) {
      try {
        this.sprite.setTexture(phase.tex);
      } catch {
        // 무시
      }
    }
    if (phase.scale !== undefined) {
      this.baseScale = phase.scale;
      this.sprite.setScale(phase.scale);
    }
    if (phase.darkness !== undefined) {
      try {
        this.world.setDarkness?.(phase.darkness);
      } catch {
        // 무시
      }
    }
    if (phase.scrollMult !== undefined) {
      try {
        this.world.setScrollSpeed(phase.scrollMult);
      } catch {
        // 무시
      }
    }
    if (burst) {
      this.world.fx.explosion(this.sprite.x, this.sprite.y, 1.6, phase.flashColor ?? 0xffffff);
      this.world.shake(0.005, 300);
    }
  }

  private buildSegments(): void {
    for (let i = 0; i < 9; i += 1) {
      try {
        const img = this.scene.add
          .image(this.sprite.x - (i + 1) * 34, this.sprite.y, 'midboss_seg')
          .setScale(0.95 - i * 0.04)
          .setDepth(59 - i * 0.1);
        this.segments.push(img);
      } catch {
        // 무시
      }
    }
    this.trail.length = 0;
  }

  /** 마디/위치 추종 오브젝트 동기화 */
  private syncFollowers(dt: number): void {
    if (this.def.id !== 'midboss_centipede' || this.segments.length === 0) return;
    this.trailAcc += dt;
    if (this.trailAcc >= TRAIL_PUSH_MS) {
      this.trailAcc = 0;
      this.trail.unshift({ x: this.sprite.x, y: this.sprite.y });
      if (this.trail.length > 64) this.trail.pop();
    }
    for (let i = 0; i < this.segments.length; i += 1) {
      const h = this.trail[(i + 1) * 4] ?? this.trail[this.trail.length - 1];
      if (!h) continue;
      const seg = this.segments[i];
      seg.setPosition(seg.x + (h.x - seg.x) * 0.5, seg.y + (h.y - seg.y) * 0.5);
      seg.setRotation(seg.rotation + dt * 0.001 * (i % 2 === 0 ? 1 : -1));
    }
  }

  private ensureParts(): void {
    if (this.parts.length > 0) return;
    for (let i = 0; i < 3; i += 1) {
      try {
        const img = this.scene.add
          .image(this.sprite.x, this.sprite.y, 'boss_engine_core')
          .setScale(0.9)
          .setDepth(59);
        this.parts.push({ img, angle: (i / 3) * Math.PI * 2, fireT: 1200 + i * 700 });
      } catch {
        // 무시
      }
    }
  }

  private updateParts(dt: number): void {
    if (this.def.id !== 'boss_engine') return;
    if (this.phaseIndex >= 1) this.ensureParts();
    if (this.parts.length === 0) return;
    const R = 120;
    for (const p of this.parts) {
      p.angle += (dt / 1000) * 1.1;
      const px = this.sprite.x + Math.cos(p.angle) * R;
      const py = this.sprite.y + Math.sin(p.angle) * R * 0.7;
      p.img.setPosition(px, py);
      p.img.setRotation(p.img.rotation + dt * 0.003);
      p.fireT -= dt;
      if (p.fireT <= 0 && !this.isDefeated && this.world.isPlayerAlive()) {
        p.fireT = 2400;
        const pl = this.world.getPlayerPos();
        const a = Math.atan2(pl.y - py, pl.x - px);
        const sp = 190 * DIFFICULTY_PRESETS[this.world.getDifficulty()].bulletSpeed;
        for (let k = -1; k <= 1; k += 1) {
          this.world.spawnEnemyBullet(px, py, a + k * 0.18, sp, 'eb_small', 0xffd75e);
        }
      }
    }
  }

  private updateClones(dt: number): void {
    if (this.clones.length === 0) return;
    const sp = 250 * DIFFICULTY_PRESETS[this.world.getDifficulty()].bulletSpeed;
    for (let i = this.clones.length - 1; i >= 0; i -= 1) {
      const c = this.clones[i];
      c.life -= dt;
      if (c.life <= 0) {
        try {
          this.scene.tweens.killTweensOf(c.img);
          this.world.fx.explosion(c.img.x, c.img.y, 0.7, 0xa06bff);
          c.img.destroy();
        } catch {
          // 무시
        }
        this.clones.splice(i, 1);
        continue;
      }
      c.fireT -= dt;
      if (c.fireT <= 0 && !this.isDefeated && this.world.isPlayerAlive()) {
        c.fireT = 1600;
        const pl = this.world.getPlayerPos();
        const a = Math.atan2(pl.y - c.img.y, pl.x - c.img.x);
        for (let k = -1; k <= 1; k += 1) {
          this.world.spawnEnemyBullet(c.img.x, c.img.y, a + k * 0.12, sp, 'eb_small', 0xd8c8ff);
        }
      }
    }
  }
}

/** GameScene.startBoss 계약 팩토리 (미구현 id면 throw → GameScene 폴백) */
export function createBoss(scene: Phaser.Scene, world: IGameWorld, bossId: string): Boss {
  return new Boss(scene, world, bossId);
}
