// Server-only: MCP (Model Context Protocol) surface for StoryForge.
// Stateless JSON-RPC over HTTP. Every query is explicitly scoped to the
// user resolved from the presented API key, because the client is service-role.
import type { DB } from "@/lib/generation-package-core";
import { buildGenerationPackageWith } from "@/lib/generation-package-core";
import { insertFramesFromUrls } from "@/lib/frames-core";
import { SHOT_STATUSES, FRAME_KINDS } from "@/lib/storyforge";
import type { CanonSubject, FrameKind, GenerationStatus, ShotStatus } from "@/lib/storyforge";

const CANON_SUBJECTS: CanonSubject[] = ["character", "location", "element", "scene", "shot"];
const GENERATION_STATUSES: GenerationStatus[] = ["handed_off", "imported", "rejected"];
const OWNER_TYPES = ["characters", "locations", "elements", "shots"] as const;

export const PROTOCOL_VERSION = "2025-06-18";

export async function sha256Hex(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type Ctx = { db: DB; userId: string };

export async function authenticate(rawKey: string | null): Promise<Ctx | null> {
  if (!rawKey) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as DB;
  const hash = await sha256Hex(rawKey);
  const { data } = await db
    .from("api_keys")
    .select("id, user_id")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data) return null;
  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { db, userId: data.user_id };
}

/* ---------------------------------------------------------------- helpers */

type Args = Record<string, unknown>;

function str(a: Args, k: string, required = true): string {
  const v = a[k];
  if (typeof v !== "string" || !v.trim()) {
    if (required) throw new Error(`Missing required string argument "${k}"`);
    return "";
  }
  return v;
}
function optStr(a: Args, k: string): string | null {
  const v = a[k];
  return typeof v === "string" && v.length ? v : null;
}
function optNum(a: Args, k: string): number | null {
  const v = a[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function optObj(a: Args, k: string): Record<string, unknown> | null {
  const v = a[k];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function strArray(a: Args, k: string): string[] {
  const v = a[k];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error(`Argument "${k}" must be an array of strings`);
  }
  return v as string[];
}
function oneOf<T extends string>(value: string, allowed: readonly T[], label: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid ${label} "${value}". Allowed: ${allowed.join(", ")}`);
  }
  return value as T;
}

/** Verifies a referenced row belongs to the authenticated user. */
async function own(ctx: Ctx, table: string, id: string, select = "id"): Promise<Record<string, unknown>> {
  const { data, error } = await ctx.db
    .from(table as never)
    .select(select)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${table} ${id} not found for this account`);
  return data as Record<string, unknown>;
}

/** Resolves the project id that owns a scene / sequence / shot chain. */
async function projectIdForShot(ctx: Ctx, shotId: string): Promise<string> {
  const shot = (await own(ctx, "shots", shotId, "id, scene_id")) as { scene_id: string };
  const scene = (await own(ctx, "scenes", shot.scene_id, "id, sequence_id")) as {
    sequence_id: string;
  };
  const seq = (await own(ctx, "sequences", scene.sequence_id, "id, project_id")) as {
    project_id: string;
  };
  return seq.project_id;
}

async function nextOrder(ctx: Ctx, table: string, column: string, value: string): Promise<number> {
  const { count } = await ctx.db
    .from(table as never)
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .eq("user_id", ctx.userId);
  return count ?? 0;
}

async function insertRow<T extends Record<string, unknown>>(
  ctx: Ctx,
  table: string,
  row: T,
  select = "*",
) {
  const { data, error } = await ctx.db
    .from(table as never)
    .insert({ ...row, user_id: ctx.userId } as never)
    .select(select)
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

/** Generic name-scoped upsert used by the asset tools. */
async function upsertNamed(
  ctx: Ctx,
  table: string,
  projectId: string,
  name: string,
  fields: Record<string, unknown>,
) {
  await own(ctx, "projects", projectId);
  const { data: existing } = await ctx.db
    .from(table as never)
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", ctx.userId)
    .eq("name", name)
    .maybeSingle();
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null));
  if (existing) {
    const id = (existing as { id: string }).id;
    if (Object.keys(patch).length) {
      const { error } = await ctx.db
        .from(table as never)
        .update(patch as never)
        .eq("id", id)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
    }
    return { id, name, created: false };
  }
  const row = await insertRow(ctx, table, { project_id: projectId, name, ...patch }, "id");
  return { id: row.id as string, name, created: true };
}

