/**
 * 플레이어 캐릭터 정의. 캐릭터 선택 UI가 이 문구를 그대로 표시한다.
 */

export type CharacterId = 'yun' | 'ryeohwa' | 'mooyoung' | 'soyul' | 'haerang';

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
  /** 캐릭터 선택 인덱스 (0..CHARACTERS.length-1) */
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
  /** 랭킹 목록 아이콘 등에 쓰는 초상화 */
  portrait: string;
  /** 캐릭터 선택 화면의 큰 기체 그림 */
  select: string;
  /** 기본 공격 탄 텍스처(선택 화면 미리보기) */
  shotTexture: string;
  /** 엔딩 후일담 일러스트 */
  ending: string;
  /** 필살기 컷인 일러스트 */
  cutin: string;
  /** 필살기 이름(컷인에 표시) */
  bombName: string;
  bombNameEng: string;
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
    portrait: 'portrait_yun',
    select: 'select_yun',
    shotTexture: 'shot_ki',
    ending: 'ending_yun',
    cutin: 'cutin_yun',
    bombName: '천명검진',
    bombNameEng: 'HEAVENLY SWORD FORMATION',
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
    portrait: 'portrait_ryeohwa',
    select: 'select_ryeohwa',
    shotTexture: 'shot_flame',
    ending: 'ending_ryeohwa',
    cutin: 'cutin_ryeohwa',
    bombName: '홍련화재',
    bombNameEng: 'CRIMSON LOTUS INFERNO',
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
    portrait: 'portrait_mooyoung',
    select: 'select_mooyoung',
    shotTexture: 'shot_kunai',
    ending: 'ending_mooyoung',
    cutin: 'cutin_mooyoung',
    bombName: '백귀야행',
    bombNameEng: 'NIGHT PARADE OF A HUNDRED GHOSTS',
  },
  {
    id: 'soyul',
    index: 3,
    nameKor: '소율',
    nameEng: 'SOYUL',
    title: '관통의 궁수',
    color: 0x53e0b0,
    desc: '적을 꿰뚫고 지나가는 화살로 줄지어 오는 적을 한 번에 꿰는 궁수. 연사는 느리지만 한 발이 무겁다.',
    stats: { power: 4, speed: 2, range: 3 },
    chargeDesc: '차지: 천궁일시 — 화면 끝까지 꿰뚫는 거대 화살, 적탄을 가르며 나간다',
    specialDesc: '기본 공격: 관통 화살, 파워가 오르면 화살 수와 관통 수가 늘어난다',
    bombDesc: '필살: 유성시우 — 하늘에서 화살비가 3초간 쏟아진다',
    shotIntervalMs: 160,
    damageMult: 1.35,
    texture: 'player_soyul',
    portrait: 'portrait_soyul',
    select: 'select_soyul',
    shotTexture: 'shot_arrow',
    ending: 'ending_soyul',
    cutin: 'cutin_soyul',
    bombName: '유성시우',
    bombNameEng: 'METEOR ARROW RAIN',
  },
  {
    id: 'haerang',
    index: 4,
    nameKor: '해랑',
    nameEng: 'HAERANG',
    title: '결계의 술사',
    color: 0xffe08a,
    desc: '부적을 앞뒤로 흩뿌리며 결계로 몸을 지키는 술사. 화력은 가장 낮지만 실수를 덮어 주는 힘이 있다.',
    stats: { power: 2, speed: 3, range: 4 },
    chargeDesc: '차지: 호신결계 — 1.6초간 주변 적탄을 지우는 결계를 두른다',
    specialDesc: '기본 공격: 앞으로 퍼지는 부적 + 뒤쪽 견제 부적, 파워가 오르면 부적이 늘어난다',
    bombDesc: '필살: 사신결계 — 네 수호신의 결계가 퍼지며 화면을 정화한다',
    shotIntervalMs: 130,
    damageMult: 0.8,
    texture: 'player_haerang',
    portrait: 'portrait_haerang',
    select: 'select_haerang',
    shotTexture: 'shot_talisman',
    ending: 'ending_haerang',
    cutin: 'cutin_haerang',
    bombName: '사신결계',
    bombNameEng: 'FOUR GUARDIANS WARD',
  },
];

/** 저장값·씬 데이터에서 온 캐릭터 번호를 범위 안으로 맞춘다. */
export function clampCharIndex(index: unknown): number {
  const n = typeof index === 'number' && Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.min(CHARACTERS.length - 1, Math.max(0, n));
}

export function getCharacter(index: number): CharacterDef {
  return CHARACTERS[clampCharIndex(index)];
}
