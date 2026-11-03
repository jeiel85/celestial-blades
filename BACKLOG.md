# Backlog

## 그래픽 애셋 (2026-11-02, Codex 이미지 생성 1~3차 이후)

- [ ] UI 패널·게이지는 여전히 Phaser 도형(rectangle) — 캐릭터 카드 테두리, 스탯 바, 화면 전환용 어둡게/밝게 덮개 · 영향: CharacterSelectScene, EndingScene, GameScene 결과 패널
- [ ] 개발 서버에서 최초 로딩이 느림(그림 70여 장 + 한글 글꼴 조각) — 프로덕션 번들 기준 첫 진입 시간 측정 필요 · 영향: BootScene

## v1.4.0 (EXTREME·신규 캐릭터·6스테이지·스토리)

- [ ] 랭킹 클리어 인정 `stage in (4, 6)` → `stage = 6`으로 좁히기 — 이전 버전(서비스워커 캐시) 클라이언트가 사라진 뒤 · 영향: Supabase 정책
- [ ] EXTREME 클리어 가능성을 자동 플레이 봇으로 검증하기 — 지금은 패턴마다 빈틈을 남기는 규칙(원형탄 1발분, 장막 140px, 격파탄 140px 안 생략)으로만 보장 · 영향: bossPatterns, Enemy
- [ ] 소율 관통 화살·해랑 유도 부적의 보스전 DPS를 기존 3인과 실측 비교해 맞추기 · 영향: Player, characters
