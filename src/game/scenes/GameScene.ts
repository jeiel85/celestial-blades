import Phaser from 'phaser';
import { HEIGHT, MAX_BOMBS, START_BOMBS, WIDTH } from '../GameConfig';
import type {
  BossLike,
  Difficulty,
  EnemySpawnOpts,
  IGameWorld,
  ItemType,
  PlayerBulletSpawn,
  TargetRef,
} from '../GameConfig';
import { DIFFICULTY_PRESETS } from '../GameConfig';
// Boss.ts (3단계) 계약:
// createBoss(scene: GameScene, world: IGameWorld, bossId: string): Boss
// class Boss: x/y/active, getHpRatio(): number, getDisplayName(): string,
//   takeDamage(dmg: number): void, update(dtMs: number): void, destroy(): void,
//   isDefeated: boolean, getHitRadius(): number, onDefeated 콜백은 GameScene이 폴링(isDefeated)로 처리
import { createBoss } from '../entities/Boss';
import { Bullet } from '../entities/Bullet';
import { Enemy } from '../entities/Enemy';
import { Item } from '../items/Item';
import { Parallax } from '../backgrounds/Parallax';
import { STAGES, getStageBossId } from '../data/stages';
import { EnemySpawner } from '../systems/EnemySpawner';
import { Player } from '../entities/Player';
import { InputSystem } from '../systems/InputSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { AudioSystem } from '../systems/AudioSystem';
import { SaveSystem } from '../systems/SaveSystem';
import { Effects } from '../effects/Effects';

export interface GameSceneData {
  stageIndex?: number;
  score?: number;
  lives?: number;
  bombs?: number;
  power?: number;
  charIndex?: number;
  difficulty?: Difficulty;
  maxCombo?: number;
}

type BossPhase = 'none' | 'warning' | 'active' | 'dying' | 'done';

const MAX_PLAYER_BULLETS = 240;
const MAX_ENEMY_BULLETS = 700;
const MAX_ENEMIES = 80;
const MAX_ITEMS = 48;
const FONT = '"Courier New", monospace';
const RESPAWN_X = 200;
const RESPAWN_Y = 360;

/**
 * 게임플레이 씬 (키 'Game'). IGameWorld를 구조적으로 구현한다.
 * init(data)로 스테이지 상태 이월 {stageIndex, score, lives, bombs, power,
 * charIndex, difficulty, maxCombo}를 받는다.
 */
export class GameScene extends Phaser.Scene implements IGameWorld {
  audio!: AudioSystem;
  fx!: Effects;

  private player!: Player;
  private inputSys!: InputSystem;
  private scoreSys!: ScoreSystem;
  private save!: SaveSystem;
  private parallax!: Parallax;
  private spawner!: EnemySpawner;

  private stageIndex = 0;
  private difficulty: Difficulty = 'NORMAL';
  private carriedMaxCombo = 0;
  private initPower = 0;

  private playerBullets: Bullet[] = [];
  private enemyBullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private items: Item[] = [];
  private playerBulletGroup!: Phaser.Physics.Arcade.Group;
  private enemyBulletGroup!: Phaser.Physics.Arcade.Group;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private itemGroup!: Phaser.Physics.Arcade.Group;

  private boss: BossLike | null = null;
  private bossState: BossPhase = 'none';
  private bossId = '';
  private bossBar: Phaser.GameObjects.Container | null = null;
  private bossFill: Phaser.GameObjects.Rectangle | null = null;
  private bossNameText: Phaser.GameObjects.Text | null = null;

  private noMiss = true;
  private stageKills = 0;
  private paused = false;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private clearShown = false;
  private clearReadyAt = 0;
  private advanced = false;
  private gameOverPending = false;
  private keyTitle: Phaser.Input.Keyboard.Key | null = null;

  private hudScore!: Phaser.GameObjects.Text;
  private hudHi!: Phaser.GameObjects.Text;
  private hudLife!: Phaser.GameObjects.Text;
  private hudBomb!: Phaser.GameObjects.Text;
  private hudPower!: Phaser.GameObjects.Text;
  private hudCombo!: Phaser.GameObjects.Text;
  private hudCache = '';

  constructor() {
    super('Game');
  }

