# 천명비행록 : Celestial Blades — 구현 명세

1990년대 아케이드 횡스크롤 탄막 슈팅을 현대 웹으로 재해석한 **완성형 오리지널 게임**.
그래픽은 Codex 이미지 생성 원본을 가공해 번들에 포함한 PNG/JPG. 사운드는 Web Audio API 합성.

## 기술 스택 / 실행
- Phaser 3 (3.80+), TypeScript(strict), Vite, Arcade Physics, Web Audio, localStorage
- `npm run dev` (5173) / `npm run build` (tsc + vite build) 성공 필수
- 외부 서버/로그인 없음. 외부 이미지/음원 파일 금지.

## 해상도 / 화면
- 논리 해상도 **1280×720**, `Phaser.Scale.FIT` + `CENTER_BOTH`, 모바일에서도 깨지지 않게.
- HTML/CSS는 이미 작성되어 있음(index.html). body background #05070d.

## 게임 흐름 (씬)
Boot → Title → CharacterSelect → Story(서장) → Game(stage 1) → (중간보스→보스→StageClear) → Story(1장) → Game(stage 2) → … → Story(5장) → Game(final) → Ending
- Game Over 시 Result 씬: RETRY / TITLE. NEW HIGH SCORE 표시.
- 씬 키: `'Boot' | 'Title' | 'CharacterSelect' | 'Story' | 'Game' | 'Result' | 'Ending' | 'Ranking' | 'Archive'`
- 스토리 다시보기(Archive): 타이틀 `STORY`. 게임 중 본 장(`story.chapters`)과 엔딩을 본 천명사(`story.endings`)만 열린다(SaveSystem). Story/Ending을 `replay: true`로 열면 기록·점수·랭킹 없이 끝난 뒤 Archive로 돌아온다.
- Story 씬 데이터 `{chapter, next}`: chapter장 컷신(data/story.ts)을 보여 준 뒤 `next`로 Game을 시작한다. 장 번호 = 다음 스테이지 번호.
- 씬 전달 데이터: CharacterSelect→Game `{charIndex, difficulty}`; Game→Result `{stageIndex, score, lives, bombs, power, charIndex, difficulty, cleared: boolean, gameOver: boolean}`; Result→Game(다음 스테이지, 상태 이월) / Result→Title / Result→Ending(스테이지 3 보스 격파 후).
- Ending 후 Title 복귀.

## 조작 (InputSystem)
- 이동: 화살표 + WASD / 집중: Shift(속도 55~65%) + 피격점(히트박스 코어) 표시
- 공격: Z 또는 Space (누르는 동안 연사, 1.2초 유지 시 최대 차지 → 떼면 차지공격)
- 필살기: X (스테이지 시작 2개, 최대 4개). 발동 즉시 적탄 소거 + 화면 잡몹 전체 40 피해 + 섬광·히트스톱, 필살기가 끝날 때까지 무적(지속 시간 + 0.4초). 보스 1기에 주는 피해는 천명사마다 약 180(보스 HP의 약 7%)으로 맞춘다.
  - 발동 연출: 캐릭터 컷인 일러스트(`cutin_<id>`) 띠가 사선으로 들어와 기술명을 보여 준 뒤 섬광과 함께 빠져나가고, 그 순간 공격이 나간다(`CUTIN_MS` 900ms, 실제 시간). 컷인 동안 게임 시간은 0.06배로 거의 멈추고 플레이어는 무적이며 적탄은 발동 즉시 소거된다.
  - 게임 시간 배속은 `GameScene.slowMotion(factor, ms)` 하나로 다룬다(히트스톱 포함). Arcade 물리 `timeScale`은 값이 클수록 느리므로 `1/factor`를 넣는다.
- 일시정지: ESC (PAUSED 오버레이, 재개/타이틀)
- 게임패드: 스틱/패드 이동, A버튼 공격, B버튼 필살기 지원(가능한 범위)
- 디버그: F1 히트박스 표시, F2 무적, F3 현재 보스 호출, F4 다음 스테이지 (UI에는 노출 안 함)
- 모바일: 터치 기기에서만 좌측 가상 이동 영역(드래그), 우측 공격/필살기 버튼. PC 조작감 우선.

