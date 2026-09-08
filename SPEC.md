# 천명비행록 : Celestial Blades — 구현 명세

1990년대 아케이드 횡스크롤 탄막 슈팅을 현대 웹으로 재해석한 **완성형 오리지널 게임**.
모든 그래픽은 런타임 절차 생성(외부 에셋 없음), 사운드는 Web Audio API 합성.

## 기술 스택 / 실행
- Phaser 3 (3.80+), TypeScript(strict), Vite, Arcade Physics, Web Audio, localStorage
- `npm run dev` (5173) / `npm run build` (tsc + vite build) 성공 필수
- 외부 서버/로그인 없음. 외부 이미지/음원 파일 금지.

## 해상도 / 화면
- 논리 해상도 **1280×720**, `Phaser.Scale.FIT` + `CENTER_BOTH`, 모바일에서도 깨지지 않게.
- HTML/CSS는 이미 작성되어 있음(index.html). body background #05070d.

## 게임 흐름 (씬)
Boot → Title → CharacterSelect → Game(stage 1) → (중간보스→보스→StageClear) → Game(stage 2) → Game(stage 3) → Game(final) → Ending
- Game Over 시 Result 씬: RETRY / TITLE. NEW HIGH SCORE 표시.
- 씬 키: `'Boot' | 'Title' | 'CharacterSelect' | 'Game' | 'Result' | 'Ending'`
- 씬 전달 데이터: CharacterSelect→Game `{charIndex, difficulty}`; Game→Result `{stageIndex, score, lives, bombs, power, charIndex, difficulty, cleared: boolean, gameOver: boolean}`; Result→Game(다음 스테이지, 상태 이월) / Result→Title / Result→Ending(스테이지 3 보스 격파 후).
- Ending 후 Title 복귀.

## 조작 (InputSystem)
- 이동: 화살표 + WASD / 집중: Shift(속도 55~65%) + 피격점(히트박스 코어) 표시
- 공격: Z 또는 Space (누르는 동안 연사, 1.2초 유지 시 최대 차지 → 떼면 차지공격)
- 필살기: X (스테이지 시작 2개, 최대 4개, 1.5초 무적 + 적탄 소거, 대미지는 밸런스 고려해 과도하지 않게)
- 일시정지: ESC (PAUSED 오버레이, 재개/타이틀)
- 게임패드: 스틱/패드 이동, A버튼 공격, B버튼 필살기 지원(가능한 범위)
- 디버그: F1 히트박스 표시, F2 무적, F3 현재 보스 호출, F4 다음 스테이지 (UI에는 노출 안 함)
- 모바일: 터치 기기에서만 좌측 가상 이동 영역(드래그), 우측 공격/필살기 버튼. PC 조작감 우선.

## 플레이어 캐릭터 (data/characters.ts, 48~80px, 실루엣 구분)
1. **윤 YUN** (균형 검사, 파랑) — 기본: 빠른 직선 검기 / 차지: 거대 초승달 검기(적탄 일부 소거) / 필살: 2초간 거대 검진 화면 전체 휩쓸기. 초보자용.
2. **려화 RYEOHWA** (화염 술사, 빨강/주황) — 기본: 3갈래 화염탄 / 차지: 자동 추적 화염조 5~7마리 / 필살: 화면 여러 지점 불기둥 연속. 넓은 범위, 단일 DPS는 윤보다 약간 낮음.
3. **무영 MOOYOUNG** (고속 암살자, 보라) — 기본: 매우 빠른 직선 수리검 / 차지: 전방 돌진(경로 대미지, 짧은 무적) / 필살: 잔상 다수가 화면을 가로지르며 공격. 최고 DPS, 좁은 범위, 고난도.
- 공격력/속도/범위 스탯 카드 + 차지공격 설명을 캐릭터 선택 화면에 표시.

## 전투 시스템
- **차지**: 버튼 홀드 1.2초에 최대 차지. 캐릭터 주위 차지 이펙트 명확히. 놓으면 발동. 차지 여부가 플레이에 실질 영향.
- **파워**: P 아이템으로 4단계(0~3). 단계마다 투사체 수/형태 변화. 피격 시 파워 1단계 하락.
- **목숨**: 기본 3(L 아이템 +1), 피격 시 1 감소 + 2초 무적, 0이면 Game Over. Continue 1회.
- **콤보**: 빠른 연속 처치 시 상승, 배율 증가, 피격/3초 무처치 시 초기화.
- **아이템**: P(공격력)/B(필살기+1)/L(목숨+1)/G(점수). 적 처치 시 확률 드롭, G는 위로 튀어 아래로 낙하.
- **점수**: 처치/보스 타격/아이템/콤보/노미스/클리어 보너스. HI-SCORE는 localStorage.

