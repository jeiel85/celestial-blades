/**
 * 플레이어 캐릭터 정의. 캐릭터 선택 UI가 이 문구를 그대로 표시한다.
 */

export type CharacterId = 'yun' | 'ryeohwa' | 'mooyoung';

export interface CharacterStats {
  /** 공격력 1~5 */
  power: number;
  /** 이동 속도 1~5 */
  speed: number;
  /** 공격 범위 1~5 */
  range: number;
}

export interface CharacterDef {
  id: CharacterId;
  /** 캐릭터 선택 인덱스 (0..2) */
  index: number;
  nameKor: string;
  nameEng: string;
  title: string;
  color: number;
  desc: string;
  stats: CharacterStats;
  chargeDesc: string;
  specialDesc: string;
  bombDesc: string;
  /** 기본 공격 연사 간격 (ms) */
  shotIntervalMs: number;
  /** 기본탄 대미지 배율 (캐릭터 간 DPS 조정용) */
  damageMult: number;
  texture: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'yun',
    index: 0,
    nameKor: '윤',
    nameEng: 'YUN',
    title: '균형의 검사',
    color: 0x4db2ff,
    desc: '빠른 직선 검기로 정면을 제압하는 균형형 검사. 다루기 쉬워 첫 비행에 가장 좋다.',
    stats: { power: 3, speed: 3, range: 3 },
    chargeDesc: '차지: 거대 초승달 검기 — 적탄을 소거하며 돌진하는 일섬',
    specialDesc: '기본 공격: 빠른 직선 검기, 파워가 오르면 검기가 늘어난다',
    bombDesc: '필살: 천명검진 — 2초간 거대 검진이 전방을 휩쓴다',
    shotIntervalMs: 110,
    damageMult: 1.0,
    texture: 'player_yun',
  },
  {
    id: 'ryeohwa',
    index: 1,
    nameKor: '려화',
    nameEng: 'RYEOHWA',
    title: '화염의 술사',
    color: 0xff7b2d,
    desc: '세 갈래 화염탄으로 넓은 하늘을 덮는 술사. 단일 화력은 낮지만 맞추기 쉽다.',
    stats: { power: 2, speed: 3, range: 5 },
    chargeDesc: '차지: 유도 화염조 5~7기 — 적을 자동 추격',
    specialDesc: '기본 공격: 3갈래 화염탄, 파워가 오르면 갈래와 화력이 늘어난다',
    bombDesc: '필살: 홍련화재 — 불기둥 8~12연발',
    shotIntervalMs: 150,
    damageMult: 0.85,
    texture: 'player_ryeohwa',
  },
  {
    id: 'mooyoung',
    index: 2,
    nameKor: '무영',
    nameEng: 'MOOYOUNG',
    title: '그림자의 암살자',
    color: 0xa06bff,
    desc: '매우 빠른 수리검으로 한 점을 꿰뚫는 암살자. 범위는 좁지만 DPS가 가장 높다.',
    stats: { power: 5, speed: 5, range: 2 },
    chargeDesc: '차지: 전방 돌진 — 경로상 적 대미지, 순간 무적',
    specialDesc: '기본 공격: 초고속 직선 수리검, 파워가 오르면 연사 속도가 올라간다',
    bombDesc: '필살: 백귀야행 — 잔상 다수가 화면을 가로지르며 벤다',
    shotIntervalMs: 85,
    damageMult: 1.15,
    texture: 'player_mooyoung',
  },
];

export function getCharacter(index: number): CharacterDef {
  const clamped = Math.min(CHARACTERS.length - 1, Math.max(0, Math.floor(index)));
  return CHARACTERS[clamped];
}