## 플레이어 캐릭터 (data/characters.ts, 48~80px, 실루엣 구분)
1. **윤 YUN** (균형 검사, 파랑) — 기본: 빠른 직선 검기 / 차지: 거대 초승달 검기(적탄 일부 소거) / 필살: 2초간 거대 검진 화면 전체 휩쓸기. 초보자용.
2. **려화 RYEOHWA** (화염 술사, 빨강/주황) — 기본: 3갈래 화염탄 / 차지: 자동 추적 화염조 5~7마리 / 필살: 화면 여러 지점 불기둥 연속. 넓은 범위, 단일 DPS는 윤보다 약간 낮음.
3. **무영 MOOYOUNG** (고속 암살자, 보라) — 기본: 매우 빠른 직선 수리검 / 차지: 전방 돌진(경로 대미지, 짧은 무적) / 필살: 잔상 다수가 화면을 가로지르며 공격. 최고 DPS, 좁은 범위, 고난도.
4. **소율 SOYUL** (관통 궁수, 옥색) — 기본: 적을 꿰뚫는 화살(관통 1~2) / 차지: 천궁일시, 화면 끝까지 꿰뚫는 거대 화살 / 필살: 유성시우, 3초간 화살비. 느린 연사, 한 발이 무거움.
5. **해랑 HAERANG** (결계 술사, 금색) — 기본: 약하게 유도되는 앞 부적 + 뒤쪽 견제 부적 / 차지: 호신결계, 1.6초간 반경 120px 적탄 소거 / 필살: 사신결계, 1.5초간 화면 정화 + 전체 피해. 최저 화력, 방어형.
6. **혜각 HYEGAK** (숨겨진 천명사, 금강 파계승, 구릿빛 금색) — 기본: 적을 2번 꿰뚫는 법륜, 0.56초 뒤 소멸(화면 절반 사거리) / 차지: 금강장, 사거리 짧은 거대 법륜(적탄 소거) / 필살: 금강항마진, 1.8초간 반경 360px 안을 0.15초마다 내리침(적탄 소거). 화력 최강, 대신 최저 속도·짧은 사거리.
7. **서리 SEORI** (숨겨진 천명사, 야생의 반요 여우, 장밋빛) — 기본: 강하게 유도되는 여우불 2~6발 / 차지: 월광조, 적탄을 찢는 세 줄기 참격 / 필살: 구미호염, 아홉 여우불이 흩어졌다 적을 쫓아 꽂힘. 빠르고 놓치지 않음, 대신 피격 판정 반지름 9(기본 6)·필살기 보유 상한 2.
- 숨겨진 천명사 해금: 아무 천명사로나 한 번 클리어(엔딩 기록)하거나, 캐릭터 선택 화면에서 비밀 커맨드 ↑↓↑↓←←→→(입력 간격 1.5초 이내, 패드 십자키·스틱 가능)를 넣으면 기체 줄 끝에 열린다(저장 유지). 해금 전에는 선택 화면·다시보기 목록에 나오지 않는다. 판정·필살기 상한은 `CharacterDef.hitRadius`·`maxBombs`로 둔다. 숨겨진 천명사는 반드시 `CHARACTERS` 끝에 둔다(해금 전 목록 = 앞쪽 일반 천명사만 잘라 쓰므로 인덱스가 같다).
- 캐릭터 선택(텐가이식): 아래 줄에서 인게임 기체(`select_<id>`, 같은 원본을 크게 가공)를 고르면 위쪽이 그 천명사의 필살기 일러스트로 바뀌고, 고른 기체는 떠올라 기본 공격 탄을 쏘아 보인다. 이름·필살기명·설명과 실측 수치: 공격(보스 초당 피해, `measured.bossDps`)·속도(px/초)·범위(1~5) 막대 + 판정 반지름·필살 1회 피해·필살 중 무적 시간·필살기 상한. X/ESC로 타이틀.
- 화력 설계(파워 3, 1스테이지 중간보스 상대 초당 피해 실측): 해랑 34 < 려화 35 < 소율 43 ≈ 윤 45 < 무영 57 < 서리 61 < 혜각 73. 속도 능력치 1~5 = 이동 배율 0.86/0.93/1/1.07/1.14. 기본탄 피해 배율은 파워 0~3에 1.6/1.35/1.3/1.45(`POWER_DAMAGE`) — 파워 0 화력이 파워 3의 약 30~60%라 격추 뒤에도 보스전이 늘어지지 않는다.
- 화력 측정(`tools/bench.mjs` + `src/dev/bench.ts`, 개발 서버 전용): 헤드리스 Chrome으로 실제 GameScene을 60fps 고정 프레임으로 빨리 돌려, 보스 높이를 따라다니며 쏠 때의 초당 피해·필살기 피해·격파 시간을 잰다. 화력·HP를 바꾸면 다시 재서 `measured`와 아래 HP 목표를 맞춘다.