  init(data: GameSceneData): void {
    const raw = data ?? {};
    this.stageIndex = Math.max(0, Math.min(STAGES.length - 1, Math.floor(raw.stageIndex ?? 0)));
    const d = raw.difficulty;
    this.difficulty = d === 'EASY' || d === 'HARD' ? d : 'NORMAL';
    this.carriedMaxCombo = Math.max(0, Math.floor(raw.maxCombo ?? 0));
    this.initPower = Math.max(0, Math.min(3, Math.floor(raw.power ?? 0)));
    // lives/bombs는 create()에서 프리셋 기본값과 합친다
    this.registry.set('carryScore', Math.max(0, Math.floor(raw.score ?? 0)));
    this.registry.set('carryLives', raw.lives === undefined ? -1 : Math.max(0, Math.floor(raw.lives)));
    this.registry.set('carryBombs', raw.bombs === undefined ? -1 : Math.max(0, Math.floor(raw.bombs)));
    this.registry.set('carryChar', Math.max(0, Math.min(2, Math.floor(raw.charIndex ?? 0))));
  }

  create(): void {
    const stage = STAGES[this.stageIndex];
    this.save = new SaveSystem();
    this.scoreSys = new ScoreSystem(this.save);
    this.scoreSys.addRaw(this.registry.get('carryScore') as number);
    this.fx = new Effects(this);
    this.audio = new AudioSystem();
    this.audio.setMasterVolume(this.save.settings.masterVol);
    this.audio.setSfxVolume(this.save.settings.sfxVol);
    this.audio.setMusicVolume(this.save.settings.musicVol);
    this.audio.resume();
    try {
      this.input.once('pointerdown', () => this.audio.resume());
      this.input.keyboard?.once('keydown', () => this.audio.resume());
    } catch {
      // 무시
    }

    this.noMiss = true;
    this.stageKills = 0;
    this.boss = null;
    this.bossState = 'none';
    this.clearShown = false;
    this.advanced = false;
    this.gameOverPending = false;
    this.paused = false;
    this.playerBullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.items = [];

    // -- 풀 그룹 --
    this.playerBulletGroup = this.physics.add.group();
    this.enemyBulletGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();
    this.itemGroup = this.physics.add.group();

    // -- 배경/스포너 --
    this.parallax = new Parallax(this, stage.theme);
    this.spawner = new EnemySpawner(this, this, stage);

    // -- 플레이어 --
    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const carryLives = this.registry.get('carryLives') as number;
    const carryBombs = this.registry.get('carryBombs') as number;
    const charIndex = this.registry.get('carryChar') as number;
    this.player = new Player(
      this,
      this,
      charIndex,
      carryLives < 0 ? preset.lives : Math.max(1, carryLives),
      carryBombs < 0 ? START_BOMBS : Math.min(MAX_BOMBS, Math.max(0, carryBombs)),
    );
    this.player.sprite.setPosition(RESPAWN_X, RESPAWN_Y);
    for (let i = 0; i < this.initPower; i += 1) this.player.addPower(1);
    this.player.setOnHit(() => this.onPlayerHit());
    this.player.setOnDeath(() => this.onPlayerDeath());

    // -- 입력 --
    this.inputSys = new InputSystem(this);
    this.inputSys.setupTouchUI(this);
    this.keyTitle = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X) ?? null;

    // -- HUD --
    this.buildHud();

    // -- 충돌 --
    // NOTE: Phaser 3.60+의 그룹 충돌은 내부 처리 순서에 따라 콜백 인자 순서가
    // 뒤바뀔 수 있으므로, instanceof로 실제 타입을 판별한다(고정 순서 가정 금지).
    this.physics.add.overlap(this.playerBulletGroup, this.enemyGroup, (a, b) => {
      const bullet = a instanceof Bullet ? a : b instanceof Bullet ? b : null;
      const enemy = a instanceof Enemy ? a : b instanceof Enemy ? b : null;
      if (bullet && enemy) this.onPlayerBulletHitEnemy(bullet, enemy);
    });
    this.physics.add.overlap(this.enemyBulletGroup, this.player.sprite, (a, b) => {
      const bullet = a instanceof Bullet ? a : b instanceof Bullet ? b : null;
      if (!bullet || !bullet.active) return;
      bullet.kill();
      this.hitPlayer();
    });
    this.physics.add.overlap(this.enemyGroup, this.player.sprite, (a, b) => {
      const enemy = a instanceof Enemy ? a : b instanceof Enemy ? b : null;
      if (!enemy || !enemy.active) return;
      enemy.takeDamage(4, this.player.x);
      this.hitPlayer();
    });
    this.physics.add.overlap(this.itemGroup, this.player.sprite, (a, b) => {
      const item = a instanceof Item ? a : b instanceof Item ? b : null;
      if (!item || !item.active || !this.player.isAlive()) return;
      item.collect(this, this.player);
    });

