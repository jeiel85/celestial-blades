import Phaser from 'phaser';

/**
 * 키보드(화살표+WASD, Z/Space, X, Shift, ESC, M, F1~F4) + 게임패드 + 터치 입력.
 * GameScene/Player는 이 클래스만 보고, Phaser 키 객체를 직접 다루지 않는다.
 */
export interface Axis {
  x: number;
  y: number;
}

export interface DebugPress {
  box: boolean;
  invincible: boolean;
  boss: boolean;
  next: boolean;
}

export class InputSystem {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyZ!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyX!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyF1!: Phaser.Input.Keyboard.Key;
  private keyF2!: Phaser.Input.Keyboard.Key;
  private keyF3!: Phaser.Input.Keyboard.Key;
  private keyF4!: Phaser.Input.Keyboard.Key;

  private touchActive = false;
  private touchUIBuilt = false;
  private stickVec = { x: 0, y: 0 };
  private touchAttack = false;
  private touchBombPressed = false;

  /** 게임패드 버튼 엣지 검출용 (A=공격, B=필살) */
  private padAttack = false;
  private padAttackPrev = false;
  private padBomb = false;
  private padBombPrev = false;

  private stickBase: Phaser.GameObjects.Arc | null = null;
  private stickKnob: Phaser.GameObjects.Arc | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickPointerId: number | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (kb) {
      this.cursors = kb.createCursorKeys();
      this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
      this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
      this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
      this.keyZ = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
      this.keySpace = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.keyX = kb.addKey(Phaser.Input.Keyboard.KeyCodes.X);
      this.keyShift = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
      this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.keyM = kb.addKey(Phaser.Input.Keyboard.KeyCodes.M);
      this.keyF1 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
      this.keyF2 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F2);
      this.keyF3 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
      this.keyF4 = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F4);
      kb.addCapture([
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
      ]);
    } else {
      // 키보드 플러그인이 없어도 안전하게 동작하는 비활성 스텁
      const stub = () =>
        ({ isDown: false, isUp: true, enabled: false }) as unknown as Phaser.Input.Keyboard.Key;
      this.cursors = { up: stub(), down: stub(), left: stub(), right: stub(), space: stub(), shift: stub() };
      this.keyW = stub();
      this.keyA = stub();
      this.keyS = stub();
      this.keyD = stub();
      this.keyZ = stub();
      this.keySpace = stub();
      this.keyX = stub();
      this.keyShift = stub();
      this.keyEsc = stub();
      this.keyM = stub();
      this.keyF1 = stub();
      this.keyF2 = stub();
      this.keyF3 = stub();
      this.keyF4 = stub();
    }
  }

  private static justDown(key: Phaser.Input.Keyboard.Key): boolean {
    if (!key || key.enabled === false) return false;
    return Phaser.Input.Keyboard.JustDown(key);
  }

  private static justUp(key: Phaser.Input.Keyboard.Key): boolean {
    if (!key || key.enabled === false) return false;
    return Phaser.Input.Keyboard.JustUp(key);
  }

  /** 매 프레임 GameScene.update 시작 부분에서 호출 (게임패드 폴링용). */
  update(): void {
    const p = this.pad();
    this.padAttackPrev = this.padAttack;
    this.padBombPrev = this.padBomb;
    this.padAttack = p ? p.A === true : false;
    this.padBomb = p ? p.B === true : false;
  }

  private pad(): Phaser.Input.Gamepad.Gamepad | null {
    try {
      const gp = this.scene.input.gamepad;
      if (!gp || !gp.enabled) return null;
      const pads = gp.gamepads;
      if (!pads) return null;
      for (const p of pads) {
        if (p && p.connected) return p;
      }
      return null;
    } catch {
      return null;
    }
  }

  getAxis(): Axis {
    let x = 0;
    let y = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) x -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) x += 1;
    if (this.cursors.up.isDown || this.keyW.isDown) y -= 1;
    if (this.cursors.down.isDown || this.keyS.isDown) y += 1;

    const p = this.pad();
    if (p) {
      if (p.leftStick) {
        if (Math.abs(p.leftStick.x) > 0.25) x += p.leftStick.x;
        if (Math.abs(p.leftStick.y) > 0.25) y += p.leftStick.y;
      }
      if (p.left) x -= 1;
      if (p.right) x += 1;
      if (p.up) y -= 1;
      if (p.down) y += 1;
    }

    x += this.stickVec.x;
    y += this.stickVec.y;

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get attackDown(): boolean {
    if (this.keyZ.isDown || this.keySpace.isDown || this.touchAttack) return true;
    if (this.padAttack) return true;
    return false;
  }

  get attackJustPressed(): boolean {
    if (InputSystem.justDown(this.keyZ) || InputSystem.justDown(this.keySpace)) return true;
    if (this.padAttack && !this.padAttackPrev) return true;
    return false;
  }

  get attackJustReleased(): boolean {
    if (InputSystem.justUp(this.keyZ) || InputSystem.justUp(this.keySpace)) return true;
    if (!this.padAttack && this.padAttackPrev) return true;
    return false;
  }

  get bombJustPressed(): boolean {
    if (this.touchBombPressed) {
      this.touchBombPressed = false;
      return true;
    }
    if (InputSystem.justDown(this.keyX)) return true;
    if (this.padBomb && !this.padBombPrev) return true;
    return false;
  }

  get focusDown(): boolean {
    if (this.keyShift.isDown || this.cursors.shift.isDown) return true;
    return false;
  }

  get pauseJustPressed(): boolean {
    return InputSystem.justDown(this.keyEsc);
  }

  get muteJustPressed(): boolean {
    return InputSystem.justDown(this.keyM);
  }

  /** 메뉴(Title/Result)에서 "아무 키나" 진행용 */
  get anyJustPressed(): boolean {
    if (this.attackJustPressed || this.bombJustPressed || this.pauseJustPressed) return true;
    if (
      InputSystem.justDown(this.cursors.up) ||
      InputSystem.justDown(this.cursors.down) ||
      InputSystem.justDown(this.keyW) ||
      InputSystem.justDown(this.keyS)
    ) {
      return true;
    }
    return false;
  }

  /** F1~F4 디버그 키를 소모성으로 읽는다 (읽은 프레임에만 true). */
  consumeDebug(): DebugPress {
    return {
      box: InputSystem.justDown(this.keyF1),
      invincible: InputSystem.justDown(this.keyF2),
      boss: InputSystem.justDown(this.keyF3),
      next: InputSystem.justDown(this.keyF4),
    };
  }

  get isTouchMode(): boolean {
    return this.touchActive;
  }

  /**
   * 터치 기기에서만 가상 스틱 + 공격/필살기 버튼을 표시한다.
   * PC에서는 아무 것도 만들지 않는다. pointer가 touch일 때 활성화된다.
   */
  setupTouchUI(targetScene: Phaser.Scene): void {
    if (this.touchUIBuilt) return;
    this.touchUIBuilt = true;
    try {
      targetScene.input.addPointer(2);
    } catch {
      // 무시
    }
    targetScene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.wasTouch && !this.touchActive) {
        this.touchActive = true;
        this.buildTouchControls(targetScene);
      }
    });
  }

  private buildTouchControls(targetScene: Phaser.Scene): void {
    if (this.stickBase) return;
    const w = targetScene.scale.width;
    const h = targetScene.scale.height;

    const stickX = 150;
    const stickY = h - 150;
    const base = targetScene.add.circle(stickX, stickY, 70, 0x8fd3ff, 0.15).setScrollFactor(0).setDepth(900);
    base.setStrokeStyle(2, 0x8fd3ff, 0.5);
    const knob = targetScene.add.circle(stickX, stickY, 30, 0x8fd3ff, 0.35).setScrollFactor(0).setDepth(901);
    this.stickBase = base;
    this.stickKnob = knob;
    this.stickOrigin = { x: stickX, y: stickY };
    this.stickPointerId = null;

    const atkBtn = targetScene.add.circle(w - 130, h - 150, 52, 0xff5f5f, 0.3).setScrollFactor(0).setDepth(900);
    atkBtn.setStrokeStyle(2, 0xff8f8f, 0.7);
    targetScene.add
      .text(w - 130, h - 150, '공격', { fontSize: '20px', color: '#ffd0d0' })
      .setOrigin(0.5)
      .setDepth(901)
      .setScrollFactor(0);
    const bombBtn = targetScene.add.circle(w - 250, h - 110, 40, 0xffd75e, 0.3).setScrollFactor(0).setDepth(900);
    bombBtn.setStrokeStyle(2, 0xffd75e, 0.7);
    targetScene.add
      .text(w - 250, h - 110, '필살', { fontSize: '16px', color: '#fff2c0' })
      .setOrigin(0.5)
      .setDepth(901)
      .setScrollFactor(0);

    atkBtn.setInteractive({ useHandCursor: false });
    bombBtn.setInteractive({ useHandCursor: false });

    atkBtn.on('pointerdown', () => {
      this.touchAttack = true;
    });
    const atkOff = () => {
      this.touchAttack = false;
    };
    atkBtn.on('pointerup', atkOff);
    atkBtn.on('pointerout', atkOff);
    bombBtn.on('pointerdown', () => {
      this.touchBombPressed = true;
    });

    targetScene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.stickKnob) return;
      if (this.stickPointerId !== null && ptr.id !== this.stickPointerId) return;
      if (!ptr.isDown) return;
      if (this.stickPointerId === null) {
        const d = Math.hypot(ptr.x - this.stickOrigin.x, ptr.y - this.stickOrigin.y);
        if (d > 140) return;
        this.stickPointerId = ptr.id;
      }
      const dx = (ptr.x - this.stickOrigin.x) / 60;
      const dy = (ptr.y - this.stickOrigin.y) / 60;
      const len = Math.hypot(dx, dy);
      const cl = len > 1 ? 1 / len : 1;
      this.stickVec.x = dx * cl;
      this.stickVec.y = dy * cl;
      this.stickKnob.setPosition(
        this.stickOrigin.x + this.stickVec.x * 50,
        this.stickOrigin.y + this.stickVec.y * 50,
      );
    });
    const stickReset = (ptr: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== null && ptr.id === this.stickPointerId) {
        this.stickPointerId = null;
        this.stickVec.x = 0;
        this.stickVec.y = 0;
        this.stickKnob?.setPosition(this.stickOrigin.x, this.stickOrigin.y);
      }
    };
    targetScene.input.on('pointerup', stickReset);
  }
}
