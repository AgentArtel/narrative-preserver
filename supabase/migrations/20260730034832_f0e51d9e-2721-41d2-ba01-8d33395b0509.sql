
-- ENUMS
CREATE TYPE public.shot_status AS ENUM ('idea','drafting','ready','generating','candidates','revision','approved','final');
CREATE TYPE public.frame_kind AS ENUM ('concept','storyboard','keyframe','start','end','final');
CREATE TYPE public.generation_status AS ENUM ('handed_off','imported','rejected');
CREATE TYPE public.canon_subject AS ENUM ('character','location','element','scene','shot');

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- PROJECTS
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.sequences ON DELETE CASCADE,
  title text NOT NULL,
  brief text,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'drafting',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  description text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name text NOT NULL,
  element_type text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  palette jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_fragments text[] NOT NULL DEFAULT '{}',
  negative_constraints text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.beats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes ON DELETE CASCADE,
  description text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  scene_id uuid NOT NULL REFERENCES public.scenes ON DELETE CASCADE,
  beat_id uuid REFERENCES public.beats ON DELETE SET NULL,
  shot_number text NOT NULL,
  description text,
  dialogue text,
  duration_seconds numeric,
  camera jsonb NOT NULL DEFAULT '{}'::jsonb,
  location_id uuid REFERENCES public.locations ON DELETE SET NULL,
  location_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  look_id uuid REFERENCES public.looks ON DELETE SET NULL,
  status public.shot_status NOT NULL DEFAULT 'idea',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots ON DELETE CASCADE,
  image_url text NOT NULL,
  kind public.frame_kind NOT NULL DEFAULT 'concept',
  is_approved boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shot_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (shot_id, character_id)
);

CREATE TABLE public.shot_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots ON DELETE CASCADE,
  element_id uuid NOT NULL REFERENCES public.elements ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (shot_id, element_id)
);

CREATE TABLE public.asset_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  image_url text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reference_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reference_id uuid NOT NULL REFERENCES public.asset_references ON DELETE CASCADE,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  shot_id uuid NOT NULL REFERENCES public.shots ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'higgsfield',
  tool text,
  model text,
  prompt text NOT NULL,
  negative_prompt text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.generation_status NOT NULL DEFAULT 'handed_off',
  cost_credits numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.canon_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,
  subject_type public.canon_subject NOT NULL,
  subject_id uuid NOT NULL,
  aspect text NOT NULL,
  description text,
  source_frame_id uuid REFERENCES public.frames ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider text NOT NULL,
  capability text,
  external_id text NOT NULL,
  owner_type text NOT NULL,
  owner_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER shots_updated BEFORE UPDATE ON public.shots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- GRANTS + RLS for every table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['projects','sequences','scenes','beats','shots','frames','characters','locations','elements','looks','shot_characters','shot_elements','asset_references','reference_links','generations','canon_records','provider_identities']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own_rows" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

CREATE INDEX ON public.sequences (project_id);
CREATE INDEX ON public.scenes (sequence_id);
CREATE INDEX ON public.beats (scene_id);
CREATE INDEX ON public.shots (scene_id);
CREATE INDEX ON public.frames (shot_id);
CREATE INDEX ON public.generations (shot_id);
CREATE INDEX ON public.canon_records (project_id, subject_type, subject_id);

