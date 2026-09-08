import Phaser from 'phaser';

/**
 * 폭발/플래시/히트스톱/쉐이크/잔상/탄소거/플로팅 텍스트 헬퍼.
 * GameScene이 1회 생성해 IGameWorld.fx로 노출한다.
 */
export class Effects {
  constructor(private readonly scene: Phaser.Scene) {}

  /** 폭발: 파티클 + 플래시 + 링. 스케일로 크기 조절. */
  explosion(x: number, y: number, scale = 1, color = 0xffb347): void {
    const s = this.scene;
    try {
      const flash = s.add.image(x, y, 'fx_glow').setScale(0.6 * scale).setTint(color).setDepth(500).setAlpha(0.95);
      s.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.6 * scale,
        duration: 220,
        ease: 'Cubic.easeOut',
        onComplete: () => flash.destroy(),
      });
    } catch {
      // 무시
    }
    try {
      const ring = s.add.image(x, y, 'fx_ring').setScale(0.3 * scale).setTint(color).setDepth(501).setAlpha(0.9);
      s.tweens.add({
        targets: ring,
        alpha: 0,
        scale: 1.8 * scale,
        duration: 350,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    } catch {
      // 무시
    }
    try {
      const emitter = s.add.particles(0, 0, 'fx_spark', {
        speed: { min: 60 * scale, max: 320 * scale },
        angle: { min: 0, max: 360 },
        lifespan: { min: 200, max: 550 },
        scale: { start: 1.2 * scale, end: 0 },
        quantity: 0,
        emitting: false,
      });
      emitter.setDepth(502);
      emitter.explode(14 + Math.floor(10 * scale), x, y);
      s.time.delayedCall(800, () => emitter.destroy());
    } catch {
      // 무시
    }
    try {
      const smoke = s.add.particles(0, 0, 'fx_smoke', {
        speed: { min: 10, max: 70 * scale },
        lifespan: { min: 300, max: 700 },
        scale: { start: 0.8 * scale, end: 0 },
        alpha: { start: 0.5, end: 0 },
        quantity: 0,
        emitting: false,
      });
      smoke.setDepth(499);
      smoke.explode(6, x, y);
      s.time.delayedCall(1000, () => smoke.destroy());
    } catch {
      // 무시
    }
  }

  /** 피격 플래시: 흰색으로 번쩍인 뒤 원래 틴트로 복귀 */
  hitFlash(sprite: Phaser.GameObjects.Sprite): void {
    try {
      sprite.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => {
        try {
          if (sprite.active) sprite.clearTint();
        } catch {
          // 무시
        }
      });
    } catch {
      // 무시
    }
  }

  /** 적탄 소거 poof: 작은 빛 + 별 파편 */
  bulletPoof(x: number, y: number): void {
    const s = this.scene;
    try {
      const star = s.add.image(x, y, 'fx_star').setScale(0.8).setDepth(495).setAlpha(0.95);
      s.tweens.add({
        targets: star,
        alpha: 0,
        scale: 0.1,
        angle: 120,
        duration: 200,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy(),
      });
    } catch {
      // 무시
    }
  }

  /** 히트스톱: 물리/타이머를 잠시 멈췄다가 복구 */
  hitStop(ms: number): void {
    const s = this.scene;
    const dur = Math.min(500, Math.max(16, Math.floor(ms)));
    try {
      const world = s.physics.world;
      world.timeScale = 0.05;
      s.time.timeScale = 0.05;
      s.time.delayedCall(dur, () => {
        try {
          world.timeScale = 1;
          s.time.timeScale = 1;
        } catch {
          // 무시
        }
      });
    } catch {
      // 무시
    }
  }

  /** 화면 흔들림 (settings.shake=false면 GameScene에서 호출 자체를 막는다) */
  shake(intensity: number, dur: number): void {
    try {
      this.scene.cameras.main.shake(Math.min(600, Math.max(30, dur)), Math.min(0.02, Math.max(0.0005, intensity)));
    } catch {
      // 무시
    }
  }

  /** 잔상: 스프라이트를 그 자리/각도로 복사해 페이드아웃 */
  afterimage(sprite: Phaser.GameObjects.Sprite, tint = 0x9fd8ff, lifeMs = 260): void {
    const s = this.scene;
    try {
      const ghost = s.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name).setDepth(sprite.depth - 1);
      ghost.setRotation(sprite.rotation);
      ghost.setScale(sprite.scaleX, sprite.scaleY);
      ghost.setAlpha(0.55);
      ghost.setTint(tint);
      s.tweens.add({
        targets: ghost,
        alpha: 0,
        duration: lifeMs,
        ease: 'Cubic.easeOut',
        onComplete: () => ghost.destroy(),
      });
    } catch {
      // 무시
    }
  }

  /** 떠오르는 데미지/콤보 텍스트 */
  floatingText(x: number, y: number, text: string, color = '#ffe9a0', fontSize = 18): void {
    const s = this.scene;
    try {
      const t = s.add
        .text(x, y, text, {
          fontSize: `${fontSize}px`,
          color,
          fontStyle: 'bold',
          stroke: '#101020',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(600);
      s.tweens.add({
        targets: t,
        y: y - 46,
        alpha: 0,
        duration: 700,
        ease: 'Cubic.easeOut',
        onComplete: () => t.destroy(),
      });
    } catch {
      // 무시
    }
  }
}
