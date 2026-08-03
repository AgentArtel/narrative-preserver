ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS style_lock text,
  ADD COLUMN IF NOT EXISTS continuity text,
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS locks_frozen_at timestamp with time zone;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS landmarks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocking_anchor text;