## 전투 시스템
- **차지**: 버튼 홀드 1.2초에 최대 차지. 캐릭터 주위 차지 이펙트 명확히. 놓으면 발동. 차지 여부가 플레이에 실질 영향.
- **파워**: P 아이템으로 4단계(0~3). 단계마다 투사체 수/형태 변화.
- **격추(라이덴 IV식)**: 맞으면 파워가 0이 되고 잃은 단계만큼 P가, 필살기는 시작 개수로 돌아가며 넘던 만큼 B가 사방으로 흩어진다. 흩어진 아이템은 화면 가장자리에서 튕기며 10초(7.5초부터 깜빡임) 남아 다시 주우면 회복된다. 마지막 목숨이면 컨티뉴 뒤에 주울 수 있다.
- **목숨**: 기본 3(L 아이템 +1), 피격 시 1 감소 + 2초 무적, 0이면 Game Over. Continue 1회.
- **콤보**: 빠른 연속 처치 시 상승, 배율 증가, 피격/3초 무처치 시 초기화.
- **아이템**: P(공격력)/B(필살기+1)/L(목숨+1)/G(점수). 적 처치 시 확률 드롭, G는 위로 튀어 아래로 낙하.
- **점수**: 처치/보스 타격/아이템/콤보/노미스/클리어 보너스. HI-SCORE는 localStorage.

## 난이도 (시작 시 선택 EASY/NORMAL/HARD/EXTREME, NORMAL 기준, GameConfig.DIFFICULTY_PRESETS)
- EASY: 탄속 0.8x, 탄 밀도 0.75x, 목숨 4, 시작 필살기 3
- HARD: 탄속 1.15x, 밀도 1.3x, 적 HP 1.3x, 보스 HP 1.25x
- EXTREME: 탄속 1.45x, 밀도 2.1x(발수 상한 2.4x), 목숨 1·필살기 0, 목숨 아이템 없음, 적 HP 1.5x, 보스 HP 1.6x·공격 빈도 1.35x, 원형탄 빈틈 1발분, 격파탄(적 사망 시 조준탄 + 원형탄, 플레이어 140px 안에서는 생략), 게임오버 RETRY는 1스테이지부터. 안전 경로 원칙은 그대로 지킨다.
- localStorage에 선택 난이도/최근 캐릭터 저장.

## 적 (Enemy.ts + data/enemyPatterns.ts, 32~100px)
- 소형 비행 요괴(직선+조준탄), 박쥐형(사인곡선+3방향), 돌진형(조준 후 돌진), 포대형(느리게+원형탄막), 방패형(정면 저항/뒤·타이밍 공격에 약함), 소환형(소형 적 지속 생성), 엘리트(미니보스 패턴).
- 모든 적은 비행 애니메이션(부유/날개) + 피격 플래시 + 폭발.
- 데이터 기반: 타입별 이동/발사 패턴 함수. 랜덤 스폰이 아닌 **제작된 웨이브 타임라인**으로 리듬 구성(약한 무리→교차→포대→다수→휴식→엘리트).

## 스테이지 (data/stages.ts)
- 횡스크롤(좌→우), 플레이어는 화면 좌측 70% 영역, 스크롤 속도 변화(보스전 정지).
- **Stage 1 청운계곡**: 튜토리얼 리듬. 중간보스 거대 비행 가오리 요괴. 보스 **철갑귀 장군**(갑옷 비행 요괴) — P1 조준+직선탄, P2 부채꼴, P3(HP30%↓) 돌진+탄막 복합.
- **Stage 2 붉은 기계도시**: 톱니/기계문/비행선/붉은 등불 배경. 중간보스 거대 기계 지네. 보스 **홍련기관왕** — 미사일/레이저/원형탄막/부품분리, HP↓ 시 외장 파괴 후 코어 노출 연출.
- **Stage 3 수몰용궁**: 폭풍의 바다에 반쯤 잠긴 용궁. 물고기 요괴(fish) 중심. 중간보스 **달해파리 월해파**(원형탄·꽃잎탄·낙하탄). 보스 **해룡비 청린** — 물결 장막(curtain)·소용돌이 나선·돌진, HP↓ 시 꽃잎탄 + 레이저.
- **Stage 4 천공성**: 가장 화려함. 강화 적 조합. 중간보스 타락한 천명사(플레이어와 유사 능력). 보스 **백야천녀** — 순간이동, 검기/원형탄막/추적탄/레이저/분신, HP↓ 시 화면 어두워지며 패턴 변화.
- **Stage 5 백귀야시**: 구름 위 요괴 밤시장. 도깨비불(wisp) 중심. 중간보스 **구미호 홍월**(여우불 꽃잎·순간이동·분신). 보스 **등롱귀왕 야명** — 주위를 도는 등롱 4개가 사격, 원형탄·꽃잎탄·낙하탄·장막·조각탄, HP↓ 시 화면 암전.
- **Final 천문**: 하늘의 균열. 보스 **무명천** — Phase1 인간형(정교한 탄막) → Phase2 용+새 결합 거대 신수형(배경이 움직이는 연출). 모든 패턴에 안전 경로 보장.

