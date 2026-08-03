import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { asLandmarks, asPalette, asRecord, LOCK_FIELDS, type Camera } from "./storyforge";

export type DB = SupabaseClient<Database>;

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

/**
 * Locks are reproduced byte-identically in every prompt: no indenting, no
 * re-wrapping, no interpolation. Never route these through `block()`.
 */
function verbatimLock(title: string, text: string | null | undefined): string {
  if (!text || !text.trim()) return "";
  return `${title}\n${text}\n`;
}


/**
 * Compiles the full generation context for a shot. Parameterized by a Supabase
 * client so the browser (RLS as the user) and the MCP server route (scoped
 * server client) produce identical output.
 */
export async function buildGenerationPackageWith(
  supabase: DB,
  shotId: string,
): Promise<BuiltPackage> {
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
  for (const sc of shotChars ?? [])
    if (sc.characters) nameById.set(sc.character_id, sc.characters.name);
  for (const se of shotEls ?? []) if (se.elements) nameById.set(se.element_id, se.elements.name);
  if (shot.location_id && location) nameById.set(shot.location_id, location.name);

  const assetOwnerIds = [...charIds, ...elIds, ...(shot.location_id ? [shot.location_id] : [])];
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

  // Project locks, verbatim and first — identical in every prompt of this project.
  for (const f of LOCK_FIELDS) {
    lines.push(
      verbatimLock(
        f.label.toUpperCase(),
        (project as Record<string, unknown> | undefined)?.[f.key] as string | null | undefined,
      ),
    );
  }



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
    const landmarks = asLandmarks((location as Record<string, unknown>).landmarks);
    const anchor = (location as Record<string, unknown>).blocking_anchor as string | null;
    lines.push(
      block(`LOCATION — ${location.name}`, [
        `Description: ${location.description ?? "—"}`,
        ...landmarks.map((l) => `Landmark / ${l.name}: ${l.side}`),
        ...(anchor ? [`Blocking anchor: ${anchor}`] : []),
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

  // Provider Elements: what the operator must attach in the generation tool
  // before rendering. Named identities are how character and location identity
  // carries from one shot to the next.
  const identityOwnerIds = [...charIds, ...elIds, ...(shot.location_id ? [shot.location_id] : []), shot.id];
  const { data: identities } = await supabase
    .from("provider_identities")
    .select("provider, capability, external_id, owner_type, owner_id, status")
    .eq("status", "active")
    .in("owner_id", identityOwnerIds);

  const OWNER_LABEL: Record<string, string> = {
    characters: "character",
    locations: "location",
    elements: "element",
    shots: "shot",
  };

  const providerElements = (identities ?? [])
    .map((pi) => ({
      provider: pi.provider,
      owner_type: OWNER_LABEL[pi.owner_type] ?? pi.owner_type,
      owner_name:
        pi.owner_id === shot.id
          ? `Shot ${shot.shot_number}`
          : (nameById.get(pi.owner_id) ?? "Unknown"),
      capability: pi.capability ?? "—",
      external_id: pi.external_id,
    }))
    .sort(
      (a, b) =>
        a.provider.localeCompare(b.provider) ||
        a.owner_type.localeCompare(b.owner_type) ||
        a.owner_name.localeCompare(b.owner_name) ||
        a.external_id.localeCompare(b.external_id),
    );

  if (providerElements.length) {
    const peLines: string[] = [];
    let currentProvider: string | null = null;
    for (const pe of providerElements) {
      if (pe.provider !== currentProvider) {
        currentProvider = pe.provider;
        peLines.push(`${currentProvider}:`);
      }
      peLines.push(
        `- ${pe.owner_name} (${pe.owner_type}) — ${pe.capability}: ${pe.external_id}`,
      );
    }
    lines.push(
      block("PROVIDER ELEMENTS — attach these in the generation tool before rendering", peLines),
    );
  }

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
      provider_elements: providerElements,
      canon_records_applied: (canon ?? []).length,
    },
  };
}
