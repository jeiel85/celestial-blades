-- v1.9.0: 숨겨진 천명사 2명(혜각·서리). 같은 랭킹에서 경쟁하므로 조종사 제약만 넓힌다.
-- 제약을 넓히기만 하므로 이전 클라이언트도 그대로 제출된다.
alter table public.scores drop constraint scores_pilot_check;
alter table public.scores add constraint scores_pilot_check
  check (pilot in ('yun', 'ryeohwa', 'mooyoung', 'soyul', 'haerang', 'hyegak', 'seori'));
