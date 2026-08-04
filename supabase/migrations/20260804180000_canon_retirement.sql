-- Canon has no lifecycle: promote_canon only accretes, so a design decision
-- that is later superseded keeps riding into every package the compiler emits.
-- Deleting it would break the tapestry rule — nothing is deleted, only
-- unfinished — so a record is retired instead: kept, readable as history, and
-- no longer asserted to the model.

ALTER TABLE public.canon_records
  ADD COLUMN IF NOT EXISTS retired_at timestamptz,
  ADD COLUMN IF NOT EXISTS retired_reason text;

-- The compiler filters on this on every shot, per project.
CREATE INDEX IF NOT EXISTS canon_records_active
  ON public.canon_records (project_id)
  WHERE retired_at IS NULL;

COMMENT ON COLUMN public.canon_records.retired_at IS
  'When this canon record stopped being asserted. Retired records stay readable as history but are excluded from compiled generation packages.';
