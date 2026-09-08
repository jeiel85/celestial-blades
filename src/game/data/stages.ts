import type { MusicKind } from '../systems/AudioSystem';

export type ParallaxTheme = 'valley' | 'city' | 'fortress' | 'rift';

export type GroupPattern = 'line' | 'v' | 'arc' | 'stream';

/** 스폰 강화 옵션 (2/3스테이지 강화형이 hp/탄속/틴트 변형) */
export interface WaveSpawnOpts {
  hpScale?: number;
  speedScale?: number;
  scoreScale?: number;
  tint?: number;
  scale?: number;
}

export interface SpawnAction {
  type: 'spawn';
  typeId: string;
  x: number;
  y: number;
  opts?: WaveSpawnOpts;
}

export interface GroupAction {
  type: 'group';
  typeId: string;
  count: number;
  pattern: GroupPattern;
  x?: number;
  y?: number;
  gap?: number;
  /** stream 패턴의 시차 간격 (ms) */
  interval?: number;
  opts?: WaveSpawnOpts;
}

export interface ScrollAction {
  type: 'scroll';
  /** 배경 스크롤 배율 (1 = 정상, 0 = 정지) */
  speed: number;
}

export interface MidbossAction {
  type: 'midboss';
  bossId: string;
}

export interface BossAction {
  type: 'boss';
  bossId: string;
}

export interface PauseAction {
  type: 'pause';
  /** 호흡용 빈 구간 (초, 타임라인이 시간 기반이라 표식용) */
  dur: number;
}

export type WaveAction = SpawnAction | GroupAction | ScrollAction | MidbossAction | BossAction | PauseAction;

export interface WaveEvent {
  /** 스테이지 경과 초 */
  t: number;
  actions: WaveAction[];
}

export interface StageDef {
  id: string;
  nameKor: string;
  nameEng: string;
  theme: ParallaxTheme;
  music: MusicKind;
  waves: WaveEvent[];
}

const R = 1360; // 화면 우측 밖 스폰 x

/** 스테이지의 최종 보스 id (F3 디버그/보스전 판정용) */
export function getStageBossId(stage: StageDef): string | null {
  for (let i = stage.waves.length - 1; i >= 0; i -= 1) {
    for (const a of stage.waves[i].actions) {
      if (a.type === 'boss') return a.bossId;
    }
  }
  return null;
}

