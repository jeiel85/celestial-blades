import Phaser from 'phaser';

/**
 * BootScene: 전체 텍스처를 런타임 절차 생성한 뒤 'Title'로 이동한다.
 * 외부 에셋 없음. 모든 텍스처는 Graphics.generateTexture 또는 Canvas 기반.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(640, 360, 'LOADING...', {
        fontSize: '28px',
        color: '#8fd3ff',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    this.makePlayerTextures();
    this.makeShotTextures();
    this.makeEnemyBulletTextures();
    this.makeEnemyTextures();
    this.makeBossTextures();
    this.makeItemTextures();
    this.makeFxTextures();

    this.scene.start('Title');
  }

  // -- 헬퍼 ------------------------------------------------------------------
  private genTex(key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    const g = this.add.graphics();
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  private canvasTex(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): void {
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, size, size);
    if (!tex) return;
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, size, size);
    draw(ctx, size);
    tex.refresh();
  }

  // -- 플레이어 (오른쪽 향함) ----------------------------------------------------
  private makePlayerTextures(): void {
    // 세 조종사는 모두 오른쪽을 향한 비행 자세. 얼굴/복장/무기를 분리해
    // 작은 화면에서도 '캐릭터'로 읽히도록 실루엣을 먼저 만들었다.
    // 윤: 청색 갑주 검사 + 긴 검 + 뒤로 흐르는 망토
    this.genTex('player_yun', 88, 72, (g) => {
      g.fillStyle(0x081321, 1);
      g.fillTriangle(6, 44, 26, 25, 18, 68);
      g.fillTriangle(8, 52, 35, 42, 18, 71);
      g.fillStyle(0x1a4d8f, 1);
      g.fillTriangle(10, 42, 31, 22, 24, 63);
      g.fillTriangle(12, 52, 36, 43, 22, 68);
      // 어깨와 몸통
      g.fillStyle(0x10233d, 1);
      g.fillEllipse(39, 43, 38, 38);
      g.fillStyle(0x2d7fd6, 1);
      g.fillRoundedRect(28, 33, 30, 28, 10);
      g.fillStyle(0x4db2ff, 1);
      g.fillTriangle(33, 35, 57, 41, 38, 57);
      // 얼굴과 청옥 바이저
      g.fillStyle(0x0d1c33, 1);
      g.fillCircle(48, 27, 13);
      g.fillStyle(0x9fe0ff, 1);
      g.fillRoundedRect(45, 22, 18, 9, 4);
      g.fillStyle(0xffffff, 1);
      g.fillRect(48, 23, 5, 3);
      // 손에 든 검
      g.fillStyle(0xd8f2ff, 1);
      g.fillTriangle(58, 29, 87, 36, 58, 43);
      g.lineStyle(2, 0x1a4d8f, 1);
      g.strokeTriangle(58, 29, 87, 36, 58, 43);
      g.fillStyle(0xffd75e, 1);
      g.fillRect(55, 34, 8, 4);
      g.lineStyle(2, 0x0d1c33, 1);
      g.strokeRoundedRect(28, 33, 30, 28, 10);
    });

    // 려화: 붉은 법의 술사 + 펼친 부채 + 불꽃 장식
    this.genTex('player_ryeohwa', 88, 72, (g) => {
      g.fillStyle(0x3d1408, 1);
      g.fillTriangle(5, 22, 29, 37, 8, 58);
      g.fillTriangle(10, 38, 34, 53, 5, 67);
      g.fillStyle(0xc33d1e, 1);
      g.fillTriangle(12, 24, 33, 38, 12, 55);
      g.fillTriangle(15, 41, 34, 52, 10, 63);
      // 넓은 소매와 몸통
      g.fillStyle(0x7a1e0e, 1);
      g.fillEllipse(39, 44, 42, 40);
      g.fillStyle(0xe63b2e, 1);
      g.fillRoundedRect(27, 34, 28, 28, 9);
      g.fillStyle(0xff7b2d, 1);
      g.fillTriangle(32, 38, 57, 45, 34, 58);
      g.fillStyle(0xffd75e, 1);
      g.fillTriangle(34, 52, 48, 57, 38, 62);
      // 옆얼굴, 붉은 머리장식
      g.fillStyle(0x5a160e, 1);
      g.fillCircle(48, 26, 13);
      g.fillStyle(0xffb347, 1);
      g.fillCircle(52, 24, 8);
      g.fillStyle(0xfff2c0, 1);
      g.fillRoundedRect(48, 23, 15, 8, 4);
      g.fillStyle(0xffd75e, 1);
      g.fillCircle(55, 15, 4);
      // 부채살
      g.fillStyle(0xffb347, 1);
      g.fillTriangle(58, 9, 86, 36, 58, 49);
      g.lineStyle(2, 0x7a1e0e, 1);
      for (let i = 0; i <= 4; i += 1) g.lineBetween(58, 36, 84, 10 + i * 13);
      g.strokeTriangle(58, 9, 86, 36, 58, 49);
      g.fillStyle(0xfff2c0, 1);
      g.fillCircle(58, 36, 4);
      g.lineStyle(2, 0x3d1408, 1);
      g.strokeRoundedRect(27, 34, 28, 28, 9);
    });

    // 무영: 후드 암살자 + 보랏빛 스카프 + 쌍단검
    this.genTex('player_mooyoung', 88, 72, (g) => {
      g.fillStyle(0x160f2e, 1);
      g.fillTriangle(8, 18, 32, 36, 0, 42);
      g.fillTriangle(10, 48, 34, 42, 2, 68);
      g.fillStyle(0x3d2a6e, 1);
      g.fillTriangle(12, 20, 35, 37, 6, 40);
      g.fillTriangle(14, 50, 35, 43, 7, 63);
      // 날씬한 몸통과 후드
      g.fillStyle(0x2a1e5e, 1);
      g.fillEllipse(40, 44, 34, 40);
      g.fillStyle(0x5b3fa8, 1);
      g.fillTriangle(27, 35, 59, 35, 44, 65);
      g.fillStyle(0xa06bff, 1);
      g.fillTriangle(34, 38, 56, 41, 44, 57);
      g.fillStyle(0x160f2e, 1);
      g.fillTriangle(29, 29, 49, 10, 66, 31);
      g.fillStyle(0xa06bff, 1);
      g.fillTriangle(38, 26, 49, 15, 59, 27);
      g.fillStyle(0xd8c8ff, 1);
      g.fillRoundedRect(45, 23, 16, 7, 3);
      g.fillStyle(0xffffff, 1);
      g.fillRect(49, 24, 4, 2);
      // 두 개의 단검
      g.fillStyle(0xe8e8f2, 1);
      g.fillTriangle(57, 32, 87, 38, 57, 42);
      g.fillTriangle(56, 45, 83, 58, 56, 51);
      g.lineStyle(2, 0x2a1e5e, 1);
      g.strokeTriangle(57, 32, 87, 38, 57, 42);
      g.strokeTriangle(56, 45, 83, 58, 56, 51);
      g.fillStyle(0xffd75e, 1);
      g.fillCircle(57, 38, 3);
      g.fillCircle(56, 48, 3);
      g.lineStyle(2, 0x160f2e, 1);
      g.strokeTriangle(29, 29, 49, 10, 66, 31);
    });

    // 히트 코어 (10px 빛점)
    this.genTex('player_core', 12, 12, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 5);
      g.fillStyle(0xff4d5e, 1);
      g.fillCircle(6, 6, 3);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 1.2);
    });
  }

  // -- 플레이어탄 ---------------------------------------------------------------
  private makeShotTextures(): void {
    // 검기 (28x10 파랑)
    this.genTex('shot_ki', 28, 10, (g) => {
      g.fillStyle(0x1a4d8f, 1);
      g.fillEllipse(14, 5, 28, 10);
      g.fillStyle(0x4db2ff, 1);
      g.fillEllipse(15, 5, 22, 7);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(18, 1, 28, 5, 18, 9);
    });
    // 초승달 (110x44)
    this.genTex('shot_crescent', 110, 44, (g) => {
      g.fillStyle(0x9fe0ff, 0.9);
      g.fillEllipse(55, 22, 100, 40);
      g.fillStyle(0x4db2ff, 1);
      g.fillEllipse(58, 22, 88, 32);
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(62, 22, 60, 18);
      // 초승달 결 (어두운 절단면)
      g.fillStyle(0x1a4d8f, 1);
      g.fillEllipse(38, 22, 44, 30);
      g.fillStyle(0x0d1c33, 1);
      g.fillEllipse(34, 22, 30, 24);
      g.lineStyle(2, 0xd8f2ff, 1);
      g.strokeEllipse(58, 22, 88, 32);
    });
    // 화염탄 (26x26)
    this.genTex('shot_flame', 26, 26, (g) => {
      g.fillStyle(0x7a1e0e, 1);
      g.fillCircle(13, 13, 12);
      g.fillStyle(0xe63b2e, 1);
      g.fillCircle(14, 13, 9);
      g.fillStyle(0xff7b2d, 1);
      g.fillCircle(15, 13, 6);
      g.fillStyle(0xfff2c0, 1);
      g.fillCircle(16, 13, 3);
      g.fillStyle(0xffd75e, 1);
      g.fillTriangle(20, 6, 26, 13, 20, 20);
    });
    // 불꽃정령 (18x18)
    this.genTex('shot_seeker', 18, 18, (g) => {
      g.fillStyle(0xffb347, 1);
      g.fillTriangle(9, 0, 14, 7, 9, 9);
      g.fillTriangle(9, 18, 14, 11, 9, 9);
      g.fillStyle(0xff7b2d, 1);
      g.fillCircle(8, 9, 7);
      g.fillStyle(0xfff2c0, 1);
      g.fillCircle(9, 9, 3.5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(9, 9, 1.5);
    });
    // 수리검 (26x8)
    this.genTex('shot_kunai', 26, 8, (g) => {
      g.fillStyle(0x2a1e5e, 1);
      g.fillEllipse(13, 4, 26, 8);
      g.fillStyle(0xc9b8ff, 1);
      g.fillTriangle(10, 1, 26, 4, 10, 7);
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(16, 2.5, 26, 4, 16, 5.5);
      g.fillStyle(0xa06bff, 1);
      g.fillCircle(6, 4, 3);
      g.fillStyle(0x160f2e, 1);
      g.fillCircle(6, 4, 1.2);
    });
  }

  // -- 적탄 (흰색 베이스, 런타임 setTint) -------------------------------------------
  private makeEnemyBulletTextures(): void {
    this.genTex('eb_small', 12, 12, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 5);
      g.fillStyle(0xe8ecf4, 1);
      g.fillCircle(6, 6, 3);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 1.4);
    });
    this.genTex('eb_mid', 18, 18, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(9, 9, 8);
      g.lineStyle(2, 0x9aa4b8, 1);
      g.strokeCircle(9, 9, 7);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(9, 9, 3.5);
    });
    this.genTex('eb_big', 26, 26, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(13, 13, 12);
      g.lineStyle(2, 0x9aa4b8, 1);
      g.strokeCircle(13, 13, 10);
      g.fillStyle(0xdfe6f2, 1);
      g.fillCircle(13, 13, 6);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(13, 13, 3);
    });
    this.genTex('eb_shard', 20, 10, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(1, 1, 19, 5, 1, 9);
      g.fillStyle(0xdfe6f2, 1);
      g.fillTriangle(4, 3, 15, 5, 4, 7);
    });
  }

  // -- 적 ------------------------------------------------------------------
  private makeEnemyTextures(): void {
    // 소형 비행 요괴 (40x36)
    this.genTex('enemy_small', 40, 36, (g) => {
      g.fillStyle(0x2a1420, 1);
      g.fillEllipse(20, 18, 38, 34);
      g.fillStyle(0x8f3d5e, 1);
      g.fillEllipse(20, 18, 30, 26);
      g.fillStyle(0xd66b8f, 1);
      g.fillEllipse(20, 15, 20, 15);
      // 눈
      g.fillStyle(0xffe066, 1);
      g.fillCircle(14, 16, 4);
      g.fillCircle(26, 16, 4);
      g.fillStyle(0x101020, 1);
      g.fillCircle(14, 16, 1.8);
      g.fillCircle(26, 16, 1.8);
      // 뿔
      g.fillStyle(0x3d2a3d, 1);
      g.fillTriangle(8, 8, 13, 0, 15, 9);
      g.fillTriangle(32, 8, 27, 0, 25, 9);
      // 기계 턱
      g.fillStyle(0x5e5e6e, 1);
      g.fillRect(14, 26, 12, 5);
      g.lineStyle(1, 0x101020, 1);
      g.strokeRect(14, 26, 12, 5);
    });
    // 박쥐형 (44x32)
    this.genTex('enemy_bat', 44, 32, (g) => {
      g.fillStyle(0x1e1030, 1);
      g.fillTriangle(22, 16, 0, 2, 4, 26);
      g.fillTriangle(22, 16, 44, 2, 40, 26);
      g.fillStyle(0x5b3fa8, 1);
      g.fillTriangle(22, 16, 4, 6, 7, 24);
      g.fillTriangle(22, 16, 40, 6, 37, 24);
      g.fillStyle(0x3d2a6e, 1);
      g.fillEllipse(22, 17, 18, 20);
      g.fillStyle(0xa06bff, 1);
      g.fillEllipse(22, 15, 12, 13);
      g.fillStyle(0xff4d5e, 1);
      g.fillCircle(18, 14, 2.5);
      g.fillCircle(26, 14, 2.5);
    });
    // 돌진형 (48x40)
    this.genTex('enemy_rusher', 48, 40, (g) => {
      g.fillStyle(0x2e1a0a, 1);
      g.fillTriangle(4, 20, 34, 2, 34, 38);
      g.fillStyle(0xc36b1e, 1);
      g.fillTriangle(6, 20, 32, 6, 32, 34);
      g.fillStyle(0xffb347, 1);
      g.fillTriangle(10, 20, 30, 10, 30, 30);
      // 추진기
      g.fillStyle(0x5e5e6e, 1);
      g.fillRect(32, 8, 12, 8);
      g.fillRect(32, 24, 12, 8);
      g.fillStyle(0x8fd3ff, 1);
      g.fillRect(42, 10, 4, 4);
      g.fillRect(42, 26, 4, 4);
      g.lineStyle(2, 0x1e1005, 1);
      g.strokeTriangle(6, 20, 32, 6, 32, 34);
    });
    // 포대형 (56x56)
    this.genTex('enemy_turret', 56, 56, (g) => {
      g.fillStyle(0x1a1a24, 1);
      g.fillCircle(28, 28, 26);
      g.fillStyle(0x4d4d5e, 1);
      g.fillCircle(28, 28, 21);
      g.lineStyle(3, 0x2a2a3a, 1);
      g.strokeCircle(28, 28, 21);
      // 포신 4문
      g.fillStyle(0x33333f, 1);
      g.fillRect(2, 24, 16, 8);
      g.fillRect(38, 24, 16, 8);
      g.fillRect(24, 2, 8, 16);
      g.fillRect(24, 38, 8, 16);
      // 코어
      g.fillStyle(0xff4d5e, 1);
      g.fillCircle(28, 28, 10);
      g.fillStyle(0xffb3ba, 1);
      g.fillCircle(28, 28, 5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(28, 28, 2);
      // 리벳
      g.fillStyle(0x8f8f9f, 1);
      g.fillCircle(12, 12, 2.5);
      g.fillCircle(44, 12, 2.5);
      g.fillCircle(12, 44, 2.5);
      g.fillCircle(44, 44, 2.5);
    });
    // 방패형 (52x56, 정면 방패)
    this.genTex('enemy_shield', 52, 56, (g) => {
      // 본체
      g.fillStyle(0x24303d, 1);
      g.fillEllipse(32, 28, 32, 44);
      g.fillStyle(0x5e7a8f, 1);
      g.fillEllipse(32, 28, 24, 36);
      g.fillStyle(0xff5f5f, 1);
      g.fillCircle(32, 28, 6);
      // 정면 방패 (좌측)
      g.fillStyle(0x1a2530, 1);
      g.fillRoundedRect(0, 4, 20, 48, 5);
      g.fillStyle(0x8fd3ff, 1);
      g.fillRoundedRect(2, 6, 16, 44, 4);
      g.fillStyle(0x3d6e8f, 1);
      g.fillRoundedRect(4, 10, 6, 36, 2);
      g.fillStyle(0xffffff, 0.8);
      g.fillRect(3, 8, 3, 40);
      // 눈
      g.fillStyle(0xffe066, 1);
      g.fillCircle(32, 18, 3);
    });
    // 소환형 (60x60)
    this.genTex('enemy_spawner', 60, 60, (g) => {
      g.fillStyle(0x0f2418, 1);
      g.fillCircle(30, 30, 28);
      g.fillStyle(0x2e6e4d, 1);
      g.fillCircle(30, 30, 23);
      g.lineStyle(3, 0x123524, 1);
      g.strokeCircle(30, 30, 23);
      // 소환 구멍 4개
      g.fillStyle(0x0a1a10, 1);
      g.fillCircle(18, 18, 7);
      g.fillCircle(42, 18, 7);
      g.fillCircle(18, 42, 7);
      g.fillCircle(42, 42, 7);
      g.fillStyle(0x53e0b0, 1);
      g.fillCircle(18, 18, 3);
      g.fillCircle(42, 18, 3);
      g.fillCircle(18, 42, 3);
      g.fillCircle(42, 42, 3);
      // 중앙 눈
      g.fillStyle(0xd0ffe8, 1);
      g.fillCircle(30, 30, 9);
      g.fillStyle(0x0a1a10, 1);
      g.fillCircle(30, 30, 4);
    });
    // 엘리트 (84x72)
    this.genTex('enemy_elite', 84, 72, (g) => {
      g.fillStyle(0x241226, 1);
      g.fillEllipse(42, 36, 82, 70);
      // 어깨 갑주
      g.fillStyle(0x5e2a4d, 1);
      g.fillEllipse(20, 22, 30, 24);
      g.fillEllipse(64, 22, 30, 24);
      g.fillStyle(0x8f3d5e, 1);
      g.fillEllipse(42, 38, 52, 44);
      g.fillStyle(0xd66b8f, 1);
      g.fillEllipse(42, 34, 36, 28);
      // 가슴 코어
      g.fillStyle(0x3d1020, 1);
      g.fillCircle(42, 40, 12);
      g.fillStyle(0xff4d5e, 1);
      g.fillCircle(42, 40, 8);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(42, 40, 3);
      // 뿔 + 눈
      g.fillStyle(0xd8c8e8, 1);
      g.fillTriangle(28, 14, 34, 0, 38, 14);
      g.fillTriangle(56, 14, 50, 0, 46, 14);
      g.fillStyle(0xffe066, 1);
      g.fillCircle(33, 26, 4);
      g.fillCircle(51, 26, 4);
      g.fillStyle(0x101020, 1);
      g.fillCircle(33, 26, 1.8);
      g.fillCircle(51, 26, 1.8);
      g.lineStyle(2, 0x12060f, 1);
      g.strokeEllipse(42, 38, 52, 44);
    });
  }

  // -- 중간보스/보스 --------------------------------------------------------------
  private makeBossTextures(): void {
    // 거대 가오리 (220x160)
    this.genTex('midboss_ray', 220, 160, (g) => {
      g.fillStyle(0x0f2a3d, 1);
      g.fillTriangle(110, 10, 0, 150, 60, 150);
      g.fillTriangle(110, 10, 220, 150, 160, 150);
      g.fillStyle(0x2c5f8a, 1);
      g.fillTriangle(110, 18, 14, 144, 66, 144);
      g.fillTriangle(110, 18, 206, 144, 154, 144);
      g.fillStyle(0x4d9fd6, 1);
      g.fillEllipse(110, 70, 90, 90);
      g.fillStyle(0x9fd8f2, 1);
      g.fillEllipse(110, 62, 60, 55);
      // 반점
      g.fillStyle(0x12354d, 1);
      g.fillCircle(80, 50, 7);
      g.fillCircle(140, 50, 7);
      g.fillCircle(95, 85, 7);
      g.fillCircle(125, 85, 7);
      g.fillCircle(110, 105, 7);
      // 눈 + 꼬리
      g.fillStyle(0xffe066, 1);
      g.fillCircle(92, 66, 7);
      g.fillCircle(128, 66, 7);
      g.fillStyle(0x101020, 1);
      g.fillCircle(92, 66, 3);
      g.fillCircle(128, 66, 3);
      g.lineStyle(5, 0x2c5f8a, 1);
      g.lineBetween(110, 115, 110, 158);
      g.fillStyle(0x9fd8f2, 1);
      g.fillTriangle(104, 150, 116, 150, 110, 160);
    });
    // 지네 마디 (56x56)
    this.genTex('midboss_seg', 56, 56, (g) => {
      g.fillStyle(0x241408, 1);
      g.fillCircle(28, 28, 27);
      g.fillStyle(0x8f5e2a, 1);
      g.fillCircle(28, 28, 22);
      g.fillStyle(0xc78f3d, 1);
      g.fillCircle(28, 28, 15);
      // 다리
      g.lineStyle(4, 0x5e3a1a, 1);
      g.lineBetween(4, 12, 12, 12);
      g.lineBetween(44, 12, 52, 12);
      g.lineBetween(4, 28, 12, 28);
      g.lineBetween(44, 28, 52, 28);
      g.lineBetween(4, 44, 12, 44);
      g.lineBetween(44, 44, 52, 44);
      g.fillStyle(0xff2d3f, 1);
      g.fillCircle(28, 28, 7);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(28, 28, 3);
      g.lineStyle(2, 0x1e1005, 1);
      g.strokeCircle(28, 28, 22);
    });
    // 타락 천명사 (72x84)
    this.genTex('midboss_dark', 72, 84, (g) => {
      g.fillStyle(0x0a0a14, 1);
      g.fillEllipse(36, 42, 68, 80);
      g.fillStyle(0x2e2a4d, 1);
      g.fillEllipse(36, 42, 54, 66);
      g.fillStyle(0x5e4d8f, 1);
      g.fillEllipse(36, 38, 38, 44);
      // 갓 (삿갓)
      g.fillStyle(0x1a1a2e, 1);
      g.fillTriangle(8, 30, 36, 2, 64, 30);
      g.fillStyle(0x3d3d5e, 1);
      g.fillTriangle(16, 28, 36, 8, 56, 28);
      // 붉은 눈
      g.fillStyle(0xff2d3f, 1);
      g.fillCircle(28, 44, 4);
      g.fillCircle(44, 44, 4);
      // 검
      g.fillStyle(0x8f2d5e, 1);
      g.fillTriangle(48, 40, 72, 52, 48, 64);
      g.fillStyle(0x3d1020, 1);
      g.fillCircle(36, 60, 8);
      g.fillStyle(0xff4d8e, 1);
      g.fillCircle(36, 60, 3.5);
    });
    // 철갑귀 장군 (260x200)
    this.genTex('boss_iron', 260, 200, (g) => {
      g.fillStyle(0x14141e, 1);
      g.fillEllipse(130, 100, 256, 196);
      // 어깨 갑주
      g.fillStyle(0x3d3d4d, 1);
      g.fillEllipse(60, 60, 90, 70);
      g.fillEllipse(200, 60, 90, 70);
      g.fillStyle(0x5e5e6e, 1);
      g.fillEllipse(60, 55, 66, 50);
      g.fillEllipse(200, 55, 66, 50);
      // 흉갑
      g.fillStyle(0x4d4d5e, 1);
      g.fillEllipse(130, 105, 150, 130);
      g.fillStyle(0x6e6e7e, 1);
      g.fillEllipse(130, 95, 110, 90);
      // 금장식
      g.lineStyle(4, 0xd8a83d, 1);
      g.strokeEllipse(130, 95, 110, 90);
      g.fillStyle(0xd8a83d, 1);
      g.fillCircle(130, 60, 10);
      // 투구 뿔
      g.fillStyle(0xd8c89f, 1);
      g.fillTriangle(90, 40, 70, 0, 105, 30);
      g.fillTriangle(170, 40, 190, 0, 155, 30);
      // 눈
      g.fillStyle(0xff2d3f, 1);
      g.fillEllipse(110, 80, 16, 10);
      g.fillEllipse(150, 80, 16, 10);
      // 입 (쇠빗장)
      g.fillStyle(0x24242e, 1);
      g.fillRect(105, 120, 50, 22);
      g.lineStyle(2, 0x8f8f9f, 1);
      g.lineBetween(115, 120, 115, 142);
      g.lineBetween(127, 120, 127, 142);
      g.lineBetween(139, 120, 139, 142);
      g.lineBetween(151, 120, 151, 142);
    });
    // 홍련기관왕 (320x240)
    this.genTex('boss_engine', 320, 240, (g) => {
      g.fillStyle(0x1e0f0a, 1);
      g.fillRoundedRect(4, 20, 312, 200, 24);
      g.fillStyle(0x5e2a1a, 1);
      g.fillRoundedRect(12, 28, 296, 184, 20);
      g.fillStyle(0x8f4d2a, 1);
      g.fillRoundedRect(24, 40, 272, 160, 16);
      // 톱니 장식
      g.fillStyle(0x3d1e12, 1);
      for (let i = 0; i < 6; i += 1) {
        g.fillCircle(40 + i * 48, 28, 12);
        g.fillCircle(40 + i * 48, 212, 12);
      }
      g.fillStyle(0xc78f3d, 1);
      for (let i = 0; i < 6; i += 1) {
        g.fillCircle(40 + i * 48, 28, 5);
        g.fillCircle(40 + i * 48, 212, 5);
      }
      // 노심 해치
      g.fillStyle(0x2a120a, 1);
      g.fillCircle(160, 120, 52);
      g.fillStyle(0xe63b2e, 1);
      g.fillCircle(160, 120, 40);
      g.fillStyle(0xff7b2d, 1);
      g.fillCircle(160, 120, 26);
      g.fillStyle(0xfff2c0, 1);
      g.fillCircle(160, 120, 12);
      // 미사일 포드
      g.fillStyle(0x33333f, 1);
      g.fillRect(36, 80, 40, 80);
      g.fillRect(244, 80, 40, 80);
      g.fillStyle(0x101018, 1);
      g.fillCircle(56, 96, 8);
      g.fillCircle(56, 120, 8);
      g.fillCircle(56, 144, 8);
      g.fillCircle(264, 96, 8);
      g.fillCircle(264, 120, 8);
      g.fillCircle(264, 144, 8);
      g.lineStyle(3, 0xd8a83d, 1);
      g.strokeRoundedRect(24, 40, 272, 160, 16);
    });
    // 기관 코어 (70x70)
    this.genTex('boss_engine_core', 70, 70, (g) => {
      g.fillStyle(0x2a120a, 1);
      g.fillCircle(35, 35, 34);
      g.fillStyle(0x8f4d2a, 1);
      g.fillCircle(35, 35, 27);
      g.fillStyle(0xff7b2d, 1);
      g.fillCircle(35, 35, 18);
      g.fillStyle(0xfff2c0, 1);
      g.fillCircle(35, 35, 9);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(35, 35, 4);
      g.lineStyle(3, 0xd8a83d, 1);
      g.strokeCircle(35, 35, 27);
    });
    // 백야천녀 (110x150)
    this.genTex('boss_maiden', 110, 150, (g) => {
      // 후광
      g.fillStyle(0x8f9fd6, 0.5);
      g.fillCircle(55, 70, 52);
      g.fillStyle(0xd8dcf2, 0.6);
      g.fillCircle(55, 70, 40);
      // 옷 (흰+금)
      g.fillStyle(0x2a2a4d, 1);
      g.fillTriangle(55, 20, 15, 148, 95, 148);
      g.fillStyle(0xe8e8f2, 1);
      g.fillTriangle(55, 28, 25, 144, 85, 144);
      g.fillStyle(0xd8a83d, 1);
      g.fillTriangle(55, 28, 47, 144, 63, 144);
      // 얼굴
      g.fillStyle(0xf2e8dc, 1);
      g.fillCircle(55, 42, 14);
      g.fillStyle(0x1a1a2e, 1);
      g.fillCircle(50, 42, 2.5);
      g.fillCircle(60, 42, 2.5);
      // 관
      g.fillStyle(0xd8a83d, 1);
      g.fillTriangle(38, 30, 55, 4, 72, 30);
      g.fillStyle(0xff2d5e, 1);
      g.fillCircle(55, 22, 4);
      // 소매
      g.fillStyle(0xbfc4e8, 1);
      g.fillTriangle(40, 70, 8, 100, 34, 108);
      g.fillTriangle(70, 70, 102, 100, 76, 108);
    });
    // 무명천 인간형 (90x130)
    this.genTex('final_human', 90, 130, (g) => {
      g.fillStyle(0x05050f, 1);
      g.fillEllipse(45, 65, 86, 126);
      g.fillStyle(0x2a2a4d, 1);
      g.fillEllipse(45, 65, 66, 106);
      // 균열 문양
      g.lineStyle(3, 0xa06bff, 1);
      g.lineBetween(45, 20, 38, 60);
      g.lineBetween(38, 60, 52, 90);
      g.lineBetween(52, 90, 45, 115);
      // 가면
      g.fillStyle(0xe8e8f2, 1);
      g.fillEllipse(45, 40, 30, 36);
      g.fillStyle(0x0a0a14, 1);
      g.fillEllipse(38, 40, 8, 14);
      g.fillEllipse(52, 40, 8, 14);
      g.fillStyle(0xffd75e, 1);
      g.fillCircle(38, 40, 2.5);
      g.fillCircle(52, 40, 2.5);
      // 검 (양손)
      g.fillStyle(0xd8f2ff, 1);
      g.fillTriangle(70, 60, 90, 75, 70, 90);
      g.fillTriangle(20, 60, 0, 75, 20, 90);
      // 후광 파편
      g.fillStyle(0xa06bff, 0.7);
      g.fillTriangle(14, 12, 21, 20, 14, 28);
      g.fillTriangle(76, 12, 69, 20, 76, 28);
      g.fillTriangle(10, 92, 17, 100, 10, 108);
      g.fillTriangle(80, 92, 73, 100, 80, 108);
    });
    // 무명천 신수형 (380x280 용+새)
    this.genTex('final_beast', 380, 280, (g) => {
      // 날개
      g.fillStyle(0x1e1440, 1);
      g.fillTriangle(190, 60, 20, 0, 60, 200);
      g.fillTriangle(190, 60, 360, 0, 320, 200);
      g.fillStyle(0x5b3fa8, 1);
      g.fillTriangle(190, 70, 50, 20, 75, 190);
      g.fillTriangle(190, 70, 330, 20, 305, 190);
      // 용 몸통
      g.fillStyle(0x2a2a4d, 1);
      g.fillEllipse(190, 160, 180, 150);
      g.fillStyle(0x4d4d8f, 1);
      g.fillEllipse(190, 150, 140, 115);
      // 비늘
      g.fillStyle(0x8f9fd6, 1);
      for (let r = 0; r < 4; r += 1) {
        for (let c = 0; c < 5; c += 1) {
          g.fillEllipse(140 + c * 25, 110 + r * 28, 20, 14);
        }
      }
      // 머리 (우측)
      g.fillStyle(0x3d3d6e, 1);
      g.fillEllipse(300, 120, 100, 80);
      g.fillStyle(0xe8e8f2, 1);
      g.fillEllipse(310, 115, 70, 55);
      // 뿔/부리
      g.fillStyle(0xd8a83d, 1);
      g.fillTriangle(290, 80, 280, 40, 310, 75);
      g.fillTriangle(320, 80, 330, 40, 335, 78);
      g.fillStyle(0xffd75e, 1);
      g.fillTriangle(340, 105, 378, 122, 340, 140);
      // 눈
      g.fillStyle(0xff2d3f, 1);
      g.fillCircle(315, 110, 9);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(315, 110, 3.5);
      // 가슴 코어
      g.fillStyle(0x0a0a14, 1);
      g.fillCircle(190, 170, 26);
      g.fillStyle(0xa06bff, 1);
      g.fillCircle(190, 170, 18);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(190, 170, 8);
    });
  }

  // -- 아이템 (20x20, 글자 명확 — Canvas) ------------------------------------------
  private makeItemTextures(): void {
    const defs: Array<[string, string, string]> = [
      ['item_p', 'P', '#4db2ff'],
      ['item_b', 'B', '#ffd75e'],
      ['item_l', 'L', '#53e0b0'],
      ['item_g', 'G', '#ffb347'],
    ];
    for (const [key, letter, color] of defs) {
      this.canvasTex(key, 24, (ctx, s) => {
        // 보석형 배경
        ctx.fillStyle = '#101020';
        ctx.beginPath();
        ctx.moveTo(s / 2, 0);
        ctx.lineTo(s - 1, s / 2);
        ctx.lineTo(s / 2, s - 1);
        ctx.lineTo(1, s / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(s / 2, 3);
        ctx.lineTo(s - 4, s / 2);
        ctx.lineTo(s / 2, s - 4);
        ctx.lineTo(4, s / 2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#101020';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, s / 2, s / 2 + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(s / 2 - 4, 4, 8, 2);
      });
    }
  }

  // -- FX -----------------------------------------------------------------
  private makeFxTextures(): void {
    // 불꽃 (8px)
    this.genTex('fx_spark', 10, 10, (g) => {
      g.fillStyle(0xffe9a0, 1);
      g.fillCircle(5, 5, 4.5);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(5, 5, 2);
    });
    // 소프트 연기 (Canvas 방사형)
    this.canvasTex('fx_smoke', 32, (ctx, s) => {
      const grad = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(200,200,210,0.7)');
      grad.addColorStop(0.6, 'rgba(160,160,175,0.3)');
      grad.addColorStop(1, 'rgba(140,140,155,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    });
    // 링 (64)
    this.genTex('fx_ring', 64, 64, (g) => {
      g.lineStyle(5, 0xffffff, 1);
      g.strokeCircle(32, 32, 26);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeCircle(32, 32, 20);
    });
    // 글로우 (Canvas 방사형)
    this.canvasTex('fx_glow', 64, (ctx, s) => {
      const grad = ctx.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    });
    // 별 (12px)
    this.genTex('fx_star', 14, 14, (g) => {
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(7, 0, 9, 7, 14, 7);
      g.fillTriangle(7, 0, 5, 7, 0, 7);
      g.fillTriangle(7, 14, 9, 7, 14, 7);
      g.fillTriangle(7, 14, 5, 7, 0, 7);
      g.fillStyle(0xffe9a0, 1);
      g.fillCircle(7, 7, 2.5);
    });
  }
}
