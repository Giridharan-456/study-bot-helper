create table if not exists public.wrong_answers (
  chat_id bigint not null,
  question_id bigint not null,
  wrong_count integer not null default 1,
  last_wrong_at timestamptz not null default now(),
  primary key (chat_id, question_id)
);
create index if not exists idx_wrong_answers_chat on public.wrong_answers(chat_id);

create table if not exists public.bookmarks (
  chat_id bigint not null,
  question_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (chat_id, question_id)
);
create index if not exists idx_bookmarks_chat on public.bookmarks(chat_id);

alter table public.wrong_answers enable row level security;
alter table public.bookmarks enable row level security;
-- service role bypasses RLS; no public policies needed (writes go through webhook)