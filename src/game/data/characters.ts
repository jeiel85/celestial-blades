/**
 * 플레이어 캐릭터 정의. 캐릭터 선택 UI가 이 문구를 그대로 표시한다.
 * 숨겨진 캐릭터(hidden)는 반드시 목록 끝에 둔다 — 해금 전에는 앞쪽 일반 캐릭터만 잘라 쓰므로
 * 선택 인덱스가 해금 여부와 관계없이 같은 캐릭터를 가리킨다.
 */

export type CharacterId = 'yun' | 'ryeohwa' | 'mooyoung' | 'soyul' | 'haerang' | 'hyegak' | 'seori';

export interface CharacterStats {
  /** 이동 속도 1~5 (speedScale로 실제 배율이 된다). 공격력은 measured.bossDps(실측)로 보여 준다. */
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
  /** 따라다니며 함께 쏘는 식신(텐가이식 옵션) 그림 */
  familiar: string;
  familiarName: string;
  /** 엔딩 후일담 일러스트 */
  ending: string;
  /** 필살기 컷인 일러스트 */
  cutin: string;
  /** 필살기 이름(컷인에 표시) */
  bombName: string;
  bombNameEng: string;
  /** 숨겨진 캐릭터: 1회 클리어하거나 선택 화면 비밀 커맨드로 해금된다 */
  hidden?: boolean;
  /** 피격 판정 원 반지름(기본 6). 숨겨진 캐릭터의 약점으로 키운다. */
  hitRadius?: number;
  /** 지닐 수 있는 필살기 수 상한(기본 MAX_BOMBS) */
  maxBombs?: number;
  /**
   * 실측 수치(선택 화면 표시용). tools/bench.mjs로 잰 값: 파워 3으로 1스테이지 중간보스를
   * 따라다니며 계속 쏠 때 보스가 받은 초당 피해, 필살기 1회가 보스에 준 피해(6회 평균).
   * 화력·보스 HP를 바꾸면 다시 재서 고친다.
   */
  measured: { bossDps: number; bombDamage: number };
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
    stats: { speed: 3, range: 3 },
    chargeDesc: '차지: 거대 초승달 검기 — 적탄을 소거하며 돌진하는 일섬',
    specialDesc: '기본 공격: 빠른 직선 검기, 파워가 오르면 검기가 늘어난다',
    bombDesc: '필살: 천명검진 — 2초간 거대 검진이 전방을 휩쓴다',
    shotIntervalMs: 110,
    damageMult: 1.07,
    texture: 'player_yun',
    portrait: 'portrait_yun',
    select: 'select_yun',
    familiar: 'familiar_yun',
    familiarName: '검령',
    shotTexture: 'shot_ki',
    ending: 'ending_yun',
    cutin: 'cutin_yun',
    bombName: '천명검진',
    bombNameEng: 'HEAVENLY SWORD FORMATION',
    measured: { bossDps: 45, bombDamage: 180 },
  },
  {
    id: 'ryeohwa',
    index: 1,
    nameKor: '려화',
    nameEng: 'RYEOHWA',
    title: '화염의 술사',
    color: 0xff7b2d,
    desc: '세 갈래 화염탄으로 넓은 하늘을 덮는 술사. 단일 화력은 낮지만 맞추기 쉽다.',
    stats: { speed: 3, range: 5 },
    chargeDesc: '차지: 유도 화염조 5~7기 — 적을 자동 추격',
    specialDesc: '기본 공격: 3갈래 화염탄, 파워가 오르면 갈래와 화력이 늘어난다',
    bombDesc: '필살: 홍련화재 — 불기둥 8~12연발',
    shotIntervalMs: 150,
    damageMult: 2.2,
    texture: 'player_ryeohwa',
    portrait: 'portrait_ryeohwa',
    select: 'select_ryeohwa',
    familiar: 'familiar_ryeohwa',
    familiarName: '화조',
    shotTexture: 'shot_flame',
    ending: 'ending_ryeohwa',
    cutin: 'cutin_ryeohwa',
    bombName: '홍련화재',
    bombNameEng: 'CRIMSON LOTUS INFERNO',
    measured: { bossDps: 35, bombDamage: 170 },
  },
  {
    id: 'mooyoung',
    index: 2,
    nameKor: '무영',
    nameEng: 'MOOYOUNG',
    title: '그림자의 암살자',
    color: 0xa06bff,
    desc: '매우 빠른 수리검으로 한 점을 꿰뚫는 암살자. 범위는 좁지만 DPS가 가장 높다.',
    stats: { speed: 5, range: 2 },
    chargeDesc: '차지: 전방 돌진 — 경로상 적 대미지, 순간 무적',
    specialDesc: '기본 공격: 초고속 직선 수리검, 파워가 오르면 연사 속도가 올라간다',
    bombDesc: '필살: 백귀야행 — 잔상 다수가 화면을 가로지르며 벤다',
    shotIntervalMs: 85,
    damageMult: 0.85,
    texture: 'player_mooyoung',
    portrait: 'portrait_mooyoung',
    select: 'select_mooyoung',
    familiar: 'familiar_mooyoung',
    familiarName: '그림자 고양이',
    shotTexture: 'shot_kunai',
    ending: 'ending_mooyoung',
    cutin: 'cutin_mooyoung',
    bombName: '백귀야행',
    bombNameEng: 'NIGHT PARADE OF A HUNDRED GHOSTS',
    measured: { bossDps: 57, bombDamage: 180 },
  },
  {
    id: 'soyul',
    index: 3,
    nameKor: '소율',
    nameEng: 'SOYUL',
    title: '관통의 궁수',
    color: 0x53e0b0,
    desc: '적을 꿰뚫고 지나가는 화살로 줄지어 오는 적을 한 번에 꿰는 궁수. 연사는 느리지만 한 발이 무겁다.',
    stats: { speed: 2, range: 3 },
    chargeDesc: '차지: 천궁일시 — 화면 끝까지 꿰뚫는 거대 화살, 적탄을 가르며 나간다',
    specialDesc: '기본 공격: 관통 화살, 파워가 오르면 화살 수와 관통 수가 늘어난다',
    bombDesc: '필살: 유성시우 — 하늘에서 화살비가 3초간 쏟아진다',
    shotIntervalMs: 160,
    damageMult: 1.35,
    texture: 'player_soyul',
    portrait: 'portrait_soyul',
    select: 'select_soyul',
    familiar: 'familiar_soyul',
    familiarName: '옥매',
    shotTexture: 'shot_arrow',
    ending: 'ending_soyul',
    cutin: 'cutin_soyul',
    bombName: '유성시우',
    bombNameEng: 'METEOR ARROW RAIN',
    measured: { bossDps: 43, bombDamage: 180 },
  },
  {
    id: 'haerang',
    index: 4,
    nameKor: '해랑',
    nameEng: 'HAERANG',
    title: '결계의 술사',
    color: 0xffe08a,
    desc: '부적을 앞뒤로 흩뿌리며 결계로 몸을 지키는 술사. 화력은 가장 낮지만 실수를 덮어 주는 힘이 있다.',
    stats: { speed: 3, range: 4 },
    chargeDesc: '차지: 호신결계 — 1.6초간 주변 적탄을 지우는 결계를 두른다',
    specialDesc: '기본 공격: 앞으로 퍼지는 부적 + 뒤쪽 견제 부적, 파워가 오르면 부적이 늘어난다',
    bombDesc: '필살: 사신결계 — 네 수호신의 결계가 퍼지며 화면을 정화한다',
    shotIntervalMs: 130,
    damageMult: 0.65,
    texture: 'player_haerang',
    portrait: 'portrait_haerang',
    select: 'select_haerang',
    familiar: 'familiar_haerang',
    familiarName: '종이 인형',
    shotTexture: 'shot_talisman',
    ending: 'ending_haerang',
    cutin: 'cutin_haerang',
    bombName: '사신결계',
    bombNameEng: 'FOUR GUARDIANS WARD',
    measured: { bossDps: 34, bombDamage: 180 },
  },
  {
    id: 'hyegak',
    index: 5,
    nameKor: '혜각',
    nameEng: 'HYEGAK',
    title: '금강의 파계승',
    color: 0xe8a33d,
    desc: '천명각을 떠나 요괴를 쫓던 파계승. 법륜의 위력은 누구보다 강하지만 멀리 닿지 않고, 몸이 무거워 느리다.',
    stats: { speed: 1, range: 1 },
    chargeDesc: '차지: 금강장 — 적탄을 부수며 나아가는 거대 법륜, 사거리는 짧다',
    specialDesc: '기본 공격: 적을 꿰뚫는 법륜, 화면 절반쯤에서 사라진다. 파워가 오르면 법륜이 늘어난다',
    bombDesc: '필살: 금강항마진 — 주변을 연거푸 내리치는 금강의 충격파, 가까울수록 강하다',
    shotIntervalMs: 150,
    damageMult: 2.1,
    texture: 'player_hyegak',
    portrait: 'portrait_hyegak',
    select: 'select_hyegak',
    familiar: 'familiar_hyegak',
    familiarName: '금강저',
    shotTexture: 'shot_ring',
    ending: 'ending_hyegak',
    cutin: 'cutin_hyegak',
    bombName: '금강항마진',
    bombNameEng: 'VAJRA DEMON-SUBDUING ARRAY',
    measured: { bossDps: 73, bombDamage: 180 },
    hidden: true,
  },
  {
    id: 'seori',
    index: 6,
    nameKor: '서리',
    nameEng: 'SEORI',
    title: '야생의 반요',
    color: 0xff6b8b,
    desc: '산을 태운 요괴를 쫓아온 반요 여우. 여우불은 끝까지 쫓아가 박히지만, 몸이 커 맞기 쉽고 필살기를 2개까지만 지닌다.',
    stats: { speed: 5, range: 5 },
    chargeDesc: '차지: 월광조 — 적탄을 찢는 세 줄기 손톱 참격',
    specialDesc: '기본 공격: 적을 끈질기게 쫓는 여우불, 파워가 오르면 여우불이 늘어난다',
    bombDesc: '필살: 구미호염 — 아홉 꼬리 여우불이 흩어졌다 적에게 꽂힌다',
    shotIntervalMs: 120,
    damageMult: 1.0,
    texture: 'player_seori',
    portrait: 'portrait_seori',
    select: 'select_seori',
    familiar: 'familiar_seori',
    familiarName: '아기 여우',
    shotTexture: 'shot_foxfire',
    ending: 'ending_seori',
    cutin: 'cutin_seori',
    bombName: '구미호염',
    bombNameEng: 'NINE-TAILED FOXFIRE',
    measured: { bossDps: 61, bombDamage: 190 },
    hidden: true,
    hitRadius: 9,
    maxBombs: 2,
  },
];

