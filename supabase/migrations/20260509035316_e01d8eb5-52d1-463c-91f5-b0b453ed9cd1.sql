ALTER TABLE public.user_state
  ADD COLUMN IF NOT EXISTS session_total integer,
  ADD COLUMN IF NOT EXISTS session_correct integer,
  ADD COLUMN IF NOT EXISTS session_remaining integer;