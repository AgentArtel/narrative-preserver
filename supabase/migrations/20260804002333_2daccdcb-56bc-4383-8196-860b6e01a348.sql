-- 2. edit lineage on frames
ALTER TABLE public.frames
  ADD COLUMN IF NOT EXISTS derived_from_frame_id uuid REFERENCES public.frames(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_composite boolean NOT NULL DEFAULT false;

-- 3. cost tier on generations
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'previs';

-- 3. model rate card (vocabulary pattern)
CREATE TABLE public.model_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  provider text NOT NULL DEFAULT 'higgsfield',
  model text NOT NULL,
  resolution text NOT NULL,
  credits_per_second numeric NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_rates TO authenticated;
GRANT ALL ON public.model_rates TO service_role;
ALTER TABLE public.model_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read global or own model rates" ON public.model_rates FOR SELECT TO authenticated
  USING (project_id IS NULL OR user_id = auth.uid());
CREATE POLICY "write own model rates" ON public.model_rates FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER model_rates_updated BEFORE UPDATE ON public.model_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.model_rates (slug, label, model, resolution, credits_per_second, sort_order, description) VALUES
  ('seedance_mini_480p', 'Seedance mini · 480p', 'seedance-mini', '480p', 1.0, 0, 'Cheapest previs tier.'),
  ('seedance_std_480p', 'Seedance std · 480p', 'seedance-std', '480p', 1.5, 1, 'Standard previs.'),
  ('seedance_std_1080p', 'Seedance std · 1080p', 'seedance-std', '1080p', 9.0, 2, 'Finish tier.'),
  ('seedance_std_4k', 'Seedance std · 4K', 'seedance-std', '4k', 22.0, 3, 'Most expensive finish tier — a 15s retry is 330 credits.');

-- 4. approval purposes (vocabulary pattern)
CREATE TABLE public.approval_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_purposes TO authenticated;
GRANT ALL ON public.approval_purposes TO service_role;
ALTER TABLE public.approval_purposes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read global or own approval purposes" ON public.approval_purposes FOR SELECT TO authenticated
  USING (project_id IS NULL OR user_id = auth.uid());
CREATE POLICY "write own approval purposes" ON public.approval_purposes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER approval_purposes_updated BEFORE UPDATE ON public.approval_purposes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.approval_purposes (slug, label, sort_order, description) VALUES
  ('default', 'Default', 0, 'The shot-level approved frame. Reference selection and the generation package use this.'),
  ('face_reference', 'Face reference', 1, 'Approved as evidence of the face only.'),
  ('costume_design', 'Costume / armour design', 2, 'Approved as evidence of the outfit and its damage state.'),
  ('palette_reference', 'Palette reference', 3, 'Approved as evidence of colour, not of form.'),
  ('location_plate', 'Location plate', 4, 'Approved as a reusable plate for this location.');

-- 4. frame approvals
CREATE TABLE public.frame_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frame_id uuid NOT NULL REFERENCES public.frames(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'default',
  note text,
  approved_by uuid,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (frame_id, purpose)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frame_approvals TO authenticated;
GRANT ALL ON public.frame_approvals TO service_role;
ALTER TABLE public.frame_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_rows" ON public.frame_approvals FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.frame_approvals (user_id, frame_id, purpose, approved_at)
SELECT user_id, id, 'default', created_at FROM public.frames WHERE is_approved = true
ON CONFLICT DO NOTHING;

-- 1. character sheet checklist (vocabulary pattern)
CREATE TABLE public.sheet_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  reason text,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_checklist_items TO authenticated;
GRANT ALL ON public.sheet_checklist_items TO service_role;
ALTER TABLE public.sheet_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read global or own sheet items" ON public.sheet_checklist_items FOR SELECT TO authenticated
  USING (project_id IS NULL OR user_id = auth.uid());
CREATE POLICY "write own sheet items" ON public.sheet_checklist_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER sheet_checklist_items_updated BEFORE UPDATE ON public.sheet_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sheet_checklist_items (slug, label, reason, sort_order) VALUES
  ('grey_plate', 'Deep neutral grey plate (#3a3a3c), never white', 'White bleeds into video and washes out the location.', 0),
  ('three_columns', 'Three columns', 'The sheet reads as one document rather than three loose images.', 1),
  ('portrait_dominant', 'Chest-up portrait largest and leftmost, 25–30% of frame', 'The portrait is the face of record; anything smaller loses to the full-body panels.', 2),
  ('heads_cropped', 'Heads cropped from the full-body panels', 'A 40px face drifts from the portrait, and two faces is competing evidence the model averages.', 3),
  ('catchlight', 'Catchlight in both eyes', 'Without it the eyes read dead and the model reproduces that.', 4),
  ('iris_legible', 'Iris legible', 'Eye colour is the first thing to drift across shots.', 5),
  ('symmetry_broken', 'Symmetry deliberately broken', 'A perfectly symmetrical sheet renders as a mannequin.', 6);

-- 1. sheet check verdicts
CREATE TABLE public.sheet_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frame_id uuid NOT NULL REFERENCES public.frames(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  verdicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (frame_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_checks TO authenticated;
GRANT ALL ON public.sheet_checks TO service_role;
ALTER TABLE public.sheet_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_rows" ON public.sheet_checks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER sheet_checks_updated BEFORE UPDATE ON public.sheet_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();