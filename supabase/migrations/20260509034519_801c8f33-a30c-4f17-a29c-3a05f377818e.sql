
CREATE TABLE public.invites (
  code TEXT PRIMARY KEY,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uses INT NOT NULL DEFAULT 0
);

CREATE TABLE public.bot_users (
  chat_id BIGINT PRIMARY KEY,
  username TEXT,
  invite_code TEXT REFERENCES public.invites(code) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;

-- Public can read invite codes (used by the landing page to show the share link)
CREATE POLICY "invites_public_read" ON public.invites FOR SELECT USING (true);
