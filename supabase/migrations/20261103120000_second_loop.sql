-- v1.8.0: 텐가이식 2주차. 2주차 기록은 스테이지 번호에 한 바퀴(6)를 더해 7~12로 저장한다.
-- 2026-11-03 apply_migration으로 적용한 것과 같은 내용. 제약을 넓히기만 하므로 이전 클라이언트도 그대로 제출된다.
alter table public.scores drop constraint scores_stage_check;
alter table public.scores add constraint scores_stage_check
  check (stage between 1 and 12);

-- 클리어는 1주차 최종(6)·2주차 최종(12)에서만 인정. 4는 4스테이지 시절 클라이언트 호환(BACKLOG).
drop policy "anyone can submit a score" on public.scores;
create policy "anyone can submit a score"
on public.scores for insert
to anon, authenticated
with check (cleared = false or stage in (4, 6, 12));
