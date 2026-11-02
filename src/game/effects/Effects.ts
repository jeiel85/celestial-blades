import Phaser from 'phaser';
import { CUTIN_MS, HEIGHT, LOGO_FONT, UI_FONT, WIDTH } from '../GameConfig';

/**
 * 폭발/플래시/쉐이크/잔상/탄소거/플로팅 텍스트/필살기 컷인 헬퍼.
 * GameScene이 1회 생성해 IGameWorld.fx로 노출한다.
 */
export class Effects {
  constructor(private readonly scene: Phaser.Scene) {}

  /**
   * 필살기 컷인. 화면이 어두워지고 캐릭터 일러스트 띠가 사선으로 들어와 잠시 머문 뒤
   * 섬광과 함께 빠져나가며 onStrike를 부른다(그때 실제 공격이 나간다). 총 CUTIN_MS.
   * 트윈만 쓰므로 게임 시간 슬로모션과 무관하게 실제 시간으로 재생되고, 일시정지하면 함께 멈춘다.
   */
  cutIn(texture: string, color: number, title: string, subtitle: string, onStrike: () => void): void {
    const s = this.scene;
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const IN_MS = 200;
    const OUT_MS = 170;
    const HOLD_MS = CUTIN_MS - IN_MS - OUT_MS;

    const dim = s.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05040f, 0).setOrigin(0).setDepth(700);

    // 띠: 일러스트(1280x360)의 위아래를 조금 잘라 화면보다 넓게 깔고, 살짝 기울인다.
    const band = s.add.container(cx + WIDTH * 1.3, cy).setDepth(701).setRotation(-0.09);
    const art = s.add.image(0, 0, texture).setCrop(0, 24, 1280, 312).setScale(1.2);
    const edgeTop = s.add.image(0, -190, 'fx_warn_line').setDisplaySize(WIDTH * 1.6, 14).setTint(color);
    const edgeBottom = s.add.image(0, 190, 'fx_warn_line').setDisplaySize(WIDTH * 1.6, 14).setTint(color);
    band.add([art, edgeTop, edgeBottom]);

    // 집중선: 빛줄기 그림을 가늘게 늘려 띠 위를 빠르게 훑는다.
    for (let i = 0; i < 10; i += 1) {
      const line = s.add
        .image(Phaser.Math.Between(-700, 700), Phaser.Math.Between(-170, 170), 'fx_warn_line')
        .setDisplaySize(Phaser.Math.Between(220, 520), Phaser.Math.Between(3, 7))
        .setAlpha(0.55);
      band.add(line);
      s.tweens.add({ targets: line, x: line.x - 1400, duration: Phaser.Math.Between(180, 300), repeat: -1 });
    }

    const glow = `#${color.toString(16).padStart(6, '0')}`;
    const name = s.add
      .text(250, 92, title, {
        fontFamily: LOGO_FONT,
        fontSize: '84px',
        color: '#fff4c2',
        stroke: '#1a0c02',
        strokeThickness: 10,
        shadow: { offsetX: 0, offsetY: 0, color: glow, blur: 24, fill: true, stroke: true },
        padding: { x: 20, y: 14 },
      })
      .setOrigin(0.5)
      .setLetterSpacing(8)
      .setAlpha(0);
    const sub = s.add
      .text(250, 150, subtitle, { fontFamily: UI_FONT, fontSize: '20px', color: '#ffffff', stroke: '#000000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setLetterSpacing(4)
      .setAlpha(0);
    band.add([name, sub]);

    s.tweens.add({ targets: dim, fillAlpha: 0.6, duration: IN_MS });
    s.tweens.add({ targets: band, x: cx, duration: IN_MS, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: [name, sub], alpha: 1, x: '-=60', duration: 260, delay: IN_MS * 0.6, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: band, x: cx - 50, duration: HOLD_MS, delay: IN_MS });
    s.tweens.add({
      targets: band,
      x: cx - WIDTH * 1.4,
      scaleY: 0.25,
      duration: OUT_MS,
      delay: IN_MS + HOLD_MS,
      ease: 'Cubic.easeIn',
      onStart: () => {
        // 빠져나가는 순간 섬광 → 공격
        const flash = s.add.image(cx, cy, 'fx_glow').setScale(26).setTint(color).setAlpha(0.9).setDepth(702);
        s.tweens.add({ targets: flash, alpha: 0, duration: 320, onComplete: () => flash.destroy() });
        s.tweens.add({ targets: dim, fillAlpha: 0, duration: 260 });
        if (s.scene.isActive()) onStrike();
      },
      onComplete: () => {
        band.destroy(true);
        dim.destroy();
      },
    });
  }

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
          fontFamily: UI_FONT,
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
