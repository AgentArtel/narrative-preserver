-- Two corrections to Phase 2/3, neither of which changes any table's shape.
--
-- 1. Close a cross-account read on the three Phase 3 vocabulary tables.
-- 2. Bring the camera-move seed back in line with the live rows.

------------------------------------------------------------------ 1. scope

-- Every vocabulary table reads with `project_id IS NULL OR user_id = auth.uid()`,
-- so a NULL project_id means "global seed, readable by everyone". Phase 2 made
-- that safe on camera_moves and risk_classes with a CHECK constraint pinning
-- user_id and project_id to be NULL or NOT NULL together. The three tables
-- Phase 3 added never got it, while keeping the same write policy of
-- `WITH CHECK (user_id = auth.uid())` — so any authenticated user could insert
-- a row owned by themselves with project_id NULL, and every other account would
-- then read it as a default.
--
-- The policy is tightened first. "Global" now means a row owned by nobody,
-- which is what the seeds are.
--
-- IMPORTANT — this alone is NOT the whole fix. The deprecated /api/mcp/$key
-- route authenticates with an api_keys row and then runs every query as
-- service_role, which bypasses RLS entirely; these policies are never
-- evaluated on that path. The matching scope has to be spelled out in the
-- query, which is what craft.ts `vocabScope()` does and why every vocabulary
-- read in the MCP server and preflight now goes through it. Neither half is
-- sufficient on its own.

DROP POLICY IF EXISTS "read global or own model rates" ON public.model_rates;
CREATE POLICY "read global or own model rates" ON public.model_rates
  FOR SELECT TO authenticated
  USING ((user_id IS NULL AND project_id IS NULL) OR user_id = auth.uid());

DROP POLICY IF EXISTS "read global or own approval purposes" ON public.approval_purposes;
CREATE POLICY "read global or own approval purposes" ON public.approval_purposes
  FOR SELECT TO authenticated
  USING ((user_id IS NULL AND project_id IS NULL) OR user_id = auth.uid());

DROP POLICY IF EXISTS "read global or own sheet items" ON public.sheet_checklist_items;
CREATE POLICY "read global or own sheet items" ON public.sheet_checklist_items
  FOR SELECT TO authenticated
  USING ((user_id IS NULL AND project_id IS NULL) OR user_id = auth.uid());

-- The same shape on the two tables that were already safe, so the security
-- property stops depending on a constraint being present and valid.
DROP POLICY IF EXISTS "read global or own camera moves" ON public.camera_moves;
CREATE POLICY "read global or own camera moves" ON public.camera_moves
  FOR SELECT TO authenticated
  USING ((user_id IS NULL AND project_id IS NULL) OR user_id = auth.uid());

DROP POLICY IF EXISTS "read global or own risk classes" ON public.risk_classes;
CREATE POLICY "read global or own risk classes" ON public.risk_classes
  FOR SELECT TO authenticated
  USING ((user_id IS NULL AND project_id IS NULL) OR user_id = auth.uid());

-- Then stop new malformed rows being written at all, matching Phase 2 exactly.
-- NOT VALID so the migration cannot fail on pre-existing data; the constraint
-- is still enforced on every INSERT and UPDATE from here on, so no new
-- offender can appear. Any row already in the table survives it, which is why
-- the query-level scope above matters and why validating is worth doing.
-- To find offenders before validating:
--   SELECT id, user_id, project_id FROM public.model_rates
--   WHERE (user_id IS NULL) <> (project_id IS NULL);
-- then, once clean:
--   ALTER TABLE public.model_rates VALIDATE CONSTRAINT model_rates_scope_chk;

ALTER TABLE public.model_rates DROP CONSTRAINT IF EXISTS model_rates_scope_chk;
ALTER TABLE public.model_rates ADD CONSTRAINT model_rates_scope_chk
  CHECK ((user_id IS NULL AND project_id IS NULL) OR (user_id IS NOT NULL AND project_id IS NOT NULL))
  NOT VALID;

ALTER TABLE public.approval_purposes DROP CONSTRAINT IF EXISTS approval_purposes_scope_chk;
ALTER TABLE public.approval_purposes ADD CONSTRAINT approval_purposes_scope_chk
  CHECK ((user_id IS NULL AND project_id IS NULL) OR (user_id IS NOT NULL AND project_id IS NOT NULL))
  NOT VALID;

ALTER TABLE public.sheet_checklist_items DROP CONSTRAINT IF EXISTS sheet_checklist_items_scope_chk;
ALTER TABLE public.sheet_checklist_items ADD CONSTRAINT sheet_checklist_items_scope_chk
  CHECK ((user_id IS NULL AND project_id IS NULL) OR (user_id IS NOT NULL AND project_id IS NOT NULL))
  NOT VALID;

----------------------------------------------------- 2. camera-move flags

-- implies_motion means "the a/b framings differ", not "the camera travels".
-- The original seed set these three true; they were corrected to false by a
-- direct UPDATE against the live database with no migration, so a reset or a
-- fresh environment would have reintroduced the wrong values and silently
-- flipped what keyframeFormWarnings reports.
--
-- Scoped to the global seed rows only: a project that has deliberately
-- overridden one of these keeps its override.
--   dutch_angle    — a roll; the framing stays where it was.
--   positional_pov — states where the lens is, not how it moves.
--   close_slow_mo  — a time move; it says nothing about the framing.

UPDATE public.camera_moves
   SET implies_motion = false
 WHERE user_id IS NULL
   AND project_id IS NULL
   AND slug IN ('dutch_angle', 'positional_pov', 'close_slow_mo')
   AND implies_motion IS DISTINCT FROM false;