## 보스 설계 원칙 (Boss.ts + data/bossPatterns.ts, 150~400px)
- 보스마다 3개 이상 패턴, 시간/체력 기반 전환, 체력↓ 시 패턴 추가.
- 공격 전 경고(색 변화/오라/라인). 피할 수 없는 공격 금지.
- 등장: 적 정리 → WARNING → 이름 표시 → 등장 연출. 사망: 다중 폭발→흔들림→대폭발→히트스톱→제거.
- 보스전 상단에 보스 이름 + HP 바.
- **데이터 기반**: 패턴은 bossPatterns.ts의 공격 함수 레지스트리 + 페이즈 데이터로 정의.

## 텐가이 벤치마크 요소 (v1.8.0)
- 식신(Player.updateFamiliar): `familiar_<id>`, 플레이어 뒤 위(집중 시 앞 위)로 지연 추종, 공격키 동안 캐릭터별 탄(파워에 따라 간격 100→70%).
- 보스전 대사(data/bossTalk.ts + effects/BossTalkPanel.ts): 중간보스 제외 6보스. bossState `'talk'` 동안 전투 정지.
- 탄 소거 → 금화(GameScene.convertEnemyBulletsToCoins): 보스 형태 변화 탄당 30점, 중간보스 격파 50점, 보스 격파 100점.
- 컨티뉴: stageRetry 난이도만. 10초, 공격키 이어 하기·필살키 1초씩 넘기기, 점수 0 + 이어 한 횟수.
- 2주차(GameConfig.presetFor): loop 2는 탄속 1.15·밀도 1.3·발수 상한 +0.4·보스 빈도 1.15·HP 1.2·격파탄. 컷신 생략, 랭킹 stage = 스테이지 + 6.
- 배경: 원경을 좌우 반전 이어 붙여 천천히 스크롤(SKY_SPEED), 테마별 속도감 입자(MOTES).

## 탄막 디자인
- 원형/부채꼴/나선/조준/교차/웨이브/링/분열 등 시각적 규칙. 색·크기·속도로 위험도 구분. 수백 발 동시 존재 대응(Object Pooling 필수).

## 그래픽 (BootScene)
- 손그림 애니풍 동양 판타지 일러스트, 외곽선 + 셀 셰이딩, 작은 크기에서도 실루엣 구분.
- 그림 파이프라인: Codex `image_gen` 원본 → `art-raw/<텍스처키>.png`(git 제외) → `tools/process_art.py` → `src/assets/sprites/*.png`, `src/assets/backgrounds/*`. 파일명이 곧 텍스처 키.
- 스프라이트 크기는 기존 텍스처 크기를 유지(히트박스가 프레임 크기 기준). 플레이어는 오른쪽, 적·보스는 왼쪽을 향한다. 적탄·FX는 흰색 바탕이며 런타임 setTint로 색을 입힌다.
- 코드가 참조하는 텍스처가 하나라도 없으면 BootScene이 진행을 멈추고 오류를 표시한다(`REQUIRED_TEXTURES`).
- 배경: 고정 원경 일러스트(`bg_<theme>`) + 가로 반복 전경 레이어(`layer_<theme>`, 좌우 끝 투명 페이드) + 도시 테마 회전 톱니(`gear`).
- 캐릭터 카드 초상화 `portrait_<id>`, 엔딩 후일담 일러스트 `ending_<id>`, 터치 UI `touch_*`, 레이저 경고선 `fx_warn_line`(흰색 균일 빛줄기를 늘리고 색을 입힘).
- 글꼴: 로고 Song Myung, UI Gowun Dodum(`GameConfig`의 `LOGO_FONT`/`UI_FONT`). 빌드 시 소스에 쓰인 글자를 모은 `virtual:ui-glyphs`로 BootScene이 필요한 글꼴 조각을 미리 받는다.
- 캐릭터 상하 이동 기울임(팀 회전), 보스 등장/공격/피격/페이즈전환/사망 연출 구분.
- 이펙트: 피격 플래시, 폭발, 잔상, 화면 흔들림(과하지 않게), 히트스톱, 파티클, 탄 소거.