    // -- 보스 HP 바 (숨김 상태로 준비) --
    this.buildBossBar();

    // -- 일시정지 오버레이 --
    this.buildPauseLayer();

    // -- 스테이지 타이틀 카드 --
    this.showTitleCard(stage.nameEng, stage.nameKor);

    // -- BGM --
    this.audio.startMusic(stage.music);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      try {
        this.audio.stopMusic();
      } catch {
        // 무시
      }
      this.scoreSys.checkAndSaveHiScore();
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(100, Math.max(1, delta));
    // 게임패드 엣지 검출을 위해 매 프레임 반드시 호출
    this.inputSys.update();

    if (this.inputSys.muteJustPressed) {
      this.audio.toggleMute();
    }

    if (this.inputSys.pauseJustPressed) {
      if (!this.gameOverPending && !this.clearShown) this.setPaused(!this.paused);
    }
    if (this.paused) {
      if (this.keyTitle && Phaser.Input.Keyboard.JustDown(this.keyTitle)) {
        this.setPaused(false);
        this.audio.stopMusic();
        this.scene.start('Title');
      } else if (this.inputSys.attackJustPressed || this.inputSys.bombJustPressed) {
        this.setPaused(false);
      }
      return;
    }

    const debug = this.inputSys.consumeDebug();
    if (debug.box) this.toggleDebugDraw();
    if (debug.invincible) {
      this.player.godMode = !this.player.godMode;
      this.fx.floatingText(this.player.x, this.player.y - 40, this.player.godMode ? 'GOD MODE ON' : 'GOD MODE OFF', '#8fd3ff', 18);
    }
    if (debug.boss) {
      const id = getStageBossId(STAGES[this.stageIndex]) ?? 'boss_iron';
      this.startBoss(id);
    }
    if (debug.next) this.advanceStage();

    // 클리어 패널: 4초 자동 진행 + 공격키 스킵
    if (this.clearShown) {
      this.player.update(dt, this.inputSys);
      this.parallax.update(dt);
      this.scoreSys.update(dt);
      this.refreshHud();
      if (_time >= this.clearReadyAt && this.inputSys.attackJustPressed) this.advanceStage();
      return;
    }
    if (this.gameOverPending) {
      this.parallax.update(dt);
      return;
    }

