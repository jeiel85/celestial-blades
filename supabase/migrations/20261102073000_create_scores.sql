-- 천명비행록 온라인 랭킹 (Supabase 프로젝트 celestial-blades, ref zexxkfjmyayyuewqkxee)
-- 2026-11-02 apply_migration으로 적용한 것과 같은 내용. 순수 클라이언트 게임이라 점수 위조를
-- 완전히 막을 수는 없으므로 형식·범위 제약과 닉네임별 제출 빈도 제한만 둔다.
create table public.scores (
  id bigint generated always as identity primary key,
  nickname text not null
    check (char_length(nickname) between 2 and 12 and nickname ~ '^[0-9A-Za-z가-힣_-]+$'),
  score integer not null check (score between 0 and 99999999),
  pilot text not null check (pilot in ('yun', 'ryeohwa', 'mooyoung')),
  difficulty text not null check (difficulty in ('EASY', 'NORMAL', 'HARD')),
  stage smallint not null check (stage between 1 and 4),
  cleared boolean not null default false,
  created_at timestamptz not null default now()
);

create index scores_rank_idx on public.scores (difficulty, score desc, created_at);
create index scores_nickname_recent_idx on public.scores (nickname, created_at desc);

-- 같은 닉네임은 1분에 3회까지만 제출
create function public.scores_rate_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*) from public.scores s
    where s.nickname = new.nickname and s.created_at > now() - interval '1 minute'
  ) >= 3 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger scores_rate_limit
before insert on public.scores
for each row execute function public.scores_rate_limit();

alter table public.scores enable row level security;

create policy "scores are readable by everyone"
on public.scores for select
to anon, authenticated
using (true);

-- 클리어(cleared)는 최종 스테이지(4)에서만 인정
create policy "anyone can submit a score"
on public.scores for insert
to anon, authenticated
with check (cleared = (stage = 4) or cleared = false);

revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;
grant insert (nickname, score, pilot, difficulty, stage, cleared) on public.scores to anon, authenticated;
revoke execute on function public.scores_rate_limit() from public, anon, authenticated;
