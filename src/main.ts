import Phaser from 'phaser';
import { HEIGHT, WIDTH } from './game/GameConfig';
import { BootScene } from './game/scenes/BootScene';
import { TitleScene } from './game/scenes/TitleScene';
import { CharacterSelectScene } from './game/scenes/CharacterSelectScene';
import { GameScene } from './game/scenes/GameScene';
import { ResultScene } from './game/scenes/ResultScene';
import { EndingScene } from './game/scenes/EndingScene';

function removeLoading(): void {
  try {
    const el = document.getElementById('loading');
    if (el) {
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 450);
    }
  } catch {
    // 무시
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#05070d',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    autoRound: true,
    width: WIDTH,
    height: HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    gamepad: true,
  },
  render: {
    // 절차 생성 텍스처를 선명하게 유지. roundPixels는 기본값(false)으로 두어
    // 고속 이동 시 떨림을 방지한다.
    pixelArt: true,
    roundPixels: false,
    antialias: true,
  },
  fps: {
    target: 60,
  },
  scene: [BootScene, TitleScene, CharacterSelectScene, GameScene, ResultScene, EndingScene],
});

// 디버그/테스트용 노출(일반 사용자 UI에는 노출되지 않음)
(window as unknown as { __CB_GAME?: Phaser.Game }).__CB_GAME = game;

game.events.once('ready', removeLoading);
// ready가 이미 발생한 뒤 로드된 경우를 위한 폴백
if (document.readyState === 'complete') {
  window.setTimeout(() => {
    try {
      if (document.getElementById('loading')) removeLoading();
    } catch {
      // 무시
    }
  }, 1500);
}

export default game;
