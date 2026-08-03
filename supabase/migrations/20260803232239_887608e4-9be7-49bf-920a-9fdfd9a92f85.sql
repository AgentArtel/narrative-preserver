-- 1. Vocabularies -----------------------------------------------------------
CREATE TABLE public.camera_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  is_time_move boolean NOT NULL DEFAULT false,
  implies_motion boolean NOT NULL DEFAULT true,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_moves_scope_chk CHECK ((user_id IS NULL AND project_id IS NULL) OR (user_id IS NOT NULL AND project_id IS NOT NULL))
);
CREATE UNIQUE INDEX camera_moves_global_slug ON public.camera_moves (slug) WHERE project_id IS NULL;
CREATE UNIQUE INDEX camera_moves_project_slug ON public.camera_moves (project_id, slug) WHERE project_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.camera_moves TO authenticated;
GRANT ALL ON public.camera_moves TO service_role;
ALTER TABLE public.camera_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read global or own camera moves" ON public.camera_moves
  FOR SELECT TO authenticated USING (project_id IS NULL OR user_id = auth.uid());
CREATE POLICY "write own camera moves" ON public.camera_moves
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER camera_moves_updated BEFORE UPDATE ON public.camera_moves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.risk_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  description text,
  guidance text,
  hidden boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_classes_scope_chk CHECK ((user_id IS NULL AND project_id IS NULL) OR (user_id IS NOT NULL AND project_id IS NOT NULL))
);
CREATE UNIQUE INDEX risk_classes_global_slug ON public.risk_classes (slug) WHERE project_id IS NULL;
CREATE UNIQUE INDEX risk_classes_project_slug ON public.risk_classes (project_id, slug) WHERE project_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_classes TO authenticated;
GRANT ALL ON public.risk_classes TO service_role;
ALTER TABLE public.risk_classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read global or own risk classes" ON public.risk_classes
  FOR SELECT TO authenticated USING (project_id IS NULL OR user_id = auth.uid());
CREATE POLICY "write own risk classes" ON public.risk_classes
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER risk_classes_updated BEFORE UPDATE ON public.risk_classes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.camera_moves (slug, label, description, is_time_move, implies_motion, sort_order) VALUES
  ('static','Static','Locked-off frame. Nothing but the subject moves.', false, false, 0),
  ('rapid_cut','Rapid cut','A burst of hard cuts inside one render; no camera travel.', false, false, 1),
  ('vertical_tilt','Vertical tilt','Camera pivots up or down from a fixed position.', false, true, 2),
  ('positional_pov','Positional-POV','Frame sits in a character''s eyeline and inherits their motion.', false, true, 3),
  ('dutch_angle','Dutch angle','Horizon rolled off level; unease without travel.', false, true, 4),
  ('whip_pan','Whip-pan','Fast horizontal pivot that smears the frame; a transition move.', false, true, 5),
  ('push','Push','Camera advances toward the subject.', false, true, 6),
  ('pull','Pull','Camera retreats from the subject, revealing context.', false, true, 7),
  ('orbit','Orbit','Camera arcs around the subject, holding it centred.', false, true, 8),
  ('low_tracking','Low tracking','Camera travels alongside at low height.', false, true, 9),
  ('upward_tracking','Upward tracking','Camera rises while travelling with the subject.', false, true, 10),
  ('close_slow_mo','Close slow-mo','A time move: slow motion held close. Must be fused to a framing move, never used bare.', true, true, 11),
  ('general_plan','General plan','Wide establishing frame that states the whole geography.', false, false, 12);

INSERT INTO public.risk_classes (slug, label, description, guidance, sort_order) VALUES
  ('mechanical','Mechanical','Anatomy, hands, weapon geometry, physical impossibility.','Simplify the action or crop past the failing joint.',0),
  ('chromatic','Chromatic','A palette colour drifts to a neighbour under lighting.','Restate the palette law and re-render, do not colour-correct.',1),
  ('compositional','Compositional','Subject placement, crowding, or a lost focal point.','Re-block against the anchor, or split the frame in two.',2),
  ('context_bleed','Context bleed','Detail from an adjacent shot or reference leaks in.','Drop the offending reference and re-attach only the needed Element.',3),
  ('generic_substitution','Generic substitution','The model swaps a specific design for a stock version.','Re-attach the named Element and re-state the distinguishing detail.',4);

-- 2. Shots: risk tail + held_still status ------------------------------------
ALTER TABLE public.shots ADD COLUMN risk_tail jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TYPE public.shot_status ADD VALUE IF NOT EXISTS 'held_still';

-- 3. Keyframe pairs ----------------------------------------------------------
CREATE TABLE public.keyframe_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots(id) ON DELETE CASCADE,
  a_frame_id uuid REFERENCES public.frames(id) ON DELETE SET NULL,
  b_frame_id uuid REFERENCES public.frames(id) ON DELETE SET NULL,
  form text CHECK (form IN ('locked_camera','moving_camera')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX keyframe_pairs_shot ON public.keyframe_pairs (shot_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyframe_pairs TO authenticated;
GRANT ALL ON public.keyframe_pairs TO service_role;
ALTER TABLE public.keyframe_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_rows" ON public.keyframe_pairs
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER keyframe_pairs_updated BEFORE UPDATE ON public.keyframe_pairs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Location locks ----------------------------------------------------------
ALTER TABLE public.locations
  ADD COLUMN light_logic text,
  ADD COLUMN materials text,
  ADD COLUMN depth_planes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN master_frame_id uuid REFERENCES public.frames(id) ON DELETE SET NULL,
  ADD COLUMN reverse_frame_id uuid REFERENCES public.frames(id) ON DELETE SET NULL,
  ADD COLUMN reverse_verified_at timestamptz,
  ADD COLUMN reverse_verification_note text,
  ADD COLUMN motion_test_frame_id uuid REFERENCES public.frames(id) ON DELETE SET NULL,
  ADD COLUMN motion_test_passed_at timestamptz,
  ADD COLUMN motion_test_note text;

-- 5. Projects: gate + code ---------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN gate text NOT NULL DEFAULT 'G0',
  ADD COLUMN code text;
ALTER TABLE public.projects ADD CONSTRAINT projects_gate_chk
  CHECK (gate IN ('G0','G1','G2','G3','G4','G5','G6','G7','G8','G9'));
ALTER TABLE public.projects ADD CONSTRAINT projects_code_chk
  CHECK (code IS NULL OR code ~ '^[A-Z]{2,4}$');