## 난이도 (시작 시 선택 EASY/NORMAL/HARD, NORMAL 기준)
- EASY: 탄속 0.8x, 탄 밀도 0.75x, 목숨 4
- HARD: 탄속 1.15x, 밀도 1.3x, 적 HP/조합 강화, 보스 패턴 강화
- localStorage에 선택 난이도/최근 캐릭터 저장.

## 적 (Enemy.ts + data/enemyPatterns.ts, 32~100px)
- 소형 비행 요괴(직선+조준탄), 박쥐형(사인곡선+3방향), 돌진형(조준 후 돌진), 포대형(느리게+원형탄막), 방패형(정면 저항/뒤·타이밍 공격에 약함), 소환형(소형 적 지속 생성), 엘리트(미니보스 패턴).
- 모든 적은 비행 애니메이션(부유/날개) + 피격 플래시 + 폭발.
- 데이터 기반: 타입별 이동/발사 패턴 함수. 랜덤 스폰이 아닌 **제작된 웨이브 타임라인**으로 리듬 구성(약한 무리→교차→포대→다수→휴식→엘리트).

## 스테이지 (data/stages.ts)
- 횡스크롤(좌→우), 플레이어는 화면 좌측 70% 영역, 스크롤 속도 변화(보스전 정지).
- **Stage 1 청운계곡**: 튜토리얼 리듬. 중간보스 거대 비행 가오리 요괴. 보스 **철갑귀 장군**(갑옷 비행 요괴) — P1 조준+직선탄, P2 부채꼴, P3(HP30%↓) 돌진+탄막 복합.
- **Stage 2 붉은 기계도시**: 톱니/기계문/비행선/붉은 등불 배경. 중간보스 거대 기계 지네. 보스 **홍련기관왕** — 미사일/레이저/원형탄막/부품분리, HP↓ 시 외장 파괴 후 코어 노출 연출.
- **Stage 3 천공성**: 가장 화려함. 강화 적 조합. 중간보스 타락한 천명사(플레이어와 유사 능력). 보스 **백야천녀** — 순간이동, 검기/원형탄막/추적탄/레이저/분신, HP↓ 시 화면 어두워지며 패턴 변화.
- **Final 천문**: 하늘의 균열. 보스 **무명천** — Phase1 인간형(정교한 탄막) → Phase2 용+새 결합 거대 신수형(배경이 움직이는 연출). 모든 패턴에 안전 경로 보장.

## 보스 설계 원칙 (Boss.ts + data/bossPatterns.ts, 150~400px)
- 보스마다 3개 이상 패턴, 시간/체력 기반 전환, 체력↓ 시 패턴 추가.
- 공격 전 경고(색 변화/오라/라인). 피할 수 없는 공격 금지.
- 등장: 적 정리 → WARNING → 이름 표시 → 등장 연출. 사망: 다중 폭발→흔들림→대폭발→히트스톱→제거.
- 보스전 상단에 보스 이름 + HP 바.
- **데이터 기반**: 패턴은 bossPatterns.ts의 공격 함수 레지스트리 + 페이즈 데이터로 정의.

## 탄막 디자인
- 원형/부채꼴/나선/조준/교차/웨이브/링/분열 등 시각적 규칙. 색·크기·속도로 위험도 구분. 수백 발 동시 존재 대응(Object Pooling 필수).

## 그래픽 (BootScene에서 절차 생성)
- 현대적 픽셀아트 풍. `Phaser.GameObjects.Graphics`/Canvas로 텍스처 생성. 단순 사각형 금지, 실루엣 구분 필수.
- 패럴랙스 4단계 이상/스테이지(하늘→먼 산→가까운 산→구름→전경 등, 서로 다른 속도).
- 캐릭터 상하 이동 기울임(팀 회전), 보스 등장/공격/피격/페이즈전환/사망 연출 구분.
- 이펙트: 피격 플래시, 폭발, 잔상, 화면 흔들림(과하지 않게), 히트스톱, 파티클, 탄 소거.

## 사운드 (AudioSystem, Web Audio 합성)
- 효과음: 기본공격/차지완료/차지공격/적 피격/적 폭발/플레이어 피격/아이템/필살기/보스 등장/보스 폭발/메뉴 선택. 음소거(M키) + Settings 볼륨. 간단한 절차 생성 BGM(스테이지/보스) 가능하면 추가.