export const STAGES: StageDef[] = [
  // -- Stage 1 청운계곡 (valley, ~3분, 보스 t=150) -------------------------------
  {
    id: 'stage1',
    nameKor: '청운계곡',
    nameEng: 'AZURE VALLEY',
    theme: 'valley',
    music: 'stage1',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R, y: 280, gap: 80 }] },
      { t: 9, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R, y: 450, gap: 80 }] },
      { t: 16, actions: [{ type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: R, y: 360, gap: 100 }] },
      { t: 24, actions: [{ type: 'group', typeId: 'small', count: 5, pattern: 'v', x: R, y: 360, gap: 80 }] },
      { t: 32, actions: [{ type: 'spawn', typeId: 'turret', x: 1150, y: 360 }] },
      { t: 36, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'stream', x: R, y: 240, interval: 600 }] },
      { t: 44, actions: [{ type: 'pause', dur: 3 }] },
      { t: 47, actions: [{ type: 'group', typeId: 'bat', count: 4, pattern: 'arc', x: R, y: 360, gap: 85 }] },
      { t: 55, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R, y: 200, gap: 80 },
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R + 200, y: 520, gap: 80 },
      ] },
      { t: 64, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360 }] },
      { t: 72, actions: [{ type: 'pause', dur: 3 }] },
      { t: 75, actions: [
        { type: 'group', typeId: 'small', count: 5, pattern: 'stream', x: R, y: 300, interval: 500 },
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: R + 260, y: 420, gap: 95 },
      ] },
      { t: 84, actions: [
        { type: 'spawn', typeId: 'turret', x: 1180, y: 220 },
        { type: 'spawn', typeId: 'turret', x: 1240, y: 520 },
      ] },
      { t: 90, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 92, actions: [{ type: 'midboss', bossId: 'midboss_ray' }] },
      { t: 96, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 100, actions: [{ type: 'group', typeId: 'small', count: 5, pattern: 'line', x: R, y: 330, gap: 75 }] },
      { t: 108, actions: [{ type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: R, y: 360, gap: 90 }] },
      { t: 116, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 250 },
        { type: 'spawn', typeId: 'rusher', x: R + 120, y: 470 },
        { type: 'group', typeId: 'small', count: 3, pattern: 'line', x: R + 200, y: 360, gap: 80 },
      ] },
      { t: 126, actions: [
        { type: 'spawn', typeId: 'turret', x: 1150, y: 480 },
        { type: 'spawn', typeId: 'rusher', x: R, y: 360 },
      ] },
      { t: 134, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 300 },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R, y: 480, interval: 550 },
      ] },
      { t: 144, actions: [{ type: 'pause', dur: 3 }] },
      { t: 147, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 150, actions: [{ type: 'boss', bossId: 'boss_iron' }] },
    ],
  },
  // -- Stage 2 붉은 기계도시 (city, ~4분, 보스 t=200) ------------------------------
  {
    id: 'stage2',
    nameKor: '붉은 기계도시',
    nameEng: 'CRIMSON MACHINE CITY',
    theme: 'city',
    music: 'stage2',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [{ type: 'group', typeId: 'small', count: 5, pattern: 'line', x: R, y: 300, gap: 75 }] },
      { t: 9, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 400 },
        { type: 'group', typeId: 'small', count: 3, pattern: 'stream', x: R, y: 220, interval: 600 },
      ] },
      { t: 17, actions: [{ type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R, y: 360, gap: 80 }] },
      { t: 26, actions: [
        { type: 'spawn', typeId: 'turret', x: 1160, y: 300 },
        { type: 'spawn', typeId: 'shield', x: R, y: 480 },
      ] },
      { t: 34, actions: [{ type: 'group', typeId: 'small', count: 6, pattern: 'v', x: R, y: 360, gap: 75 }] },
      { t: 43, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 200 },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520 },
      ] },
      { t: 51, actions: [{ type: 'pause', dur: 3 }] },
      { t: 54, actions: [
        { type: 'group', typeId: 'bat', count: 5, pattern: 'stream', x: R, y: 360, interval: 450 },
        { type: 'spawn', typeId: 'shield', x: R + 150, y: 360 },
      ] },
      { t: 63, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 200, opts: { hpScale: 1.2, tint: 0xffb0a0 } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 540, opts: { hpScale: 1.2, tint: 0xffb0a0 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R + 100, y: 370, gap: 80 },
      ] },
      { t: 73, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360, opts: { hpScale: 1.15 } }] },
      { t: 82, actions: [{ type: 'group', typeId: 'small', count: 6, pattern: 'line', x: R, y: 250, gap: 70 }] },
      { t: 90, actions: [
        { type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: R, y: 400, gap: 85 },
        { type: 'spawn', typeId: 'shield', x: R, y: 220, opts: { hpScale: 1.2 } },
      ] },
      { t: 99, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 360 },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 480 },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R + 150, y: 260, interval: 500 },
      ] },
      { t: 110, actions: [{ type: 'pause', dur: 4 }] },
      { t: 114, actions: [
        { type: 'group', typeId: 'small', count: 7, pattern: 'arc', x: R, y: 360, gap: 70, opts: { speedScale: 1.1 } },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'line', x: R + 300, y: 200, gap: 85 },
      ] },
      { t: 124, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 127, actions: [{ type: 'midboss', bossId: 'midboss_centipede' }] },
      { t: 131, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 135, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 300, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 460, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 380 },
      ] },
      { t: 145, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'v', x: R, y: 360, gap: 70 },
        { type: 'spawn', typeId: 'rusher', x: R + 200, y: 360 },
      ] },
      { t: 155, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 250, opts: { hpScale: 1.2 } }] },
      { t: 160, actions: [
        { type: 'spawn', typeId: 'elite', x: R + 200, y: 500, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'small', count: 5, pattern: 'stream', x: R, y: 380, interval: 450 },
      ] },
      { t: 172, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 250, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'shield', x: R, y: 420, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'rusher', x: R + 100, y: 200 },
      ] },
      { t: 184, actions: [
        { type: 'group', typeId: 'small', count: 6, pattern: 'line', x: R, y: 300, gap: 70, opts: { speedScale: 1.1 } },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'arc', x: R + 200, y: 450, gap: 80 },
      ] },
      { t: 193, actions: [{ type: 'pause', dur: 3 }] },
      { t: 196, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 200, actions: [{ type: 'boss', bossId: 'boss_engine' }] },
    ],
  },
  // -- Stage 3 천공성 (fortress, ~4.5분, 보스 t=225) --------------------------------
  {
    id: 'stage3',
    nameKor: '천공성',
    nameEng: 'SKY FORTRESS',
    theme: 'fortress',
    music: 'stage3',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [{ type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: R, y: 360, gap: 85, opts: { hpScale: 1.2 } }] },
      { t: 10, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 240, opts: { hpScale: 1.2, speedScale: 1.05 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 450, opts: { hpScale: 1.2 } },
      ] },
      { t: 19, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 230, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R, y: 470, interval: 500, opts: { hpScale: 1.2 } },
      ] },
      { t: 30, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 360 },
        { type: 'group', typeId: 'bat', count: 3, pattern: 'line', x: R + 150, y: 200, gap: 85 },
      ] },
      { t: 42, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 320, opts: { hpScale: 1.3 } },
        { type: 'spawn', typeId: 'rusher', x: R + 100, y: 480, opts: { speedScale: 1.1 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'v', x: R + 200, y: 400, gap: 80 },
      ] },
      { t: 53, actions: [{ type: 'pause', dur: 3 }] },
      { t: 56, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 220, opts: { hpScale: 1.3, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 520, opts: { hpScale: 1.3, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 360, opts: { hpScale: 1.2 } },
      ] },
      { t: 66, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360, opts: { hpScale: 1.25 } }] },
      { t: 72, actions: [
        { type: 'spawn', typeId: 'elite', x: R + 250, y: 200, opts: { hpScale: 1.25 } },
        { type: 'group', typeId: 'small', count: 5, pattern: 'stream', x: R, y: 480, interval: 450 },
      ] },
      { t: 84, actions: [
        { type: 'group', typeId: 'rusher', count: 2, pattern: 'line', x: R, y: 300, gap: 160, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R + 150, y: 400, gap: 75 },
      ] },
      { t: 95, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 250, opts: { hpScale: 1.35 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 500, opts: { hpScale: 1.35 } },
        { type: 'spawn', typeId: 'spawner', x: R + 200, y: 375 },
      ] },
      { t: 108, actions: [{ type: 'pause', dur: 4 }] },
      { t: 112, actions: [
        { type: 'group', typeId: 'small', count: 7, pattern: 'v', x: R, y: 360, gap: 70, opts: { hpScale: 1.25, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 360, opts: { hpScale: 1.35 } },
      ] },
      { t: 124, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'stream', x: R, y: 320, interval: 400, opts: { hpScale: 1.2 } },
        { type: 'spawn', typeId: 'rusher', x: R + 250, y: 450, opts: { speedScale: 1.15 } },
      ] },
      { t: 136, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 280, opts: { hpScale: 1.3 } },
        { type: 'spawn', typeId: 'elite', x: R + 220, y: 480, opts: { hpScale: 1.3 } },
      ] },
      { t: 146, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 150, actions: [{ type: 'midboss', bossId: 'midboss_dark' }] },
      { t: 154, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 158, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 250, opts: { hpScale: 1.3 } },
        { type: 'spawn', typeId: 'shield', x: R, y: 450, opts: { hpScale: 1.35 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R + 150, y: 350, interval: 450 },
      ] },
      { t: 170, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 300, opts: { hpScale: 1.4, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 200, opts: { hpScale: 1.25, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520, opts: { hpScale: 1.25, speedScale: 1.1 } },
      ] },
      { t: 182, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'arc', x: R, y: 360, gap: 70, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'elite', x: R + 250, y: 360, opts: { hpScale: 1.3 } },
      ] },
      { t: 194, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 360, opts: { hpScale: 1.4 } },
        { type: 'spawn', typeId: 'turret', x: 1160, y: 200, opts: { hpScale: 1.4 } },
        { type: 'spawn', typeId: 'turret', x: 1210, y: 540, opts: { hpScale: 1.4 } },
      ] },
      { t: 206, actions: [
        { type: 'group', typeId: 'small', count: 6, pattern: 'line', x: R, y: 280, gap: 70, opts: { hpScale: 1.3, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'rusher', x: R + 200, y: 450, opts: { hpScale: 1.3 } },
      ] },
      { t: 216, actions: [{ type: 'pause', dur: 3 }] },
      { t: 219, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 225, actions: [{ type: 'boss', bossId: 'boss_maiden' }] },
    ],
  },
  // -- Final 천문 (rift, ~3분, 보스 t=135) -------------------------------------------
  {
    id: 'final',
    nameKor: '천문',
    nameEng: 'CELESTIAL RIFT',
    theme: 'rift',
    music: 'final',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [
        { type: 'group', typeId: 'small', count: 5, pattern: 'v', x: R, y: 360, gap: 75, opts: { hpScale: 1.4, speedScale: 1.1 } },
        { type: 'group', typeId: 'bat', count: 3, pattern: 'line', x: R + 250, y: 250, gap: 85, opts: { hpScale: 1.4 } },
      ] },
      { t: 11, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 300, opts: { hpScale: 1.4, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 460, opts: { hpScale: 1.4, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 380, opts: { hpScale: 1.4 } },
      ] },
      { t: 21, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 360, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'elite', x: R + 200, y: 250, opts: { hpScale: 1.35 } },
      ] },
      { t: 32, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 450, opts: { hpScale: 1.4 } },
        { type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R, y: 300, gap: 75, opts: { hpScale: 1.35, speedScale: 1.1 } },
      ] },
      { t: 44, actions: [{ type: 'pause', dur: 3 }] },
      { t: 47, actions: [
        { type: 'group', typeId: 'small', count: 7, pattern: 'stream', x: R, y: 360, interval: 400, opts: { hpScale: 1.45, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'turret', x: 1140, y: 220, opts: { hpScale: 1.45, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 540, opts: { hpScale: 1.45, tint: 0xd8c8ff } },
      ] },
      { t: 58, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 300, opts: { hpScale: 1.4 } },
        { type: 'spawn', typeId: 'elite', x: R + 220, y: 480, opts: { hpScale: 1.4 } },
      ] },
      { t: 70, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 250, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 500, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 375, opts: { hpScale: 1.4, speedScale: 1.15 } },
      ] },
      { t: 82, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'v', x: R, y: 360, gap: 70, opts: { hpScale: 1.4, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'spawner', x: R + 200, y: 360, opts: { hpScale: 1.45 } },
      ] },
      { t: 95, actions: [
        { type: 'group', typeId: 'small', count: 6, pattern: 'arc', x: R, y: 360, gap: 70, opts: { hpScale: 1.5, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'elite', x: R + 200, y: 360, opts: { hpScale: 1.45 } },
      ] },
      { t: 108, actions: [
        { type: 'spawn', typeId: 'turret', x: 1150, y: 360, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 220, opts: { hpScale: 1.45, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520, opts: { hpScale: 1.45, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'shield', x: R + 150, y: 370, opts: { hpScale: 1.5 } },
      ] },
      { t: 122, actions: [{ type: 'pause', dur: 3 }] },
      { t: 125, actions: [{ type: 'scroll', speed: 0.2 }] },
      { t: 130, actions: [{ type: 'scroll', speed: 0 }] },
      { t: 135, actions: [{ type: 'boss', bossId: 'final_moo' }] },
    ],
  },
];