## 사운드 (AudioSystem, Web Audio 합성)
- 효과음: 기본공격/차지완료/차지공격/적 피격/적 폭발/플레이어 피격/아이템/필살기/보스 등장/보스 폭발/메뉴 선택. 음소거(M키) + Settings 볼륨. 간단한 절차 생성 BGM(스테이지/보스) 가능하면 추가.

## UI
- 상단 HUD: SCORE, HI-SCORE, LIFE, BOMB(필살기), POWER, COMBO. 아케이드 느낌 + 현대적 정돈.
- 스테이지 시작 타이틀 카드("STAGE 1 — 청운계곡"), Stage Clear(Enemy/Combo/NoMiss/Remaining Bonus 합산, 3~5초 후 자동 진행 + 스킵 가능).

## 타이틀 화면
- 왼쪽 단: 로고 그림(`title_logo`, 글자까지 Codex 생성), HI-SCORE, 메뉴 START GAME / RANKING / STORY / HOW TO PLAY / SETTINGS(선택 줄 뒤 `ui_menu_plate` 명판, 왼쪽 `ui_cursor`). 오른쪽: 다섯 천명사 키 아트(`title_bg`, 왼쪽을 비워 그림). SETTINGS: Master/SFX Volume, Screen Shake, Difficulty, Fullscreen.

## 온라인 랭킹 (RankingService · RankingScene, Supabase `public.scores`)
- 등록: 게임오버 화면 `랭킹 등록`, 엔딩 종료 후 자동 진입(건너뛰기 가능). 닉네임 2~12자(한글·영문·숫자·_·-), 마지막 닉네임은 localStorage에 기억.
- 조회: 타이틀 `RANKING` → 난이도 탭(←→) + TOP 20(점수 내림차순, 동점은 먼저 올린 기록이 위). 방금 올린 기록 강조, TOP 20 밖이면 아래에 순위 표시.
- 서버 규칙(마이그레이션 `supabase/migrations/`): 조회·제출만 허용, 수정·삭제 불가, 클리어는 4스테이지에서만, 닉네임별 1분 3회. 점수 위조는 완전히 막지 못한다(DECISIONS.md).
- 무료 플랜 일시정지 방지: `.github/workflows/supabase-keepalive.yml`이 사흘마다 조회.

## 저장 (SaveSystem, localStorage key `celestial-blades-save`)
- hiscore, settings(masterVol, sfxVol, musicVol, shake, difficulty, lastChar), story(본 장 번호 chapters, 엔딩을 본 천명사 endings), secretPilots(비밀 커맨드 입력 여부). 새로고침 후 유지. story가 없는 구버전 저장은 빈 기록으로 읽는다.

## 코드 구조 (이 구조 준수)
```
src/main.ts
src/game/GameConfig.ts            // 상수(W/H, 색 팔레트, 밸런스 수치)
src/game/scenes/BootScene.ts      // 그림·로고 글꼴 로드
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
- 보스 필살기로 지나치게 쉽게 죽지 않게(필살기 1회 ≈ 보스 HP의 7%, 중간보스 HP의 1/3~1/2, 피하기 어려운 지네만 약 60%).
- 피격 판정: 보스는 맞은 탄의 피해를 모두 받는다(공용 피격 간격 없음). 관통탄은 겹쳐 있는 같은 대상을 0.1초마다(distinct 탄은 한 번만) 맞혀, 화면 주사율과 무관하게 화력이 같다.
- HP 목표(일반 천명사 5명 실측 평균, 숙련자 상한 ÷ 실제 효율 0.75): 중간보스 파워 2로 약 15~25초, 보스 파워 3으로 1스테이지 60초 ~ 최종 90초. 보스 피해 1당 점수 4(HP를 줄인 만큼 점수 규모 유지).

## 최종 체크리스트
npm install/dev/build 성공, Title→캐릭터선택(5명)→서장→스테이지→보스→클리어→컷신→스테이지2~5→파이널→엔딩, 게임오버/리트라이, 하이스코어 저장 유지, 디버그 키, 모바일 실행. TODO/FIXME/placeholder 금지.
