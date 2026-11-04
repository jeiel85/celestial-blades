-- v1.14.0: 어시스트를 켠 기록을 같은 랭킹에 올리되 표시한다(DECISIONS.md).
-- 켠 어시스트의 비트 합: 자동 공격 1 · 자동 필살기 2 · 자동 회피 4 (0이면 어시스트 없음).
-- 열을 더하기만 하므로 어시스트가 없는 이전 클라이언트는 그대로 제출되고 0으로 남는다.
alter table public.scores add column assist smallint not null default 0
  check (assist between 0 and 7);

grant insert (assist) on public.scores to anon, authenticated;