## UI
- 상단 HUD: SCORE, HI-SCORE, LIFE, BOMB(필살기), POWER, COMBO. 아케이드 느낌 + 현대적 정돈.
- 스테이지 시작 타이틀 카드("STAGE 1 — 청운계곡"), Stage Clear(Enemy/Combo/NoMiss/Remaining Bonus 합산, 3~5초 후 자동 진행 + 스킵 가능).

## 타이틀 화면
- 로고, START GAME, HOW TO PLAY, SETTINGS, HI-SCORE 표시. SETTINGS: Master/SFX Volume, Screen Shake, Difficulty, Fullscreen.

## 저장 (SaveSystem, localStorage key `celestial-blades-save`)
- hiscore, settings(masterVol, sfxVol, shake, difficulty), lastChar. 새로고침 후 유지.

## 코드 구조 (이 구조 준수)
```
src/main.ts
src/game/GameConfig.ts            // 상수(W/H, 색 팔레트, 밸런스 수치)
src/game/scenes/BootScene.ts      // 전체 텍스처 절차 생성
src/game/scenes/TitleScene.ts
src/game/scenes/CharacterSelectScene.ts
src/game/scenes/GameScene.ts
src/game/scenes/ResultScene.ts
src/game/scenes/EndingScene.ts
src/game/entities/Player.ts
src/game/entities/Enemy.ts
src/game/entities/Boss.ts
src/game/entities/Bullet.ts
src/game/items/Item.ts
src/game/systems/EnemySpawner.ts
src/game/systems/ScoreSystem.ts
src/game/systems/AudioSystem.ts
src/game/systems/SaveSystem.ts
src/game/systems/InputSystem.ts
src/game/effects/Effects.ts       // 폭발/플래시/히트스톱/쉐이크/파티클 헬퍼
src/game/backgrounds/Parallax.ts
src/game/data/characters.ts
src/game/data/stages.ts
src/game/data/enemyPatterns.ts
src/game/data/bossPatterns.ts
src/game/utils/Pool.ts
```

## 아키텍처 핵심 결정 (반드시 준수)
1. **Bullet.ts**: 단일 Bullet 클래스(플레이어탄/적탄 공용). Arcade Physics Image + 풀링(`Phaser.Physics.Arcade.Group`, maxSize 설정, recycle). 필드: owner('player'|'enemy'), damage, bulletType. 적탄은 GameScene의 enemyBullets 그룹, 플레이어탄은 playerBullets 그룹. **차지 공격 등 특수탄은 소거/충돌 규칙 플래그**(`clearsBullets`)로 처리.
2. **Player**: 상태 머신(normal/focus/charge/dead), 파워 0~3, 무적 타이머, 캐릭터별 공격 로직은 characters.ts의 스탯 + Player 내 switch로 구현. 피격 판정은 본체보다 작은 원(반경 ~5px).
3. **Enemy**: 컨피그 기반. `EnemyType` 정의(enemyPatterns.ts)에 move 함수(`(e, t, dt) => void`)와 fire 함수 포함. 적끼리 코드 중복 없이 재사용.
4. **Boss**: 페이즈 배열 데이터. 각 공격은 bossPatterns.ts의 함수 레지스트리(`ATTACKS: Record<string, (boss, scene, params) => void>` + 주기 실행). HP 비율로 페이즈 전환, 전환 시 연출 + 탄 소거.
5. **EnemySpawner**: stages.ts의 웨이브 타임라인 `{t, actions:[{type:'spawn'|'scroll'|'midboss'|'boss'|'text', ...}]}`를 시간에 따라 실행. 스크롤 속도 명령 지원.
6. **오브젝트 풀링 필수**(탄/적/아이템/파티클). 화면 밖 객체 즉시 재활용. 60FPS 목표.
7. GameScene은 스테이지 인덱스를 받아 재사용(스테이지 데이터만 교체). 물리 그룹/업데이터는 씬 생성 시 1회 구성.
8. **컴파일 엄수**: `npx tsc --noEmit` 오류 0. strict 모드. any 남발 금지.

## 밸런싱 목표
- 첫 클리어 20~35분. Stage1 쉬움 → 2 보통 → 3 어려움 → Final 도전적. HP를 무작정 늘려 난이도 만들지 않기.
- 보스 필살기로 지나치게 쉽게 죽지 않게(필살기 대미지는 총 HP의 작은 비율 수준으로).

## 최종 체크리스트
npm install/dev/build 성공, Title→캐릭터선택(3명)→스테이지→보스→클리어→스테이지2→3→파이널→엔딩, 게임오버/리트라이, 하이스코어 저장 유지, 디버그 키, 모바일 실행. TODO/FIXME/placeholder 금지.