    this.player.update(dt, this.inputSys);
    this.spawner.update(dt);
    this.parallax.update(dt);
    for (const e of this.enemies) {
      if (e.active) e.update(dt);
    }
    for (const item of this.items) {
      if (item.active) item.update(dt, this.player.x, this.player.y);
    }
    const boss = this.boss;
    if (boss && this.bossState === 'active') {
      try {
        boss.update(dt);
      } catch {
        // 보스 내부 오류가 게임 루프를 멈추지 않게
      }
      this.collidePlayerBulletsWithBoss(boss);
      this.updateBossBar(boss);
      if (boss.isDefeated) this.onBossDefeated();
    }
    this.scoreSys.update(dt);
    this.refreshHud();
  }

  // -- IGameWorld 구현 --------------------------------------------------------

  spawnPlayerBullet(cfg: PlayerBulletSpawn): void {
    const b = this.allocBullet(this.playerBullets, this.playerBulletGroup, MAX_PLAYER_BULLETS, cfg.texture, 200);
    if (!b) return;
    b.fire(cfg.x, cfg.y, cfg.vx, cfg.vy, 'player', cfg.texture, {
      damage: cfg.damage,
      pierce: cfg.pierce ?? 0,
      clearsBullets: cfg.clearsBullets ?? false,
      homing: cfg.homing ?? false,
      homingTurn: cfg.homingTurn ?? 4,
      scale: cfg.scale,
      tint: cfg.tint,
      life: cfg.life,
      target: cfg.homing ? this.findTarget(cfg.x, cfg.y, 800) : null,
    });
  }

  spawnEnemyBullet(x: number, y: number, angle: number, speed: number, tex: string, tint: number, scale?: number, damage?: number): void {
    const b = this.allocBullet(this.enemyBullets, this.enemyBulletGroup, MAX_ENEMY_BULLETS, tex, 210);
    if (!b) return;
    b.fire(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 'enemy', tex, {
      damage: damage ?? 1,
      scale,
      tint,
    });
  }

  spawnItem(type: ItemType, x: number, y: number): void {
    for (const item of this.items) {
      if (!item.active) {
        item.spawn(type, x, y);
        return;
      }
    }
    if (this.items.length >= MAX_ITEMS) return;
    const item = new Item(this, this);
    this.items.push(item);
    this.itemGroup.add(item);
    item.spawn(type, x, y);
  }

  spawnEnemy(typeId: string, x: number, y: number, opts?: EnemySpawnOpts): void {
    for (const e of this.enemies) {
      if (!e.active) {
        e.spawn(typeId, x, y, opts);
        return;
      }
    }
    if (this.enemies.length >= MAX_ENEMIES) return;
    const e = new Enemy(this, this);
    this.enemies.push(e);
    this.enemyGroup.add(e);
    e.spawn(typeId, x, y, opts);
  }

  addScore(points: number): void {
    this.scoreSys.addScore(points);
  }

  registerKill(x: number, y: number, isBig: boolean): void {
    this.stageKills += 1;
    this.scoreSys.registerKill(x, y, isBig);
  }

  clearEnemyBullets(): void {
    let poofs = 0;
    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      if (poofs < 40) {
        this.fx.bulletPoof(b.x, b.y);
        poofs += 1;
      }
      b.kill();
    }
  }

  clearEnemyBulletsNear(x: number, y: number, radius: number): void {
    const r2 = radius * radius;
    let poofs = 0;
    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (poofs < 24) {
        this.fx.bulletPoof(b.x, b.y);
        poofs += 1;
      }
      b.kill();
    }
  }

  getDifficulty(): Difficulty {
    return this.difficulty;
  }

  isPlayerAlive(): boolean {
    return this.player.isAlive();
  }

  getPlayerPos(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }

  shake(intensity: number, dur: number): void {
    if (!this.save.settings.shake) return;
    this.fx.shake(intensity, dur);
  }

  hitStop(ms: number): void {
    this.fx.hitStop(ms);
  }

  findTarget(x: number, y: number, maxDist = 800): TargetRef | null {
    let best: TargetRef | null = null;
    let bestD2 = maxDist * maxDist;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dx = e.x - x;
      // 추적탄은 전방(우측) 위주. 뒤쪽은 100px까지만 허용.
      if (dx < -100) continue;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = e as unknown as TargetRef;
      }
    }
    const boss = this.boss;
    if (boss && this.bossState === 'active' && !boss.isDefeated) {
      const dx = boss.x - x;
      const dy = boss.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) best = boss;
    }
    return best;
  }

  dealDamageInRadius(x: number, y: number, radius: number, damage: number): void {
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy <= r2) e.takeDamage(damage, x);
    }
    const boss = this.boss;
    if (boss && this.bossState === 'active' && !boss.isDefeated) {
      const dx = boss.x - x;
      const dy = boss.y - y;
      const hitR = boss.getHitRadius() + radius;
      if (dx * dx + dy * dy <= hitR * hitR) boss.takeDamage(damage);
    }
  }

  startBoss(bossId: string): void {
    if (this.bossState !== 'none' || this.gameOverPending || this.clearShown) return;
    this.bossState = 'warning';
    this.bossId = bossId;
    this.spawner.setSuspended(true);
    this.setScrollSpeed(0);
    this.clearEnemyBullets();
    for (const e of this.enemies) {
      if (!e.active) continue;
      this.fx.explosion(e.x, e.y, 0.7, 0xffd75e);
      e.despawn();
    }
    this.audio.startMusic('boss');
    this.audio.playSfx('bossWarn');
    this.showWarning(() => {
      if (!this.scene.isActive()) return;
      try {
        this.boss = createBoss(this, this, bossId);
      } catch {
        this.boss = null;
      }
      if (!this.boss) {
        // 3단계 Boss 미구현 시 안전 복귀 (보스전 없이 웨이브 재개)
        this.bossState = 'none';
        this.spawner.setSuspended(false);
        this.setScrollSpeed(1);
        return;
      }
      this.bossState = 'active';
      this.showBossName(this.boss.getDisplayName());
      this.showBossBar(this.boss.getDisplayName());
      this.audio.playSfx('bossWarn');
    });
  }

  getBoss(): BossLike | null {
    return this.boss;
  }

  getActiveEnemyCount(typeId?: string): number {
    let n = 0;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (typeId !== undefined && e.typeId !== typeId) continue;
      n += 1;
    }
    return n;
  }

  setScrollSpeed(mult: number): void {
    if (this.parallax) this.parallax.setScrollSpeed(mult);
  }

  setDarkness(alpha: number): void {
    if (this.parallax) this.parallax.setDarkness(alpha);
  }

  // -- 충돌 처리 ---------------------------------------------------------------

  private onPlayerBulletHitEnemy(bullet: Bullet, enemy: Enemy): void {
    if (!bullet.active || !enemy.active) return;
    enemy.takeDamage(bullet.damage, bullet.x);
    if (bullet.clearsBullets) this.clearEnemyBulletsNear(bullet.x, bullet.y, 90);
    if (bullet.consumeHit()) bullet.kill();
  }

  private collidePlayerBulletsWithBoss(boss: BossLike): void {
    const r = boss.getHitRadius() + 8;
    const r2 = r * r;
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      const dx = b.x - boss.x;
      const dy = b.y - boss.y;
      if (dx * dx + dy * dy > r2) continue;
      boss.takeDamage(b.damage);
      if (b.clearsBullets) this.clearEnemyBulletsNear(b.x, b.y, 90);
      if (b.consumeHit()) b.kill();
      if (boss.isDefeated) return;
    }
  }

  private hitPlayer(): void {
    if (!this.player.isAlive() || this.player.isInvulnerable()) return;
    this.player.damagePlayer();
  }

  /** 피격(목숨 잔여) 시: 콤보 리셋 + 좌측 중앙 복귀 + 적탄 소거 */
  private onPlayerHit(): void {
    this.scoreSys.onPlayerHit();
    this.noMiss = false;
    this.player.sprite.setPosition(RESPAWN_X, RESPAWN_Y);
    try {
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | null;
      if (body) body.reset(RESPAWN_X, RESPAWN_Y);
    } catch {
      // 무시
    }
    this.clearEnemyBullets();
  }

  /** 목숨 0 → 1.5초 후 Result 씬 */
  private onPlayerDeath(): void {
    if (this.gameOverPending) return;
    this.gameOverPending = true;
    this.noMiss = false;
    this.clearEnemyBullets();
    this.audio.stopMusic();
    this.time.delayedCall(1500, () => {
      if (!this.scene.isActive()) return;
      this.scoreSys.checkAndSaveHiScore();
      this.scene.start('Result', {
        gameOver: true,
        score: this.scoreSys.currentScore,
        charIndex: this.player.getCharIndex(),
        difficulty: this.difficulty,
        stageIndex: this.stageIndex,
        stageStartScore: this.registry.get('carryScore') as number,
        power: this.player.getPower(),
      });
    });
  }

  // -- 보스 흐름 ------------------------------------------------------------------

  private onBossDefeated(): void {
    const boss = this.boss;
    if (!boss || this.bossState !== 'active') return;
    this.bossState = 'dying';
    this.clearEnemyBullets();
    const bx = boss.x;
    const by = boss.y;
    for (let i = 0; i < 8; i += 1) {
      this.time.delayedCall(i * 180, () => {
        if (!this.scene.isActive()) return;
        this.fx.explosion(bx + Phaser.Math.Between(-90, 90), by + Phaser.Math.Between(-70, 70), 1.2, 0xffb347);
        this.audio.playSfx('explode');
      });
    }
    this.time.delayedCall(1500, () => {
      if (!this.scene.isActive()) return;
      this.fx.explosion(bx, by, 3, 0xffffff);
      this.audio.playSfx('bossDie');
      this.hitStop(300);
      this.shake(0.012, 500);
      this.clearEnemyBullets();
      try {
        boss.destroy();
      } catch {
        // 무시
      }
      this.boss = null;
      this.hideBossBar();
      const midboss = this.bossId.startsWith('midboss');
      if (midboss) {
        // 중간보스: 드롭 후 웨이브 재개
        this.spawnItem('P', bx - 30, by);
        this.spawnItem('G', bx + 30, by);
        this.bossState = 'none';
        this.spawner.setSuspended(false);
        this.setScrollSpeed(1);
        this.audio.startMusic(STAGES[this.stageIndex].music);
      } else {
        // 최종 보스: 풍성한 드롭 후 클리어 패널
        this.spawnItem('P', bx - 60, by - 20);
        this.spawnItem('B', bx, by);
        this.spawnItem('G', bx + 50, by - 30);
        this.spawnItem('G', bx + 20, by + 40);
        this.bossState = 'done';
        this.audio.startMusic(STAGES[this.stageIndex].music);
        this.showClearPanel();
      }
    });
  }

  private showClearPanel(): void {
    const maxCombo = Math.max(this.carriedMaxCombo, this.scoreSys.bestCombo);
    const enemyBonus = this.stageKills * 100;
    const comboBonus = maxCombo * 50;
    const noMissBonus = this.noMiss ? 10000 : 0;
    const lifeBonus = this.player.getLives() * 2000;
    const total = enemyBonus + comboBonus + noMissBonus + lifeBonus;
    this.scoreSys.addRaw(total);

    const depth = 900;
    const c = this.add.container(0, 0).setDepth(depth).setScrollFactor(0);
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.78).setOrigin(0);
    const title = this.add
      .text(WIDTH / 2, 190, 'STAGE CLEAR', { fontFamily: FONT, fontSize: '52px', color: '#ffd75e', fontStyle: 'bold' })
      .setOrigin(0.5);
    const rows: Array<[string, string]> = [
      [`ENEMY BONUS  ${this.stageKills} x 100`, `${enemyBonus}`],
      [`COMBO BONUS  ${maxCombo} x 50`, `${comboBonus}`],
      [`NO MISS BONUS`, `${noMissBonus}`],
      [`REMAINING LIFE  ${this.player.getLives()} x 2000`, `${lifeBonus}`],
      ['TOTAL', `${this.scoreSys.currentScore}`],
    ];
    c.add([dim, title]);
    rows.forEach(([label, value], i) => {
      const y = 290 + i * 44;
      const lt = this.add
        .text(WIDTH / 2 - 260, y, label, { fontFamily: FONT, fontSize: '22px', color: i === 4 ? '#ffd75e' : '#e8f2ff' })
        .setOrigin(0, 0.5);
      const vt = this.add
        .text(WIDTH / 2 + 260, y, value, { fontFamily: FONT, fontSize: '22px', color: i === 4 ? '#ffd75e' : '#ffffff' })
        .setOrigin(1, 0.5);
      c.add([lt, vt]);
    });
    const hint = this.add
      .text(WIDTH / 2, 560, 'Z: SKIP', { fontFamily: FONT, fontSize: '18px', color: '#8fd3ff' })
      .setOrigin(0.5);
    c.add(hint);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 350, ease: 'Cubic.easeOut' });

    this.clearShown = true;
    this.clearReadyAt = this.time.now + 600;
    this.time.delayedCall(4000, () => {
      if (!this.scene.isActive()) return;
      this.advanceStage();
    });
  }

  private advanceStage(): void {
    if (this.advanced || this.gameOverPending) return;
    this.advanced = true;
    this.scoreSys.checkAndSaveHiScore();
    this.audio.stopMusic();
    if (this.stageIndex >= STAGES.length - 1) {
      this.scene.start('Ending', {
        charIndex: this.player.getCharIndex(),
        score: this.scoreSys.currentScore,
        difficulty: this.difficulty,
      });
      return;
    }
    this.scene.restart({
      stageIndex: this.stageIndex + 1,
      score: this.scoreSys.currentScore,
      lives: this.player.getLives(),
      bombs: Math.max(2, this.player.getBombs()),
      power: this.player.getPower(),
      charIndex: this.player.getCharIndex(),
      difficulty: this.difficulty,
      maxCombo: Math.max(this.carriedMaxCombo, this.scoreSys.bestCombo),
    } as GameSceneData);
  }

  // -- 연출 ------------------------------------------------------------------

  private showTitleCard(nameEng: string, nameKor: string): void {
    const stageNo = this.stageIndex >= STAGES.length - 1 ? 'FINAL' : `STAGE ${this.stageIndex + 1}`;
    const t1 = this.add
      .text(WIDTH / 2, 300, `${stageNo} — ${nameKor}`, {
        fontFamily: FONT,
        fontSize: '46px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#101020',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(850)
      .setAlpha(0);
    const t2 = this.add
      .text(WIDTH / 2, 352, nameEng, { fontFamily: FONT, fontSize: '24px', color: '#8fd3ff' })
      .setOrigin(0.5)
      .setDepth(850)
      .setAlpha(0);
    this.tweens.add({ targets: [t1, t2], alpha: 1, duration: 450, ease: 'Cubic.easeOut' });
    this.time.delayedCall(1900, () => {
      this.tweens.add({
        targets: [t1, t2],
        alpha: 0,
        duration: 600,
        onComplete: () => {
          t1.destroy();
          t2.destroy();
        },
      });
    });
  }

  private showWarning(done: () => void): void {
    const warn = this.add
      .text(WIDTH / 2, 320, '!! WARNING !!', {
        fontFamily: FONT,
        fontSize: '72px',
        color: '#ff2d3f',
        fontStyle: 'bold',
        stroke: '#300000',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(860);
    this.tweens.add({ targets: warn, alpha: 0.15, duration: 220, yoyo: true, repeat: 9 });
    this.time.delayedCall(2200, () => {
      warn.destroy();
      done();
    });
  }

  private showBossName(name: string): void {
    const t = this.add
      .text(WIDTH / 2, 250, name, {
        fontFamily: FONT,
        fontSize: '40px',
        color: '#ffd75e',
        fontStyle: 'bold',
        stroke: '#201000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(860)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 350 });
    this.time.delayedCall(1900, () => {
      this.tweens.add({
        targets: t,
        alpha: 0,
        duration: 500,
        onComplete: () => t.destroy(),
      });
    });
  }

  private buildBossBar(): void {
    const barW = 560;
    const barH = 12;
    const cx = WIDTH / 2;
    const y = 62;
    const bg = this.add.rectangle(cx, y, barW + 6, barH + 6, 0x101020, 0.8).setDepth(802);
    const fill = this.add.rectangle(cx - barW / 2, y, barW, barH, 0xff2d3f, 1).setOrigin(0, 0.5).setDepth(803);
    const name = this.add
      .text(cx, y - 24, '', { fontFamily: FONT, fontSize: '16px', color: '#ffd75e' })
      .setOrigin(0.5)
      .setDepth(803);
    const c = this.add.container(0, 0, [bg, fill, name]).setDepth(802).setVisible(false);
    this.bossBar = c;
    this.bossFill = fill;
    this.bossNameText = name;
  }

  private showBossBar(name: string): void {
    if (!this.bossBar || !this.bossNameText) return;
    this.bossNameText.setText(name);
    this.bossBar.setVisible(true);
    this.bossBar.setAlpha(0);
    this.tweens.add({ targets: this.bossBar, alpha: 1, duration: 400 });
  }

  private updateBossBar(boss: BossLike): void {
    if (!this.bossFill || !this.bossBar || !this.bossBar.visible) return;
    this.bossFill.setScale(Math.max(0.001, boss.getHpRatio()), 1);
  }

  private hideBossBar(): void {
    this.bossBar?.setVisible(false);
  }

  private buildPauseLayer(): void {
    const dim = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x05070d, 0.72).setOrigin(0);
    const title = this.add
      .text(WIDTH / 2, 280, 'PAUSED', { fontFamily: FONT, fontSize: '56px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const g1 = this.add
      .text(WIDTH / 2, 350, 'ESC / Z: RESUME', { fontFamily: FONT, fontSize: '22px', color: '#8fd3ff' })
      .setOrigin(0.5);
    const g2 = this.add
      .text(WIDTH / 2, 384, 'X: QUIT TO TITLE', { fontFamily: FONT, fontSize: '22px', color: '#8fd3ff' })
      .setOrigin(0.5);
    const c = this.add.container(0, 0, [dim, title, g1, g2]).setDepth(950).setVisible(false);
    this.pauseLayer = c;
  }

  private setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    if (p) {
      this.physics.world.pause();
      this.tweens.paused = true;
      this.time.paused = true;
      this.pauseLayer?.setVisible(true);
    } else {
      this.physics.world.resume();
      this.tweens.paused = false;
      this.time.paused = false;
      this.pauseLayer?.setVisible(false);
    }
  }

  private toggleDebugDraw(): void {
    const w = this.physics.world;
    try {
      if (w.debugGraphic) {
        w.debugGraphic.setVisible(!w.debugGraphic.visible);
      } else {
        w.createDebugGraphic();
      }
    } catch {
      // 무시
    }
  }

  // -- HUD ------------------------------------------------------------------

  private mono(x: number, y: number, size: number, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: 'bold' })
      .setDepth(801)
      .setScrollFactor(0);
  }

  private buildHud(): void {
    this.add.rectangle(0, 0, WIDTH, 42, 0x05070d, 0.62).setOrigin(0).setDepth(800).setScrollFactor(0);
    this.hudScore = this.mono(16, 10, 18, '#ffffff');
    this.hudHi = this.mono(290, 10, 18, '#8fd3ff');
    this.hudLife = this.mono(520, 10, 18, '#ff6f8f');
    this.hudBomb = this.mono(700, 10, 18, '#ffd75e');
    this.hudPower = this.mono(860, 10, 18, '#53e0b0');
    this.hudCombo = this.mono(1060, 10, 18, '#ffb347');
    this.add
      .text(WIDTH - 16, HEIGHT - 12, 'Z 공격 · X 필살 · SHIFT 집중 · ESC 정지 · M 음소거', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#5e7a8f',
      })
      .setOrigin(1, 1)
      .setDepth(801)
      .setAlpha(0.8);
    this.refreshHud();
  }

  private refreshHud(): void {
    const d = this.scoreSys.getDisplay();
    const lives = this.player.getLives();
    const bombs = this.player.getBombs();
    const power = this.player.getPower();
    const key = `${d.score}|${d.hi}|${lives}|${bombs}|${power}|${d.combo}|${d.mult.toFixed(1)}`;
    if (key === this.hudCache) return;
    this.hudCache = key;
    this.hudScore.setText(`SCORE ${d.score.toString().padStart(8, '0')}`);
    this.hudHi.setText(`HI ${Math.max(d.hi, d.score).toString().padStart(8, '0')}`);
    this.hudLife.setText(`LIFE ${'♥'.repeat(Math.max(0, Math.min(6, lives)))}`);
    this.hudBomb.setText(`BOMB ${'◆'.repeat(Math.max(0, Math.min(MAX_BOMBS, bombs)))}`);
    const filled = Math.max(1, Math.min(4, power + 1));
    this.hudPower.setText(`PWR ${'●'.repeat(filled)}${'○'.repeat(4 - filled)}`);
    this.hudCombo.setText(d.combo > 1 ? `COMBO ${d.combo} x${d.mult.toFixed(1)}` : '');
  }

  // -- 풀 ------------------------------------------------------------------

  private allocBullet(
    pool: Bullet[],
    group: Phaser.Physics.Arcade.Group,
    max: number,
    tex: string,
    depth: number,
  ): Bullet | null {
    for (const b of pool) {
      if (!b.active) return b;
    }
    if (pool.length >= max) return null;
    const b = new Bullet(this, -100, -100, tex);
    b.kill();
    b.setDepth(depth);
    pool.push(b);
    group.add(b);
    return b;
  }
}