/* ------------------------------------------------------------ tool schema */

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (ctx: Ctx, args: Args) => Promise<unknown>;
};

const S = {
  string: { type: "string" },
  number: { type: "number" },
  object: { type: "object" },
  stringArray: { type: "array", items: { type: "string" } },
};

function schema(props: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties: props, required, additionalProperties: false };
}

const UPDATABLE_SHOT_KEYS = [
  "description",
  "dialogue",
  "duration_seconds",
  "camera",
  "location_id",
  "location_state",
  "look_id",
  "status",
  "beat_id",
  "shot_number",
] as const;

export const TOOLS: Tool[] = [
  {
    name: "list_projects",
    description: "List all StoryForge projects for this account.",
    inputSchema: schema({}),
    handler: async (ctx) => {
      const { data, error } = await ctx.db
        .from("projects")
        .select("id, title, description, status")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "get_project_overview",
    description:
      "Full orientation for one project: sequence → scene → shot tree plus cast, locations, elements, looks and canon count.",
    inputSchema: schema({ project_id: S.string }, ["project_id"]),
    handler: async (ctx, a) => {
      const projectId = str(a, "project_id");
      const project = await own(ctx, "projects", projectId, "id, title, description, status");
      const [seqs, characters, locations, elements, looks, canon] = await Promise.all([
        ctx.db
          .from("sequences")
          .select(
            "id, title, sort_order, scenes(id, title, brief, status, sort_order, shots(id, shot_number, status, description, sort_order))",
          )
          .eq("project_id", projectId)
          .eq("user_id", ctx.userId)
          .order("sort_order"),
        ctx.db.from("characters").select("id, name, role, description").eq("project_id", projectId).eq("user_id", ctx.userId),
        ctx.db.from("locations").select("id, name, description").eq("project_id", projectId).eq("user_id", ctx.userId),
        ctx.db.from("elements").select("id, name, element_type, description").eq("project_id", projectId).eq("user_id", ctx.userId),
        ctx.db.from("looks").select("id, name, description, palette, prompt_fragments, negative_constraints").eq("project_id", projectId).eq("user_id", ctx.userId),
        ctx.db
          .from("canon_records")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("user_id", ctx.userId),
      ]);
      return {
        project,
        sequences: seqs.data ?? [],
        characters: characters.data ?? [],
        locations: locations.data ?? [],
        elements: elements.data ?? [],
        looks: looks.data ?? [],
        canon_count: canon.count ?? 0,
      };
    },
  },
  {
    name: "get_context_package",
    description:
      "Compile the full generation context for a shot (scene, camera, cast state, location, elements, look, canon, references).",
    inputSchema: schema({ shot_id: S.string }, ["shot_id"]),
    handler: async (ctx, a) => {
      const shotId = str(a, "shot_id");
      await own(ctx, "shots", shotId);
      const pkg = await buildGenerationPackageWith(ctx.db, shotId);
      return {
        shot_id: shotId,
        text: pkg.text,
        negative_prompt: pkg.negativePrompt,
        reference_summary: pkg.referenceSummary,
      };
    },
  },
  {
    name: "list_canon",
    description: "List canon records for a project, optionally filtered by subject.",
    inputSchema: schema(
      { project_id: S.string, subject_type: S.string, subject_id: S.string },
      ["project_id"],
    ),
    handler: async (ctx, a) => {
      const projectId = str(a, "project_id");
      await own(ctx, "projects", projectId);
      let q = ctx.db
        .from("canon_records")
        .select("id, subject_type, subject_id, aspect, description, source_frame_id, created_at")
        .eq("project_id", projectId)
        .eq("user_id", ctx.userId);
      const st = optStr(a, "subject_type");
      if (st) q = q.eq("subject_type", oneOf(st, CANON_SUBJECTS, "subject_type"));
      const sid = optStr(a, "subject_id");
      if (sid) q = q.eq("subject_id", sid);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data;
    },
  },

  /* ---------------------------------------------------------- assets */
  {
    name: "upsert_character",
    description: "Create or update a character, matched on project + name.",
    inputSchema: schema(
      {
        project_id: S.string,
        name: S.string,
        role: S.string,
        description: S.string,
        attributes: S.object,
      },
      ["project_id", "name"],
    ),
    handler: (ctx, a) =>
      upsertNamed(ctx, "characters", str(a, "project_id"), str(a, "name"), {
        role: optStr(a, "role"),
        description: optStr(a, "description"),
        attributes: optObj(a, "attributes"),
      }),
  },
  {
    name: "upsert_location",
    description: "Create or update a location, matched on project + name.",
    inputSchema: schema({ project_id: S.string, name: S.string, description: S.string }, [
      "project_id",
      "name",
    ]),
    handler: (ctx, a) =>
      upsertNamed(ctx, "locations", str(a, "project_id"), str(a, "name"), {
        description: optStr(a, "description"),
      }),
  },
  {
    name: "upsert_element",
    description: "Create or update an element (prop, effect, creature), matched on project + name.",
    inputSchema: schema(
      { project_id: S.string, name: S.string, element_type: S.string, description: S.string },
      ["project_id", "name"],
    ),
    handler: (ctx, a) =>
      upsertNamed(ctx, "elements", str(a, "project_id"), str(a, "name"), {
        element_type: optStr(a, "element_type"),
        description: optStr(a, "description"),
      }),
  },
  {
    name: "upsert_look",
    description: "Create or update a visual look, matched on project + name.",
    inputSchema: schema(
      {
        project_id: S.string,
        name: S.string,
        description: S.string,
        palette: {
          type: "array",
          items: schema({ name: S.string, hex: S.string }, ["name", "hex"]),
        },
        prompt_fragments: S.stringArray,
        negative_constraints: S.stringArray,
      },
      ["project_id", "name"],
    ),
    handler: (ctx, a) =>
      upsertNamed(ctx, "looks", str(a, "project_id"), str(a, "name"), {
        description: optStr(a, "description"),
        palette: Array.isArray(a.palette) ? a.palette : null,
        prompt_fragments: a.prompt_fragments ? strArray(a, "prompt_fragments") : null,
        negative_constraints: a.negative_constraints ? strArray(a, "negative_constraints") : null,
      }),
  },
  {
    name: "attach_reference",
    description:
      "Store a reference image and link it to a character, location, element or shot (owner_type uses table names).",
    inputSchema: schema(
      {
        project_id: S.string,
        image_url: S.string,
        owner_type: { type: "string", enum: [...OWNER_TYPES] },
        owner_id: S.string,
        role: S.string,
        notes: S.string,
      },
      ["project_id", "image_url", "owner_type", "owner_id"],
    ),
    handler: async (ctx, a) => {
      const projectId = str(a, "project_id");
      await own(ctx, "projects", projectId);
      const ownerType = oneOf(str(a, "owner_type"), OWNER_TYPES, "owner_type");
      const ownerId = str(a, "owner_id");
      await own(ctx, ownerType, ownerId);
      const role = optStr(a, "role") ?? "primary";
      const ref = await insertRow(
        ctx,
        "asset_references",
        {
          project_id: projectId,
          image_url: str(a, "image_url"),
          roles: [role],
          notes: optStr(a, "notes"),
        },
        "id",
      );
      const link = await insertRow(
        ctx,
        "reference_links",
        { reference_id: ref.id, owner_type: ownerType, owner_id: ownerId, role },
        "id",
      );
      return { reference_id: ref.id, reference_link_id: link.id, owner_type: ownerType, owner_id: ownerId };
    },
  },
  {
    name: "register_provider_identity",
    description:
      "Record an external provider identity (e.g. a Higgsfield Soul ID) against a character, location, element or shot.",
    inputSchema: schema(
      {
        provider: S.string,
        capability: S.string,
        external_id: S.string,
        owner_type: { type: "string", enum: [...OWNER_TYPES] },
        owner_id: S.string,
        status: S.string,
        metadata: S.object,
      },
      ["provider", "external_id", "owner_type", "owner_id"],
    ),
    handler: async (ctx, a) => {
      const ownerType = oneOf(str(a, "owner_type"), OWNER_TYPES, "owner_type");
      const ownerId = str(a, "owner_id");
      await own(ctx, ownerType, ownerId);
      const row = await insertRow(
        ctx,
        "provider_identities",
        {
          provider: str(a, "provider"),
          capability: optStr(a, "capability"),
          external_id: str(a, "external_id"),
          owner_type: ownerType,
          owner_id: ownerId,
          status: optStr(a, "status") ?? "active",
          metadata: optObj(a, "metadata") ?? {},
        },
        "id",
      );
      return { provider_identity_id: row.id };
    },
  },

  /* -------------------------------------------------------- structure */
  {
    name: "create_sequence",
    description: "Create a sequence in a project, appended at the end.",
    inputSchema: schema({ project_id: S.string, title: S.string }, ["project_id", "title"]),
    handler: async (ctx, a) => {
      const projectId = str(a, "project_id");
      await own(ctx, "projects", projectId);
      const row = await insertRow(
        ctx,
        "sequences",
        {
          project_id: projectId,
          title: str(a, "title"),
          sort_order: await nextOrder(ctx, "sequences", "project_id", projectId),
        },
        "id",
      );
      return { sequence_id: row.id };
    },
  },
  {
    name: "create_scene",
    description: "Create a scene in a sequence, appended at the end with status 'drafting'.",
    inputSchema: schema({ sequence_id: S.string, title: S.string, brief: S.string }, [
      "sequence_id",
      "title",
    ]),
    handler: async (ctx, a) => {
      const seqId = str(a, "sequence_id");
      await own(ctx, "sequences", seqId);
      const row = await insertRow(
        ctx,
        "scenes",
        {
          sequence_id: seqId,
          title: str(a, "title"),
          brief: optStr(a, "brief"),
          status: "drafting",
          sort_order: await nextOrder(ctx, "scenes", "sequence_id", seqId),
        },
        "id",
      );
      return { scene_id: row.id };
    },
  },
  {
    name: "create_beats",
    description: "Append beats to a scene, in the given order.",
    inputSchema: schema({ scene_id: S.string, descriptions: S.stringArray }, [
      "scene_id",
      "descriptions",
    ]),
    handler: async (ctx, a) => {
      const sceneId = str(a, "scene_id");
      await own(ctx, "scenes", sceneId);
      const descriptions = strArray(a, "descriptions");
      const base = await nextOrder(ctx, "beats", "scene_id", sceneId);
      const { data, error } = await ctx.db
        .from("beats")
        .insert(
          descriptions.map((description, i) => ({
            user_id: ctx.userId,
            scene_id: sceneId,
            description,
            sort_order: base + i,
          })),
        )
        .select("id");
      if (error) throw new Error(error.message);
      return { beat_ids: (data ?? []).map((b) => b.id) };
    },
  },
  {
    name: "create_shot",
    description: "Create a shot in a scene, appended at the end with status 'idea'.",
    inputSchema: schema(
      {
        scene_id: S.string,
        description: S.string,
        shot_number: S.string,
        dialogue: S.string,
        duration_seconds: S.number,
        camera: S.object,
        beat_id: S.string,
        location_id: S.string,
        location_state: S.object,
        look_id: S.string,
      },
      ["scene_id", "description"],
    ),
    handler: async (ctx, a) => {
      const sceneId = str(a, "scene_id");
      await own(ctx, "scenes", sceneId);
      const beatId = optStr(a, "beat_id");
      if (beatId) await own(ctx, "beats", beatId);
      const locationId = optStr(a, "location_id");
      if (locationId) await own(ctx, "locations", locationId);
      const lookId = optStr(a, "look_id");
      if (lookId) await own(ctx, "looks", lookId);
      const order = await nextOrder(ctx, "shots", "scene_id", sceneId);
      const row = await insertRow(
        ctx,
        "shots",
        {
          scene_id: sceneId,
          beat_id: beatId,
          shot_number: optStr(a, "shot_number") ?? String(order + 1),
          description: str(a, "description"),
          dialogue: optStr(a, "dialogue"),
          duration_seconds: optNum(a, "duration_seconds"),
          camera: optObj(a, "camera") ?? {},
          location_id: locationId,
          location_state: optObj(a, "location_state") ?? {},
          look_id: lookId,
          status: "idea",
          sort_order: order,
        },
        "id",
      );
      return { shot_id: row.id };
    },
  },
  {
    name: "update_shot",
    description:
      "Patch a shot. Allowed keys: description, dialogue, duration_seconds, camera, location_id, location_state, look_id, status, beat_id, shot_number.",
    inputSchema: schema({ shot_id: S.string, patch: S.object }, ["shot_id", "patch"]),
    handler: async (ctx, a) => {
      const shotId = str(a, "shot_id");
      await own(ctx, "shots", shotId);
      const patch = optObj(a, "patch");
      if (!patch || !Object.keys(patch).length) throw new Error("patch must be a non-empty object");
      for (const k of Object.keys(patch)) {
        if (!(UPDATABLE_SHOT_KEYS as readonly string[]).includes(k)) {
          throw new Error(`Unknown shot field "${k}". Allowed: ${UPDATABLE_SHOT_KEYS.join(", ")}`);
        }
      }
      if (typeof patch.status === "string") {
        oneOf(patch.status, SHOT_STATUSES as ShotStatus[], "shot status");
      }
      if (typeof patch.location_id === "string") await own(ctx, "locations", patch.location_id);
      if (typeof patch.look_id === "string") await own(ctx, "looks", patch.look_id);
      if (typeof patch.beat_id === "string") await own(ctx, "beats", patch.beat_id);
      const { error } = await ctx.db
        .from("shots")
        .update(patch as never)
        .eq("id", shotId)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      return { shot_id: shotId, updated: Object.keys(patch) };
    },
  },
  {
    name: "add_character_to_shot",
    description: "Attach a character to a shot with per-shot state (merged into any existing state).",
    inputSchema: schema({ shot_id: S.string, character_id: S.string, state: S.object }, [
      "shot_id",
      "character_id",
    ]),
    handler: (ctx, a) =>
      addJoin(ctx, "shot_characters", "character_id", "characters", str(a, "shot_id"), str(a, "character_id"), optObj(a, "state")),
  },
  {
    name: "add_element_to_shot",
    description: "Attach an element to a shot with per-shot state (merged into any existing state).",
    inputSchema: schema({ shot_id: S.string, element_id: S.string, state: S.object }, [
      "shot_id",
      "element_id",
    ]),
    handler: (ctx, a) =>
      addJoin(ctx, "shot_elements", "element_id", "elements", str(a, "shot_id"), str(a, "element_id"), optObj(a, "state")),
  },

  /* -------------------------------------------------- generation flow */
  {
    name: "log_generation",
    description: "Record a generation handoff for a shot.",
    inputSchema: schema(
      {
        shot_id: S.string,
        provider: S.string,
        tool: S.string,
        model: S.string,
        prompt: S.string,
        negative_prompt: S.string,
        settings: S.object,
        status: { type: "string", enum: GENERATION_STATUSES },
        cost_credits: S.number,
      },
      ["shot_id"],
    ),
    handler: async (ctx, a) => {
      const shotId = str(a, "shot_id");
      await own(ctx, "shots", shotId);
      const status = optStr(a, "status");
      const row = await insertRow(
        ctx,
        "generations",
        {
          shot_id: shotId,
          provider: optStr(a, "provider") ?? "higgsfield",
          tool: optStr(a, "tool"),
          model: optStr(a, "model"),
          prompt: optStr(a, "prompt") ?? "",
          negative_prompt: optStr(a, "negative_prompt"),
          settings: optObj(a, "settings") ?? {},
          status: status ? oneOf(status, GENERATION_STATUSES, "generation status") : "handed_off",
          cost_credits: optNum(a, "cost_credits"),
        },
        "id",
      );
      return { generation_id: row.id };
    },
  },
  {
    name: "add_frames",
    description:
      "Insert candidate frames from image URLs. With generation_id, marks that generation imported and the shot 'candidates'.",
    inputSchema: schema(
      {
        shot_id: S.string,
        image_urls: S.stringArray,
        kind: { type: "string", enum: FRAME_KINDS },
        generation_id: S.string,
        notes: S.string,
      },
      ["shot_id", "image_urls"],
    ),
    handler: async (ctx, a) => {
      const shotId = str(a, "shot_id");
      await own(ctx, "shots", shotId);
      const generationId = optStr(a, "generation_id");
      if (generationId) await own(ctx, "generations", generationId);
      const kindRaw = optStr(a, "kind");
      const frameIds = await insertFramesFromUrls(ctx.db, {
        userId: ctx.userId,
        shotId,
        imageUrls: strArray(a, "image_urls"),
        kind: kindRaw ? oneOf(kindRaw, FRAME_KINDS as FrameKind[], "frame kind") : "keyframe",
        generationId,
        notes: optStr(a, "notes"),
      });
      return { shot_id: shotId, frame_ids: frameIds, generation_id: generationId };
    },
  },
  {
    name: "promote_canon",
    description:
      "Create or update a canon record for a subject + aspect (re-promoting an aspect updates it instead of duplicating).",
    inputSchema: schema(
      {
        project_id: S.string,
        subject_type: { type: "string", enum: CANON_SUBJECTS },
        subject_id: S.string,
        aspect: S.string,
        description: S.string,
        source_frame_id: S.string,
      },
      ["project_id", "subject_type", "subject_id", "aspect", "description"],
    ),
    handler: async (ctx, a) => {
      const projectId = str(a, "project_id");
      await own(ctx, "projects", projectId);
      const subjectType = oneOf(str(a, "subject_type"), CANON_SUBJECTS, "subject_type");
      const subjectId = str(a, "subject_id");
      const aspect = str(a, "aspect");
      const description = str(a, "description");
      const sourceFrameId = optStr(a, "source_frame_id");
      if (sourceFrameId) await own(ctx, "frames", sourceFrameId);
      const { data: existing } = await ctx.db
        .from("canon_records")
        .select("id")
        .eq("project_id", projectId)
        .eq("user_id", ctx.userId)
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .eq("aspect", aspect)
        .maybeSingle();
      if (existing) {
        const { error } = await ctx.db
          .from("canon_records")
          .update({ description, source_frame_id: sourceFrameId })
          .eq("id", existing.id)
          .eq("user_id", ctx.userId);
        if (error) throw new Error(error.message);
        return { canon_record_id: existing.id, created: false };
      }
      const row = await insertRow(
        ctx,
        "canon_records",
        {
          project_id: projectId,
          subject_type: subjectType,
          subject_id: subjectId,
          aspect,
          description,
          source_frame_id: sourceFrameId,
        },
        "id",
      );
      return { canon_record_id: row.id, created: true };
    },
  },
  {
    name: "approve_frame",
    description:
      "Approve a frame: unapproves sibling frames on the shot and moves the shot to 'approved' unless it is already 'final'.",
    inputSchema: schema({ frame_id: S.string }, ["frame_id"]),
    handler: async (ctx, a) => {
      const frameId = str(a, "frame_id");
      const frame = (await own(ctx, "frames", frameId, "id, shot_id")) as { shot_id: string };
      const shot = (await own(ctx, "shots", frame.shot_id, "id, status")) as { status: ShotStatus };
      await ctx.db
        .from("frames")
        .update({ is_approved: false })
        .eq("shot_id", frame.shot_id)
        .eq("user_id", ctx.userId);
      const { error } = await ctx.db
        .from("frames")
        .update({ is_approved: true })
        .eq("id", frameId)
        .eq("user_id", ctx.userId);
      if (error) throw new Error(error.message);
      if (shot.status !== "final") {
        await ctx.db
          .from("shots")
          .update({ status: "approved" })
          .eq("id", frame.shot_id)
          .eq("user_id", ctx.userId);
      }
      return { frame_id: frameId, shot_id: frame.shot_id, shot_status: shot.status === "final" ? "final" : "approved" };
    },
  },
];

async function addJoin(
  ctx: Ctx,
  table: "shot_characters" | "shot_elements",
  fkColumn: "character_id" | "element_id",
  assetTable: "characters" | "elements",
  shotId: string,
  assetId: string,
  state: Record<string, unknown> | null,
) {
  await own(ctx, "shots", shotId);
  await own(ctx, assetTable, assetId);
  const { data: existing } = await ctx.db
    .from(table)
    .select("id, state")
    .eq("shot_id", shotId)
    .eq(fkColumn, assetId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (existing) {
    const merged = { ...(existing.state as Record<string, unknown>), ...(state ?? {}) };
    const { error } = await ctx.db
      .from(table)
      .update({ state: merged as never })
      .eq("id", existing.id)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return { id: existing.id, shot_id: shotId, [fkColumn]: assetId, created: false };
  }
  const row = await insertRow(ctx, table, { shot_id: shotId, [fkColumn]: assetId, state: state ?? {} }, "id");
  return { id: row.id, shot_id: shotId, [fkColumn]: assetId, created: true };
}

/* ------------------------------------------------------------- JSON-RPC */

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: string; params?: Args };

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export async function handleRpc(body: RpcRequest, ctx: Ctx): Promise<unknown | null> {
  const { method, id, params } = body;
  switch (method) {
    case "initialize": {
      const requested = (params?.protocolVersion as string) || PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: requested,
        capabilities: { tools: {} },
        serverInfo: { name: "storyforge", version: "1.0.0" },
      });
    }
    case "notifications/initialized":
      return null;
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      const name = params?.name as string;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Unknown tool "${name}"` }],
          isError: true,
        });
      }
      try {
        const result = await tool.handler(ctx, (params?.arguments as Args) ?? {});
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (e) {
        return rpcResult(id, {
          content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }],
          isError: true,
        });
      }
    }
    default:
      if (method?.startsWith("notifications/")) return null;
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export { rpcError };