-- DEMO SEEDER
CREATE OR REPLACE FUNCTION public.seed_demo_project()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid; seqid uuid; scid uuid; chid uuid; locid uuid;
  el1 uuid; el2 uuid; lookid uuid; bid uuid; shid uuid;
  descs text[] := ARRAY[
    'The cathedral doors grind open, dust and ash spilling into the nave.',
    'Sera steps through the threshold, boots crushing broken glass.',
    'One by one the torches along the aisle gutter and die.',
    'Something long-limbed shifts behind the shattered pillars.',
    'Sera draws the rune sword; its edge wakes with cold light.'
  ];
  cams jsonb[] := ARRAY[
    '{"size":"Wide","angle":"Low","movement":"Slow push in","lens":"24mm","dof":"Deep","composition":"Symmetrical"}'::jsonb,
    '{"size":"Medium","angle":"Eye level","movement":"Tracking","lens":"35mm","dof":"Medium","composition":"Centered"}'::jsonb,
    '{"size":"Wide","angle":"High","movement":"Static","lens":"28mm","dof":"Deep","composition":"Leading lines"}'::jsonb,
    '{"size":"Medium close","angle":"Dutch","movement":"Handheld drift","lens":"50mm","dof":"Shallow","composition":"Negative space"}'::jsonb,
    '{"size":"Close up","angle":"Low","movement":"Slow rise","lens":"85mm","dof":"Shallow","composition":"Rule of thirds"}'::jsonb
  ];
  i int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE user_id = uid) THEN
    RETURN (SELECT id FROM public.projects WHERE user_id = uid ORDER BY created_at LIMIT 1);
  END IF;

  INSERT INTO public.projects (user_id, title, description)
  VALUES (uid, 'Ashfall', 'A dark fantasy short. Sera returns to the cathedral that burned.')
  RETURNING id INTO pid;

  INSERT INTO public.sequences (user_id, project_id, title, sort_order)
  VALUES (uid, pid, 'Opening Cinematic', 0) RETURNING id INTO seqid;

  INSERT INTO public.scenes (user_id, sequence_id, title, brief, sort_order, status)
  VALUES (uid, seqid, 'The hero enters the ruined cathedral',
    'Night. Ash falls through the collapsed roof. Sera enters alone; the space turns hostile as the light dies.',
    0, 'drafting') RETURNING id INTO scid;

  INSERT INTO public.characters (user_id, project_id, name, role, description, attributes)
  VALUES (uid, pid, 'Sera, the hooded knight', 'Protagonist',
    'Weathered knight in a soot-stained hood and scaled cuirass. Scar across the left brow.',
    '{"age":"early 30s","build":"lean, tall","hair":"dark, cropped","signature":"grey hooded cloak"}'::jsonb)
  RETURNING id INTO chid;

  INSERT INTO public.locations (user_id, project_id, name, description)
  VALUES (uid, pid, 'Ruined Cathedral', 'Gothic nave with a collapsed roof, shattered stained glass, ash drifting through moonlight.')
  RETURNING id INTO locid;

  INSERT INTO public.elements (user_id, project_id, name, element_type, description)
  VALUES (uid, pid, 'Rune Sword', 'Prop', 'Longsword with pale blue runes etched down the fuller; glows faintly when drawn.')
  RETURNING id INTO el1;
  INSERT INTO public.elements (user_id, project_id, name, element_type, description)
  VALUES (uid, pid, 'Bone Censer', 'Prop', 'Hanging censer of carved bone, chain corroded, still smoking.')
  RETURNING id INTO el2;

  INSERT INTO public.looks (user_id, project_id, name, description, palette, prompt_fragments, negative_constraints)
  VALUES (uid, pid, 'Painterly Dark Fantasy',
    'Oil-painted realism, low key, single cold key light with warm practical accents.',
    '[{"name":"Moonlight Blue","hex":"#4A6FA5"},{"name":"Oxidized Bronze","hex":"#6E5B3E"},{"name":"Blood Red Accent","hex":"#8A1C1C"},{"name":"Ash Gray","hex":"#55575A"},{"name":"Warm Skin Highlight","hex":"#D9A066"}]'::jsonb,
    ARRAY['painterly oil texture','volumetric moonlight','falling ash particulate','cinematic anamorphic framing','muted desaturated palette'],
    ARRAY['no text','no watermark','no modern clothing','no lens flare','no oversaturated colors'])
  RETURNING id INTO lookid;

  FOR i IN 1..5 LOOP
    INSERT INTO public.beats (user_id, scene_id, description, sort_order)
    VALUES (uid, scid, descs[i], i - 1) RETURNING id INTO bid;

    INSERT INTO public.shots (user_id, scene_id, beat_id, shot_number, description, duration_seconds,
      camera, location_id, location_state, look_id, status, sort_order)
    VALUES (uid, scid, bid, format('1.%s', i), descs[i], 4 + i,
      cams[i], locid, '{"time":"night","condition":"ruined, ash falling"}'::jsonb, lookid,
      CASE i WHEN 1 THEN 'approved'::public.shot_status WHEN 2 THEN 'candidates'::public.shot_status
             WHEN 3 THEN 'ready'::public.shot_status WHEN 4 THEN 'drafting'::public.shot_status
             ELSE 'idea'::public.shot_status END,
      i - 1)
    RETURNING id INTO shid;

    INSERT INTO public.shot_characters (user_id, shot_id, character_id, state)
    VALUES (uid, shid, chid, '{"outfit":"grey hooded cloak, scaled cuirass","damage":"soot on left shoulder","props":"rune sword sheathed"}'::jsonb);

    IF i = 5 THEN
      UPDATE public.shots SET dialogue = 'SERA: "Still here, then."' WHERE id = shid;
      INSERT INTO public.shot_elements (user_id, shot_id, element_id, state)
      VALUES (uid, shid, el1, '{"state":"drawn, runes lit"}'::jsonb);
    ELSE
      INSERT INTO public.shot_elements (user_id, shot_id, element_id, state)
      VALUES (uid, shid, el2, '{"state":"hanging, smoking"}'::jsonb);
    END IF;
  END LOOP;

  RETURN pid;
END $$;

REVOKE ALL ON FUNCTION public.seed_demo_project() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_project() TO authenticated;
