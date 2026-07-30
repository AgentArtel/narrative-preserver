import { supabase } from "@/integrations/supabase/client";
import { asPalette, asRecord, type Camera } from "./storyforge";

export type BuiltPackage = {
  text: string;
  negativePrompt: string;
  referenceSummary: Record<string, unknown>;
  shotNumber: string;
};

function block(title: string, lines: string[]): string {
  if (!lines.length) return "";
  return `${title}\n${lines.map((l) => `  ${l}`).join("\n")}\n`;
}

export async function buildGenerationPackage(shotId: string): Promise<BuiltPackage> {
  const { data: shot, error } = await supabase
    .from("shots")
    .select("*, scenes(*, sequences(*, projects(*)))")
    .eq("id", shotId)
    .single();
  if (error) throw error;

  const scene = shot.scenes;
  const project = scene?.sequences?.projects;
  const projectId = project?.id as string;

  const [
    { data: shotChars },
    { data: shotEls },
    { data: location },
    { data: look },
    { data: canon },
    { data: prevShots },
    { data: refLinks },
  ] = await Promise.all([
    supabase.from("shot_characters").select("*, characters(*)").eq("shot_id", shotId),
    supabase.from("shot_elements").select("*, elements(*)").eq("shot_id", shotId),
    shot.location_id
      ? supabase.from("locations").select("*").eq("id", shot.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    shot.look_id
      ? supabase.from("looks").select("*").eq("id", shot.look_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("canon_records").select("*").eq("project_id", projectId),
    supabase
      .from("shots")
      .select("id, shot_number, sort_order, frames(image_url, is_approved)")
      .eq("scene_id", shot.scene_id)
      .lt("sort_order", shot.sort_order)
      .order("sort_order", { ascending: false })
      .limit(1),
    supabase.from("reference_links").select("*, asset_references(*)").eq("owner_id", shotId),
  ]);

  const charIds = (shotChars ?? []).map((sc) => sc.character_id);
  const elIds = (shotEls ?? []).map((se) => se.element_id);
  const nameById = new Map<string, string>();
  for (const sc of shotChars ?? []) if (sc.characters) nameById.set(sc.character_id, sc.characters.name);
  for (const se of shotEls ?? []) if (se.elements) nameById.set(se.element_id, se.elements.name);
  if (shot.location_id && location) nameById.set(shot.location_id, location.name);

  const assetOwnerIds = [
    ...charIds,
    ...elIds,
    ...(shot.location_id ? [shot.location_id] : []),
  ];
  const { data: assetLinks } = assetOwnerIds.length
    ? await supabase
        .from("reference_links")
        .select("*, asset_references(*)")
        .in("owner_type", ["characters", "locations", "elements"])
        .in("owner_id", assetOwnerIds)
    : { data: [] };


  const canonFor = (type: string, id: string) =>
    (canon ?? []).filter((c) => c.subject_type === type && c.subject_id === id);

  const camera = (shot.camera ?? {}) as Camera;
  const palette = asPalette(look?.palette);

  const prev = prevShots?.[0];
  const prevApproved = prev?.frames?.find((f) => f.is_approved)?.image_url;

  const lines: string[] = [];
  lines.push(`GENERATION PACKAGE — ${project?.title ?? "Project"} / Shot ${shot.shot_number}`);
  lines.push("");

  lines.push(
    block("SCENE", [
      `Sequence: ${scene?.sequences?.title ?? "—"}`,
      `Scene: ${scene?.title ?? "—"}`,
      `Brief: ${scene?.brief ?? "—"}`,
    ]),
  );

  lines.push(
    block("SHOT", [
      `Number: ${shot.shot_number}`,
      `Description: ${shot.description ?? "—"}`,
      `Dialogue: ${shot.dialogue ?? "—"}`,
      `Duration: ${shot.duration_seconds ?? "—"}s`,
      `Status: ${shot.status}`,
    ]),
  );

  lines.push(
    block(
      "CAMERA",
      Object.entries(camera)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`),
    ),
  );

  for (const sc of shotChars ?? []) {
    const c = sc.characters;
    if (!c) continue;
    const state = asRecord(sc.state);
    const attrs = asRecord(c.attributes);
    lines.push(
      block(`CHARACTER — ${c.name}`, [
        `Role: ${c.role ?? "—"}`,
        `Description: ${c.description ?? "—"}`,
        ...Object.entries(attrs).map(([k, v]) => `${k}: ${v}`),
        ...Object.entries(state).map(([k, v]) => `shot state / ${k}: ${v}`),
        ...canonFor("character", c.id).map((r) => `CANON / ${r.aspect}: ${r.description ?? ""}`),
      ]),
    );
  }

  if (location) {
    const ls = asRecord(shot.location_state);
    lines.push(
      block(`LOCATION — ${location.name}`, [
        `Description: ${location.description ?? "—"}`,
        ...Object.entries(ls).map(([k, v]) => `shot state / ${k}: ${v}`),
        ...canonFor("location", location.id).map(
          (r) => `CANON / ${r.aspect}: ${r.description ?? ""}`,
        ),
      ]),
    );
  }

  for (const se of shotEls ?? []) {
    const el = se.elements;
    if (!el) continue;
    lines.push(
      block(`ELEMENT — ${el.name}`, [
        `Type: ${el.element_type ?? "—"}`,
        `Description: ${el.description ?? "—"}`,
        ...Object.entries(asRecord(se.state)).map(([k, v]) => `shot state / ${k}: ${v}`),
        ...canonFor("element", el.id).map((r) => `CANON / ${r.aspect}: ${r.description ?? ""}`),
      ]),
    );
  }

  if (look) {
    lines.push(
      block(`LOOK — ${look.name}`, [
        `Description: ${look.description ?? "—"}`,
        `Palette: ${palette.map((p) => `${p.name} ${p.hex}`).join(", ") || "—"}`,
        `Prompt fragments: ${(look.prompt_fragments ?? []).join(", ") || "—"}`,
      ]),
    );
  }

  const sceneCanon = canonFor("scene", scene?.id ?? "");
  if (sceneCanon.length) {
    lines.push(
      block(
        "SCENE CANON",
        sceneCanon.map((r) => `${r.aspect}: ${r.description ?? ""}`),
      ),
    );
  }

  const shotCanon = canonFor("shot", shot.id);
  if (shotCanon.length) {
    lines.push(
      block(
        "SHOT CANON",
        shotCanon.map((r) => `${r.aspect}: ${r.description ?? ""}`),
      ),
    );
  }

  const refs = (refLinks ?? [])
    .map((l) => l.asset_references?.image_url)
    .filter(Boolean) as string[];

  const assetRefLines: string[] = [];
  const perAsset = new Map<string, number>();
  const assetRefs: string[] = [];
  for (const l of assetLinks ?? []) {
    const url = l.asset_references?.image_url;
    if (!url) continue;
    const name = nameById.get(l.owner_id) ?? "Asset";
    const n = (perAsset.get(name) ?? 0) + 1;
    perAsset.set(name, n);
    assetRefLines.push(`${name} reference ${n}: ${url}`);
    assetRefs.push(url);
  }

  lines.push(
    block("REFERENCES", [
      prevApproved
        ? `Previous approved frame (shot ${prev?.shot_number}): ${prevApproved}`
        : "Previous approved frame: none",
      ...assetRefLines,
      ...refs.map((u, i) => `Shot reference ${i + 1}: ${u}`),
    ]),
  );


  const negatives = look?.negative_constraints ?? [];
  lines.push(block("NEGATIVE CONSTRAINTS", negatives.length ? negatives : ["—"]));

  return {
    text: lines.filter(Boolean).join("\n"),
    negativePrompt: negatives.join(", "),
    shotNumber: shot.shot_number,
    referenceSummary: {
      characters: (shotChars ?? []).map((sc) => sc.characters?.name).filter(Boolean),
      location: location?.name ?? null,
      elements: (shotEls ?? []).map((se) => se.elements?.name).filter(Boolean),
      look: look?.name ?? null,
      palette: palette.map((p) => p.hex),
      previous_approved_frame: prevApproved ?? null,
      reference_images: [...assetRefs, ...refs],
      canon_records_applied: (canon ?? []).length,
    },
  };
}
