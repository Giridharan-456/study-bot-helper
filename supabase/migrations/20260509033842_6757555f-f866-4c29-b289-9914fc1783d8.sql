
CREATE TABLE public.questions (
  id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  answer CHAR(1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_questions_subject ON public.questions(subject);
CREATE INDEX idx_questions_topic ON public.questions(topic);

CREATE TABLE public.user_state (
  chat_id BIGINT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'poll',
  subject TEXT,
  current_question_id BIGINT REFERENCES public.questions(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_scores (
  chat_id BIGINT PRIMARY KEY,
  username TEXT,
  total INT NOT NULL DEFAULT 0,
  correct INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_scores ENABLE ROW LEVEL SECURITY;

-- Public read on questions (so a future leaderboard/UI could show stats)
CREATE POLICY "questions_public_read" ON public.questions FOR SELECT USING (true);
CREATE POLICY "scores_public_read" ON public.user_scores FOR SELECT USING (true);
