CREATE TABLE public.battles (
  code text PRIMARY KEY,
  status text NOT NULL DEFAULT 'waiting',
  subject text,
  topic text,
  total_questions int NOT NULL DEFAULT 10,
  round int NOT NULL DEFAULT 0,
  p1_chat bigint NOT NULL,
  p1_username text,
  p2_chat bigint,
  p2_username text,
  p1_score int NOT NULL DEFAULT 0,
  p2_score int NOT NULL DEFAULT 0,
  current_question_id bigint REFERENCES public.questions(id) ON DELETE SET NULL,
  p1_answer char(1),
  p2_answer char(1),
  p1_message_id bigint,
  p2_message_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_battles_p1_chat ON public.battles(p1_chat) WHERE status <> 'done';
CREATE INDEX idx_battles_p2_chat ON public.battles(p2_chat) WHERE status <> 'done';