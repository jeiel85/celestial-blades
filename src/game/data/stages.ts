import type { EnemyEntry } from '../GameConfig';
import type { MusicKind } from '../systems/AudioSystem';

export type ParallaxTheme = 'valley' | 'city' | 'palace' | 'fortress' | 'market' | 'rift';

export type GroupPattern = 'line' | 'v' | 'arc' | 'stream';

/** 스폰 강화 옵션 (2/3스테이지 강화형이 hp/탄속/틴트 변형) */
export interface WaveSpawnOpts {
  hpScale?: number;
  speedScale?: number;
  scoreScale?: number;
  tint?: number;
  scale?: number;
  /**
   * 들어오는 쪽(기본 right). top/bottom/back이면 x·y는 도착점이고, 0.7초 동안 들어올 길에 경고선을 보인 뒤
   * 가장자리에서 날아 들어온다(EnemySpawner·Enemy). back은 기체 뒤(왼쪽)에서 그 높이로 가로지른다.
   */
  entry?: EnemyEntry;
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

/**
 * 연속 흐름: 같은 잡몹을 every(ms)마다 하나씩 count기 내보낸다. i번째의 높이는
 * y + amp·sin(2π(i + 0.25)/period)라 period 2면 위아래 번갈아, count와 같으면 한 번 크게 휩쓴다.
 * 웨이브 사이를 비우지 않는 '팝콘' 몫이라 아이템은 적게 떨어뜨린다(EnemySpawner FLOW_DROP_SCALE).
 */
export interface FlowAction {
  type: 'flow';
  typeId: string;
  count: number;
  every: number;
  y: number;
  amp?: number;
  /** 흔들림 주기(기 수, 기본 count) */
  period?: number;
  /** 기본은 화면 오른쪽 밖. entry가 있으면 도착점 x */
  x?: number;
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

export type WaveAction = SpawnAction | GroupAction | FlowAction | ScrollAction | MidbossAction | BossAction | PauseAction;

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
      { t: 5, actions: [{ type: 'flow', typeId: 'small', count: 4, every: 900, y: 360, amp: 140, period: 4 }] },
      { t: 9, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R, y: 450, gap: 80 }] },
      { t: 12, actions: [{ type: 'flow', typeId: 'small', count: 4, every: 800, y: 220, amp: 50, period: 2 }] },
      { t: 16, actions: [{ type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: R, y: 360, gap: 100 }] },
      { t: 19.5, actions: [{ type: 'flow', typeId: 'small', count: 4, every: 800, y: 500, amp: 50, period: 2 }] },
      { t: 24, actions: [{ type: 'group', typeId: 'small', count: 5, pattern: 'v', x: R, y: 360, gap: 80 }] },
      { t: 28, actions: [{ type: 'flow', typeId: 'small', count: 5, every: 700, y: 360, amp: 200, period: 5 }] },
      { t: 32, actions: [{ type: 'spawn', typeId: 'turret', x: 1150, y: 360 }] },
      { t: 36, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'stream', x: R, y: 240, interval: 600 }] },
      { t: 39, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 880, y: 200, gap: 130, opts: { entry: 'top' } }] },
      { t: 41, actions: [{ type: 'flow', typeId: 'small', count: 5, every: 800, y: 300, amp: 160, period: 5 }] },
      { t: 47, actions: [{ type: 'group', typeId: 'bat', count: 4, pattern: 'arc', x: R, y: 360, gap: 85 }] },
      { t: 51, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 880, y: 520, gap: 130, opts: { entry: 'bottom' } }] },
      { t: 55, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R, y: 200, gap: 80 },
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R + 200, y: 520, gap: 80 },
      ] },
      { t: 59, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 600, y: 360, amp: 210, period: 2 }] },
      { t: 64, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360 }] },
      { t: 67, actions: [
        { type: 'flow', typeId: 'small', count: 4, every: 1000, y: 150 },
        { type: 'flow', typeId: 'small', count: 4, every: 1000, y: 570 },
      ] },
      { t: 72, actions: [
        { type: 'spawn', typeId: 'small', x: 900, y: 200, opts: { entry: 'back' } },
        { type: 'spawn', typeId: 'small', x: 900, y: 520, opts: { entry: 'back' } },
      ] },
      { t: 75, actions: [
        { type: 'group', typeId: 'small', count: 5, pattern: 'stream', x: R, y: 300, interval: 500 },
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: R + 260, y: 420, gap: 95 },
      ] },
      { t: 79, actions: [{ type: 'flow', typeId: 'small', count: 5, every: 700, y: 250, amp: 100, period: 5 }] },
      { t: 84, actions: [
        { type: 'spawn', typeId: 'turret', x: 1180, y: 220 },
        { type: 'spawn', typeId: 'turret', x: 1240, y: 520 },
      ] },
      { t: 86, actions: [{ type: 'flow', typeId: 'small', count: 4, every: 700, y: 470, amp: 100, period: 4 }] },
      { t: 90, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 92, actions: [{ type: 'midboss', bossId: 'midboss_ray' }] },
      { t: 96, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 100, actions: [{ type: 'group', typeId: 'small', count: 5, pattern: 'line', x: R, y: 330, gap: 75 }] },
      { t: 103, actions: [{ type: 'flow', typeId: 'small', count: 5, every: 700, y: 400, amp: 160, period: 5 }] },
      { t: 108, actions: [{ type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: R, y: 360, gap: 90 }] },
      { t: 111, actions: [{ type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 980, y: 230, gap: 100, opts: { entry: 'top' } }] },
      { t: 116, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 250 },
        { type: 'spawn', typeId: 'rusher', x: R + 120, y: 470 },
        { type: 'group', typeId: 'small', count: 3, pattern: 'line', x: R + 200, y: 360, gap: 80 },
      ] },
      { t: 121, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 600, y: 450, amp: 150, period: 3 }] },
      { t: 126, actions: [
        { type: 'spawn', typeId: 'turret', x: 1150, y: 480 },
        { type: 'spawn', typeId: 'rusher', x: R, y: 360 },
      ] },
      { t: 130, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 760, y: 160, gap: 90, opts: { entry: 'back' } }] },
      { t: 134, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 300 },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R, y: 480, interval: 550 },
      ] },
      { t: 139, actions: [{ type: 'flow', typeId: 'small', count: 5, every: 700, y: 300, amp: 140, period: 5 }] },
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
      { t: 5.5, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 630, y: 470, amp: 120, period: 5 }] },
      { t: 9, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 400 },
        { type: 'group', typeId: 'small', count: 3, pattern: 'stream', x: R, y: 220, interval: 600 },
      ] },
      { t: 13, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 580, y: 300, amp: 160, period: 2 }] },
      { t: 17, actions: [{ type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R, y: 360, gap: 80 }] },
      { t: 21.5, actions: [
        { type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 860, y: 180, gap: 140, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'small', count: 5, every: 630, y: 540, amp: 40, period: 2 },
      ] },
      { t: 26, actions: [
        { type: 'spawn', typeId: 'turret', x: 1160, y: 300 },
        { type: 'spawn', typeId: 'shield', x: R, y: 480 },
      ] },
      { t: 30, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 540, y: 360, amp: 220, period: 6 }] },
      { t: 34, actions: [{ type: 'group', typeId: 'small', count: 6, pattern: 'v', x: R, y: 360, gap: 75 }] },
      { t: 38, actions: [
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 1000, y: 520, gap: 90, opts: { entry: 'bottom' } },
        { type: 'flow', typeId: 'small', count: 5, every: 630, y: 200, amp: 60, period: 2 },
      ] },
      { t: 43, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 200 },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520 },
      ] },
      { t: 47, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 500, y: 360, amp: 200, period: 2 }] },
      { t: 51, actions: [
        { type: 'spawn', typeId: 'small', x: 820, y: 150, opts: { entry: 'back' } },
        { type: 'spawn', typeId: 'small', x: 820, y: 570, opts: { entry: 'back' } },
      ] },
      { t: 54, actions: [
        { type: 'group', typeId: 'bat', count: 5, pattern: 'stream', x: R, y: 360, interval: 450 },
        { type: 'spawn', typeId: 'shield', x: R + 150, y: 360 },
      ] },
      { t: 58, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 580, y: 250, amp: 120, period: 5 }] },
      { t: 63, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 200, opts: { hpScale: 1.2, tint: 0xffb0a0 } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 540, opts: { hpScale: 1.2, tint: 0xffb0a0 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: R + 100, y: 370, gap: 80 },
      ] },
      { t: 67, actions: [{ type: 'flow', typeId: 'bat', count: 5, every: 810, y: 560, amp: 60, period: 2 }] },
      { t: 73, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360, opts: { hpScale: 1.15 } }] },
      { t: 77, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 540, y: 360, amp: 200, period: 3 }] },
      { t: 82, actions: [{ type: 'group', typeId: 'small', count: 6, pattern: 'line', x: R, y: 250, gap: 70 }] },
      { t: 86, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 840, y: 160, gap: 110, opts: { entry: 'top' } }] },
      { t: 90, actions: [
        { type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: R, y: 400, gap: 85 },
        { type: 'spawn', typeId: 'shield', x: R, y: 220, opts: { hpScale: 1.2 } },
      ] },
      { t: 94, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 580, y: 520, amp: 100, period: 5 }] },
      { t: 99, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 360 },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 480 },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R + 150, y: 260, interval: 500 },
      ] },
      { t: 104, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 500, y: 300, amp: 180, period: 2 }] },
      { t: 110, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 800, y: 600, gap: 110, opts: { entry: 'back' } }] },
      { t: 114, actions: [
        { type: 'group', typeId: 'small', count: 7, pattern: 'arc', x: R, y: 360, gap: 70, opts: { speedScale: 1.1 } },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'line', x: R + 300, y: 200, gap: 85 },
      ] },
      { t: 118, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 540, y: 450, amp: 160, period: 5 }] },
      { t: 124, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 127, actions: [{ type: 'midboss', bossId: 'midboss_centipede' }] },
      { t: 131, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 135, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 300, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 460, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 380 },
      ] },
      { t: 139, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 540, y: 360, amp: 220, period: 6 }] },
      { t: 145, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'v', x: R, y: 360, gap: 70 },
        { type: 'spawn', typeId: 'rusher', x: R + 200, y: 360 },
      ] },
      { t: 149, actions: [
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 1000, y: 220, gap: 90, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'small', count: 5, every: 630, y: 560, amp: 40, period: 2 },
      ] },
      { t: 155, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 250, opts: { hpScale: 1.2 } }] },
      { t: 160, actions: [
        { type: 'spawn', typeId: 'elite', x: R + 200, y: 500, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'small', count: 5, pattern: 'stream', x: R, y: 380, interval: 450 },
      ] },
      { t: 165, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 500, y: 220, amp: 120, period: 3 }] },
      { t: 172, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 250, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'shield', x: R, y: 420, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'rusher', x: R + 100, y: 200 },
      ] },
      { t: 177, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 780, y: 140, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'small', count: 6, every: 540, y: 560, amp: 60, period: 2 },
      ] },
      { t: 184, actions: [
        { type: 'group', typeId: 'small', count: 6, pattern: 'line', x: R, y: 300, gap: 70, opts: { speedScale: 1.1 } },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'arc', x: R + 200, y: 450, gap: 80 },
      ] },
      { t: 188, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 500, y: 360, amp: 220, period: 2 }] },
      { t: 193, actions: [{ type: 'pause', dur: 3 }] },
      { t: 196, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 200, actions: [{ type: 'boss', bossId: 'boss_engine' }] },
    ],
  },
  // -- Stage 3 수몰용궁 (palace, ~3.8분, 보스 t=215) --------------------------------
  {
    id: 'palace',
    nameKor: '수몰용궁',
    nameEng: 'SUNKEN DRAGON PALACE',
    theme: 'palace',
    music: 'stage4',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [{ type: 'group', typeId: 'fish', count: 5, pattern: 'arc', x: R, y: 360, gap: 80 }] },
      { t: 6, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 650, y: 360, amp: 200, period: 5, opts: { tint: 0x9fe8ff } }] },
      { t: 10, actions: [
        { type: 'group', typeId: 'fish', count: 4, pattern: 'stream', x: R, y: 220, interval: 500 },
        { type: 'group', typeId: 'fish', count: 4, pattern: 'stream', x: R, y: 500, interval: 500 },
      ] },
      { t: 15, actions: [{ type: 'flow', typeId: 'fish', count: 5, every: 800, y: 360 }] },
      { t: 19, actions: [
        { type: 'spawn', typeId: 'turret', x: 1150, y: 260, opts: { hpScale: 1.15, tint: 0xa0f0e0 } },
        { type: 'group', typeId: 'small', count: 5, pattern: 'v', x: R, y: 430, gap: 75, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 24, actions: [
        { type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 900, y: 200, gap: 120, opts: { entry: 'top', tint: 0x9fe8ff } },
        { type: 'flow', typeId: 'small', count: 5, every: 650, y: 560, amp: 40, period: 2, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 29, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 360, opts: { hpScale: 1.2, tint: 0xa0f0e0 } },
        { type: 'group', typeId: 'fish', count: 6, pattern: 'line', x: R + 150, y: 200, gap: 70 },
      ] },
      { t: 34, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 550, y: 300, amp: 200, period: 2, opts: { tint: 0x9fe8ff } }] },
      { t: 39, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 250, opts: { hpScale: 1.15 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 470, opts: { hpScale: 1.15 } },
        { type: 'group', typeId: 'fish', count: 4, pattern: 'v', x: R + 200, y: 360, gap: 80 },
      ] },
      { t: 44, actions: [
        { type: 'group', typeId: 'fish', count: 3, pattern: 'v', x: 1000, y: 500, gap: 90, opts: { entry: 'bottom' } },
        { type: 'flow', typeId: 'small', count: 5, every: 650, y: 180, amp: 40, period: 2, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 49, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 800, y: 600, gap: 110, opts: { entry: 'back', tint: 0x9fe8ff } }] },
      { t: 52, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360, opts: { hpScale: 1.15, tint: 0xc0f8f0 } }] },
      { t: 56, actions: [{ type: 'flow', typeId: 'small', count: 6, every: 600, y: 450, amp: 150, period: 5, opts: { tint: 0x9fe8ff } }] },
      { t: 60, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 250, opts: { hpScale: 1.1 } },
        { type: 'group', typeId: 'fish', count: 5, pattern: 'stream', x: R, y: 480, interval: 450 },
      ] },
      { t: 66, actions: [{ type: 'flow', typeId: 'fish', count: 5, every: 800, y: 200, amp: 40, period: 2 }] },
      { t: 71, actions: [
        { type: 'group', typeId: 'fish', count: 7, pattern: 'arc', x: R, y: 360, gap: 70, opts: { speedScale: 1.1 } },
        { type: 'spawn', typeId: 'turret', x: 1180, y: 520, opts: { hpScale: 1.2, tint: 0xa0f0e0 } },
      ] },
      { t: 77, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 550, y: 360, amp: 220, period: 3, opts: { tint: 0x9fe8ff } }] },
      { t: 82, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 240, opts: { hpScale: 1.25, tint: 0xa0f0e0 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 480, opts: { hpScale: 1.25, tint: 0xa0f0e0 } },
      ] },
      { t: 87, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 820, y: 150, gap: 110, opts: { entry: 'top', tint: 0x9fe8ff } },
        { type: 'flow', typeId: 'small', count: 5, every: 650, y: 560, amp: 40, period: 2, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 92, actions: [
        { type: 'group', typeId: 'bat', count: 5, pattern: 'v', x: R, y: 360, gap: 80, opts: { tint: 0x9fe8ff } },
        { type: 'spawn', typeId: 'rusher', x: R + 220, y: 300, opts: { hpScale: 1.2 } },
      ] },
      { t: 97, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 550, y: 300, amp: 180, period: 6, opts: { tint: 0x9fe8ff } }] },
      { t: 103, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 106, actions: [{ type: 'midboss', bossId: 'midboss_jelly' }] },
      { t: 110, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 114, actions: [
        { type: 'group', typeId: 'fish', count: 6, pattern: 'line', x: R, y: 300, gap: 70, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'fish', count: 6, pattern: 'line', x: R + 120, y: 440, gap: 70, opts: { hpScale: 1.2 } },
      ] },
      { t: 120, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 550, y: 360, amp: 220, period: 2, opts: { tint: 0x9fe8ff } }] },
      { t: 125, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 260, opts: { hpScale: 1.2, tint: 0xc0f8f0 } },
        { type: 'spawn', typeId: 'turret', x: 1160, y: 500, opts: { hpScale: 1.25, tint: 0xa0f0e0 } },
      ] },
      { t: 131, actions: [
        { type: 'group', typeId: 'fish', count: 3, pattern: 'v', x: 980, y: 230, gap: 90, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'small', count: 5, every: 650, y: 560, amp: 50, period: 2, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 137, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 360, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'fish', count: 5, pattern: 'stream', x: R + 100, y: 200, interval: 420 },
        { type: 'group', typeId: 'fish', count: 5, pattern: 'stream', x: R + 100, y: 520, interval: 420 },
      ] },
      { t: 144, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 550, y: 360, amp: 200, period: 6, opts: { tint: 0x9fe8ff } }] },
      { t: 150, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 200, opts: { hpScale: 1.25, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520, opts: { hpScale: 1.25, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'shield', x: R + 150, y: 360, opts: { hpScale: 1.3, tint: 0xa0f0e0 } },
      ] },
      { t: 156, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 780, y: 140, gap: 100, opts: { entry: 'back', tint: 0x9fe8ff } },
        { type: 'flow', typeId: 'small', count: 5, every: 650, y: 560, amp: 50, period: 2, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 162, actions: [{ type: 'flow', typeId: 'fish', count: 5, every: 750, y: 360, amp: 180, period: 2 }] },
      { t: 165, actions: [
        { type: 'group', typeId: 'fish', count: 8, pattern: 'arc', x: R, y: 360, gap: 65, opts: { hpScale: 1.25, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'elite', x: R + 250, y: 360, opts: { hpScale: 1.25, tint: 0xc0f8f0 } },
      ] },
      { t: 171, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 500, y: 300, amp: 200, period: 3, opts: { tint: 0x9fe8ff } }] },
      { t: 178, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 220, opts: { hpScale: 1.3, tint: 0xa0f0e0 } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 520, opts: { hpScale: 1.3, tint: 0xa0f0e0 } },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'line', x: R + 100, y: 370, gap: 85, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 184, actions: [
        { type: 'group', typeId: 'fish', count: 4, pattern: 'v', x: 960, y: 480, gap: 80, opts: { entry: 'bottom' } },
        { type: 'flow', typeId: 'small', count: 6, every: 600, y: 200, amp: 60, period: 2, opts: { tint: 0x9fe8ff } },
      ] },
      { t: 192, actions: [
        { type: 'group', typeId: 'fish', count: 6, pattern: 'v', x: R, y: 360, gap: 70, opts: { hpScale: 1.3, speedScale: 1.15 } },
      ] },
      { t: 196, actions: [{ type: 'flow', typeId: 'small', count: 7, every: 500, y: 360, amp: 220, period: 2, opts: { tint: 0x9fe8ff } }] },
      { t: 202, actions: [{ type: 'pause', dur: 3 }] },
      { t: 208, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 212, actions: [{ type: 'boss', bossId: 'boss_dragon' }] },
    ],
  },
  // -- Stage 4 천공성 (fortress, ~4.5분, 보스 t=225) --------------------------------
  {
    id: 'stage3',
    nameKor: '천공성',
    nameEng: 'SKY FORTRESS',
    theme: 'fortress',
    music: 'stage3',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [{ type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: R, y: 360, gap: 85, opts: { hpScale: 1.2 } }] },
      { t: 6, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 480, y: 360, amp: 200, period: 6 }] },
      { t: 10, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 240, opts: { hpScale: 1.2, speedScale: 1.05 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 450, opts: { hpScale: 1.2 } },
      ] },
      { t: 14, actions: [
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 1000, y: 220, gap: 90, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'small', count: 8, every: 480, y: 520, amp: 80, period: 2 },
      ] },
      { t: 19, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 230, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R, y: 470, interval: 500, opts: { hpScale: 1.2 } },
      ] },
      { t: 24, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 440, y: 300, amp: 200, period: 2 }] },
      { t: 30, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 360 },
        { type: 'group', typeId: 'bat', count: 3, pattern: 'line', x: R + 150, y: 200, gap: 85 },
      ] },
      { t: 35, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 780, y: 600, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'small', count: 7, every: 520, y: 180, amp: 40, period: 2 },
      ] },
      { t: 42, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 320, opts: { hpScale: 1.3 } },
        { type: 'spawn', typeId: 'rusher', x: R + 100, y: 480, opts: { speedScale: 1.1 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'v', x: R + 200, y: 400, gap: 80 },
      ] },
      { t: 47, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 360, amp: 220, period: 3 }] },
      { t: 53, actions: [
        { type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 860, y: 170, gap: 130, opts: { entry: 'top' } },
        { type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 860, y: 550, gap: 130, opts: { entry: 'bottom' } },
      ] },
      { t: 56, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 220, opts: { hpScale: 1.3, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 520, opts: { hpScale: 1.3, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 360, opts: { hpScale: 1.2 } },
      ] },
      { t: 61, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 440, y: 360, amp: 220, period: 2 }] },
      { t: 66, actions: [{ type: 'spawn', typeId: 'elite', x: R, y: 360, opts: { hpScale: 1.25 } }] },
      { t: 70, actions: [{ type: 'flow', typeId: 'small', count: 8, every: 480, y: 600, amp: 30, period: 2 }] },
      { t: 72, actions: [
        { type: 'spawn', typeId: 'elite', x: R + 250, y: 200, opts: { hpScale: 1.25 } },
        { type: 'group', typeId: 'small', count: 5, pattern: 'stream', x: R, y: 480, interval: 450 },
      ] },
      { t: 78, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 760, y: 130, gap: 100, opts: { entry: 'back' } }] },
      { t: 84, actions: [
        { type: 'group', typeId: 'rusher', count: 2, pattern: 'line', x: R, y: 300, gap: 160, opts: { hpScale: 1.2 } },
        { type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R + 150, y: 400, gap: 75 },
      ] },
      { t: 89, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 300, amp: 200, period: 3 }] },
      { t: 95, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 250, opts: { hpScale: 1.35 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 500, opts: { hpScale: 1.35 } },
        { type: 'spawn', typeId: 'spawner', x: R + 200, y: 375 },
      ] },
      { t: 101, actions: [
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 1000, y: 500, gap: 90, opts: { entry: 'bottom' } },
        { type: 'flow', typeId: 'small', count: 8, every: 480, y: 200, amp: 60, period: 2 },
      ] },
      { t: 108, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 360, amp: 220, period: 6 }] },
      { t: 112, actions: [
        { type: 'group', typeId: 'small', count: 7, pattern: 'v', x: R, y: 360, gap: 70, opts: { hpScale: 1.25, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 360, opts: { hpScale: 1.35 } },
      ] },
      { t: 117, actions: [{ type: 'group', typeId: 'small', count: 3, pattern: 'line', x: 880, y: 200, gap: 130, opts: { entry: 'top' } }] },
      { t: 124, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'stream', x: R, y: 320, interval: 400, opts: { hpScale: 1.2 } },
        { type: 'spawn', typeId: 'rusher', x: R + 250, y: 450, opts: { speedScale: 1.15 } },
      ] },
      { t: 129, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 450, amp: 160, period: 2 }] },
      { t: 136, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 280, opts: { hpScale: 1.3 } },
        { type: 'spawn', typeId: 'elite', x: R + 220, y: 480, opts: { hpScale: 1.3 } },
      ] },
      { t: 140, actions: [{ type: 'flow', typeId: 'small', count: 8, every: 480, y: 360, amp: 220, period: 5 }] },
      { t: 146, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 150, actions: [{ type: 'midboss', bossId: 'midboss_dark' }] },
      { t: 154, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 158, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 250, opts: { hpScale: 1.3 } },
        { type: 'spawn', typeId: 'shield', x: R, y: 450, opts: { hpScale: 1.35 } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'stream', x: R + 150, y: 350, interval: 450 },
      ] },
      { t: 163, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 360, amp: 220, period: 2 }] },
      { t: 170, actions: [
        { type: 'spawn', typeId: 'turret', x: 1140, y: 300, opts: { hpScale: 1.4, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 200, opts: { hpScale: 1.25, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520, opts: { hpScale: 1.25, speedScale: 1.1 } },
      ] },
      { t: 175, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 760, y: 360, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'small', count: 7, every: 480, y: 600, amp: 30, period: 2 },
      ] },
      { t: 182, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'arc', x: R, y: 360, gap: 70, opts: { hpScale: 1.25 } },
        { type: 'spawn', typeId: 'elite', x: R + 250, y: 360, opts: { hpScale: 1.3 } },
      ] },
      { t: 188, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 250, amp: 150, period: 3 }] },
      { t: 194, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 360, opts: { hpScale: 1.4 } },
        { type: 'spawn', typeId: 'turret', x: 1160, y: 200, opts: { hpScale: 1.4 } },
        { type: 'spawn', typeId: 'turret', x: 1210, y: 540, opts: { hpScale: 1.4 } },
      ] },
      { t: 199, actions: [
        { type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: 980, y: 240, gap: 80, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'small', count: 8, every: 440, y: 560, amp: 60, period: 2 },
      ] },
      { t: 206, actions: [
        { type: 'group', typeId: 'small', count: 6, pattern: 'line', x: R, y: 280, gap: 70, opts: { hpScale: 1.3, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'rusher', x: R + 200, y: 450, opts: { hpScale: 1.3 } },
      ] },
      { t: 211, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 360, y: 360, amp: 220, period: 2 }] },
      { t: 216, actions: [{ type: 'pause', dur: 3 }] },
      { t: 219, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 225, actions: [{ type: 'boss', bossId: 'boss_maiden' }] },
    ],
  },
  // -- Stage 5 백귀야시 (market, ~4분, 보스 t=225) ----------------------------------
  {
    id: 'market',
    nameKor: '백귀야시',
    nameEng: 'HUNDRED-GHOST NIGHT MARKET',
    theme: 'market',
    music: 'stage5',
    waves: [
      { t: 1, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 2, actions: [
        { type: 'group', typeId: 'wisp', count: 6, pattern: 'v', x: R, y: 360, gap: 70, opts: { hpScale: 1.3 } },
      ] },
      { t: 5.5, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 410, y: 360, amp: 220, period: 6 }] },
      { t: 10, actions: [
        { type: 'group', typeId: 'wisp', count: 5, pattern: 'stream', x: R, y: 200, interval: 380, opts: { hpScale: 1.3, speedScale: 1.1 } },
        { type: 'group', typeId: 'wisp', count: 5, pattern: 'stream', x: R, y: 520, interval: 380, opts: { hpScale: 1.3, speedScale: 1.1 } },
      ] },
      { t: 15, actions: [{ type: 'flow', typeId: 'wisp', count: 9, every: 410, y: 360 }] },
      { t: 20, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 300, opts: { hpScale: 1.3, tint: 0xffc8a0 } },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'line', x: R + 200, y: 500, gap: 85, opts: { hpScale: 1.3, tint: 0xffb0b0 } },
      ] },
      { t: 24, actions: [
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 860, y: 170, gap: 110, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'wisp', count: 8, every: 450, y: 560, amp: 40, period: 2 },
      ] },
      { t: 31, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 250, opts: { hpScale: 1.35, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'turret', x: 1170, y: 500, opts: { hpScale: 1.35, tint: 0xffb080 } },
      ] },
      { t: 36, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 380, y: 300, amp: 200, period: 2 }] },
      { t: 42, actions: [
        { type: 'group', typeId: 'wisp', count: 8, pattern: 'arc', x: R, y: 360, gap: 65, opts: { hpScale: 1.35, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'rusher', x: R + 220, y: 220, opts: { hpScale: 1.3, speedScale: 1.15 } },
      ] },
      { t: 46, actions: [
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 760, y: 600, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'wisp', count: 8, every: 450, y: 160, amp: 40, period: 2 },
      ] },
      { t: 53, actions: [
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 1000, y: 500, gap: 90, opts: { entry: 'bottom', tint: 0xffb0b0 } },
        { type: 'flow', typeId: 'wisp', count: 9, every: 410, y: 250, amp: 100, period: 5 },
      ] },
      { t: 56, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 300, opts: { hpScale: 1.4, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 460, opts: { hpScale: 1.4, tint: 0xffc8a0 } },
        { type: 'group', typeId: 'wisp', count: 5, pattern: 'stream', x: R + 200, y: 360, interval: 400, opts: { hpScale: 1.3 } },
      ] },
      { t: 62, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 380, y: 360, amp: 220, period: 3 }] },
      { t: 68, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 220, opts: { hpScale: 1.35, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'elite', x: R + 220, y: 500, opts: { hpScale: 1.35, tint: 0xffc8a0 } },
      ] },
      { t: 73, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 380, y: 360, amp: 220, period: 2 }] },
      { t: 81, actions: [
        { type: 'group', typeId: 'wisp', count: 7, pattern: 'line', x: R, y: 260, gap: 65, opts: { hpScale: 1.35 } },
        { type: 'group', typeId: 'wisp', count: 7, pattern: 'line', x: R + 120, y: 460, gap: 65, opts: { hpScale: 1.35 } },
        { type: 'spawn', typeId: 'turret', x: 1180, y: 360, opts: { hpScale: 1.4, tint: 0xffb080 } },
      ] },
      { t: 87, actions: [
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 840, y: 150, gap: 110, opts: { entry: 'top' } },
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 900, y: 570, gap: 110, opts: { entry: 'bottom' } },
      ] },
      { t: 94, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 220, opts: { hpScale: 1.35, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 500, opts: { hpScale: 1.35, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'spawner', x: R + 200, y: 360, opts: { hpScale: 1.4, tint: 0xffc8a0 } },
      ] },
      { t: 99, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 340, y: 360, amp: 220, period: 6 }] },
      { t: 106, actions: [{ type: 'flow', typeId: 'wisp', count: 9, every: 380, y: 300, amp: 160, period: 2 }] },
      { t: 112, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 115, actions: [{ type: 'midboss', bossId: 'midboss_fox' }] },
      { t: 119, actions: [{ type: 'scroll', speed: 1 }] },
      { t: 123, actions: [
        { type: 'group', typeId: 'wisp', count: 8, pattern: 'v', x: R, y: 360, gap: 62, opts: { hpScale: 1.4, speedScale: 1.15 } },
        { type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R + 250, y: 360, gap: 75, opts: { hpScale: 1.4, tint: 0xffb0b0 } },
      ] },
      { t: 127, actions: [
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 760, y: 150, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'wisp', count: 10, every: 340, y: 560, amp: 60, period: 2 },
      ] },
      { t: 136, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 360, opts: { hpScale: 1.4, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'turret', x: 1140, y: 200, opts: { hpScale: 1.45, tint: 0xffb080 } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 540, opts: { hpScale: 1.45, tint: 0xffb080 } },
      ] },
      { t: 142, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 340, y: 360, amp: 220, period: 3 }] },
      { t: 150, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 360, opts: { hpScale: 1.45, tint: 0xffc8a0 } },
        { type: 'group', typeId: 'wisp', count: 6, pattern: 'stream', x: R + 100, y: 200, interval: 360, opts: { hpScale: 1.4 } },
        { type: 'group', typeId: 'wisp', count: 6, pattern: 'stream', x: R + 100, y: 520, interval: 360, opts: { hpScale: 1.4 } },
      ] },
      { t: 157, actions: [
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 860, y: 200, gap: 110, opts: { entry: 'top' } },
        { type: 'group', typeId: 'wisp', count: 4, pattern: 'line', x: 760, y: 570, gap: 100, opts: { entry: 'back' } },
      ] },
      { t: 164, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 260, opts: { hpScale: 1.45, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'rusher', x: R + 150, y: 470, opts: { hpScale: 1.4, speedScale: 1.2 } },
        { type: 'spawn', typeId: 'elite', x: R + 260, y: 360, opts: { hpScale: 1.4, tint: 0xffc8a0 } },
      ] },
      { t: 170, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 340, y: 300, amp: 200, period: 2 }] },
      { t: 178, actions: [
        { type: 'group', typeId: 'wisp', count: 9, pattern: 'arc', x: R, y: 360, gap: 60, opts: { hpScale: 1.45, speedScale: 1.2 } },
      ] },
      { t: 184, actions: [{ type: 'flow', typeId: 'wisp', count: 10, every: 340, y: 450, amp: 200, period: 6 }] },
      { t: 190, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 250, opts: { hpScale: 1.5, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 470, opts: { hpScale: 1.5, tint: 0xffc8a0 } },
        { type: 'spawn', typeId: 'turret', x: 1170, y: 360, opts: { hpScale: 1.5, tint: 0xffb080 } },
      ] },
      { t: 196, actions: [
        { type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: 980, y: 240, gap: 80, opts: { entry: 'top', tint: 0xffb0b0 } },
        { type: 'flow', typeId: 'wisp', count: 9, every: 380, y: 560, amp: 50, period: 2 },
      ] },
      { t: 204, actions: [{ type: 'pause', dur: 3 }] },
      { t: 210, actions: [{ type: 'scroll', speed: 0.25 }] },
      { t: 214, actions: [{ type: 'boss', bossId: 'boss_lantern' }] },
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
      { t: 5.5, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 400, y: 360, amp: 220, period: 6 }] },
      { t: 11, actions: [
        { type: 'spawn', typeId: 'rusher', x: R, y: 300, opts: { hpScale: 1.4, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 460, opts: { hpScale: 1.4, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'turret', x: 1150, y: 380, opts: { hpScale: 1.4 } },
      ] },
      { t: 14, actions: [
        { type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: 980, y: 240, gap: 80, opts: { entry: 'top' } },
        { type: 'flow', typeId: 'small', count: 8, every: 400, y: 560, amp: 60, period: 2 },
      ] },
      { t: 21, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 360, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'elite', x: R + 200, y: 250, opts: { hpScale: 1.35 } },
      ] },
      { t: 25, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 760, y: 160, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'small', count: 8, every: 400, y: 520, amp: 80, period: 2 },
      ] },
      { t: 32, actions: [
        { type: 'spawn', typeId: 'spawner', x: R, y: 450, opts: { hpScale: 1.4 } },
        { type: 'group', typeId: 'bat', count: 5, pattern: 'arc', x: R, y: 300, gap: 75, opts: { hpScale: 1.35, speedScale: 1.1 } },
      ] },
      { t: 36, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 360, y: 300, amp: 220, period: 2 }] },
      { t: 40, actions: [{ type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 860, y: 540, gap: 110, opts: { entry: 'bottom' } }] },
      { t: 44, actions: [{ type: 'flow', typeId: 'small', count: 9, every: 360, y: 360, amp: 220, period: 3 }] },
      { t: 47, actions: [
        { type: 'group', typeId: 'small', count: 7, pattern: 'stream', x: R, y: 360, interval: 400, opts: { hpScale: 1.45, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'turret', x: 1140, y: 220, opts: { hpScale: 1.45, tint: 0xd8c8ff } },
        { type: 'spawn', typeId: 'turret', x: 1200, y: 540, opts: { hpScale: 1.45, tint: 0xd8c8ff } },
      ] },
      { t: 52, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 760, y: 560, gap: 100, opts: { entry: 'back' } },
        { type: 'group', typeId: 'bat', count: 3, pattern: 'v', x: 1000, y: 220, gap: 90, opts: { entry: 'top' } },
      ] },
      { t: 58, actions: [
        { type: 'spawn', typeId: 'elite', x: R, y: 300, opts: { hpScale: 1.4 } },
        { type: 'spawn', typeId: 'elite', x: R + 220, y: 480, opts: { hpScale: 1.4 } },
      ] },
      { t: 63, actions: [{ type: 'flow', typeId: 'small', count: 10, every: 360, y: 360, amp: 220, period: 7 }] },
      { t: 70, actions: [
        { type: 'spawn', typeId: 'shield', x: R, y: 250, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'shield', x: R + 120, y: 500, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 375, opts: { hpScale: 1.4, speedScale: 1.15 } },
      ] },
      { t: 75, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 840, y: 160, gap: 110, opts: { entry: 'top' } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 880, y: 560, gap: 110, opts: { entry: 'bottom' } },
        { type: 'flow', typeId: 'small', count: 8, every: 400, y: 360, amp: 100, period: 5 },
      ] },
      { t: 82, actions: [
        { type: 'group', typeId: 'bat', count: 6, pattern: 'v', x: R, y: 360, gap: 70, opts: { hpScale: 1.4, speedScale: 1.1 } },
        { type: 'spawn', typeId: 'spawner', x: R + 200, y: 360, opts: { hpScale: 1.45 } },
      ] },
      { t: 88, actions: [{ type: 'flow', typeId: 'small', count: 10, every: 320, y: 300, amp: 220, period: 2 }] },
      { t: 95, actions: [
        { type: 'group', typeId: 'small', count: 6, pattern: 'arc', x: R, y: 360, gap: 70, opts: { hpScale: 1.5, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'elite', x: R + 200, y: 360, opts: { hpScale: 1.45 } },
      ] },
      { t: 100, actions: [
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 760, y: 150, gap: 100, opts: { entry: 'back' } },
        { type: 'group', typeId: 'small', count: 4, pattern: 'line', x: 800, y: 570, gap: 100, opts: { entry: 'back' } },
        { type: 'flow', typeId: 'small', count: 9, every: 360, y: 360, amp: 160, period: 3 },
      ] },
      { t: 108, actions: [
        { type: 'spawn', typeId: 'turret', x: 1150, y: 360, opts: { hpScale: 1.5 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 220, opts: { hpScale: 1.45, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'rusher', x: R, y: 520, opts: { hpScale: 1.45, speedScale: 1.15 } },
        { type: 'spawn', typeId: 'shield', x: R + 150, y: 370, opts: { hpScale: 1.5 } },
      ] },
      { t: 114, actions: [
        { type: 'flow', typeId: 'small', count: 10, every: 320, y: 360, amp: 220, period: 7 },
        { type: 'group', typeId: 'bat', count: 4, pattern: 'v', x: 1000, y: 500, gap: 80, opts: { entry: 'bottom' } },
      ] },
      { t: 122, actions: [{ type: 'pause', dur: 3 }] },
      { t: 125, actions: [{ type: 'scroll', speed: 0.2 }] },
      { t: 130, actions: [{ type: 'scroll', speed: 0 }] },
      { t: 135, actions: [{ type: 'boss', bossId: 'final_moo' }] },
    ],
  },
];