/** 일반 캐릭터 수. 숨겨진 캐릭터는 이 뒤에 온다. */
export const BASE_CHARACTER_COUNT = CHARACTERS.filter((c) => !c.hidden).length;

/** 선택 화면·다시보기에 보이는 캐릭터 목록(숨겨진 캐릭터는 해금 후에만) */
export function pilotRoster(hiddenUnlocked: boolean): CharacterDef[] {
  return hiddenUnlocked ? CHARACTERS : CHARACTERS.slice(0, BASE_CHARACTER_COUNT);
}

/** 속도 능력치(1~5)별 이동 속도 배율. 3이 기준(PLAYER_SPEED). */
const SPEED_SCALE = [0.86, 0.93, 1, 1.07, 1.14];

/** 이동 속도 배율(집중 전) */
export function speedScale(def: CharacterDef): number {
  return SPEED_SCALE[Math.min(5, Math.max(1, def.stats.speed)) - 1];
}

/** 저장값·씬 데이터에서 온 캐릭터 번호를 범위 안으로 맞춘다. */
export function clampCharIndex(index: unknown): number {
  const n = typeof index === 'number' && Number.isFinite(index) ? Math.floor(index) : 0;
  return Math.min(CHARACTERS.length - 1, Math.max(0, n));
}

export function getCharacter(index: number): CharacterDef {
  return CHARACTERS[clampCharIndex(index)];
}
