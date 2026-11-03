-- v1.4.0: EXTREME 난이도, 새 조종사 2명(소율·해랑), 스테이지 4 → 6.
-- 2026-11-03 apply_migration으로 적용한 것과 같은 내용. 제약을 넓히기만 하므로 이전 클라이언트도 그대로 제출된다.
alter table public.scores drop constraint scores_difficulty_check;
alter table public.scores add constraint scores_difficulty_check
  check (difficulty in ('EASY', 'NORMAL', 'HARD', 'EXTREME'));

alter table public.scores drop constraint scores_pilot_check;
alter table public.scores add constraint scores_pilot_check
  check (pilot in ('yun', 'ryeohwa', 'mooyoung', 'soyul', 'haerang'));

alter table public.scores drop constraint scores_stage_check;
alter table public.scores add constraint scores_stage_check
  check (stage between 1 and 6);

-- 클리어는 최종 스테이지에서만 인정: 새 버전은 6, 서비스워커 캐시로 남은 이전 버전(4스테이지)은 4.
-- 이전 버전이 사라지면 stage = 6만 남긴다(BACKLOG.md).
drop policy "anyone can submit a score" on public.scores;
create policy "anyone can submit a score"
on public.scores for insert
to anon, authenticated
with check (cleared = false or stage in (4, 6));
