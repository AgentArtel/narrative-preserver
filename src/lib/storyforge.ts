import type { Database } from "@/integrations/supabase/types";

export type ShotStatus = Database["public"]["Enums"]["shot_status"];
export type FrameKind = Database["public"]["Enums"]["frame_kind"];
export type GenerationStatus = Database["public"]["Enums"]["generation_status"];
export type CanonSubject = Database["public"]["Enums"]["canon_subject"];

export const SHOT_STATUSES: ShotStatus[] = [
  "idea",
  "drafting",
  "ready",
  "generating",
  "candidates",
  "revision",
  "approved",
  "final",
];

export const FRAME_KINDS: FrameKind[] = [
  "concept",
  "storyboard",
  "keyframe",
  "start",
  "end",
  "final",
];

export const statusColor: Record<ShotStatus, string> = {
  idea: "var(--status-idea)",
  drafting: "var(--status-drafting)",
  ready: "var(--status-ready)",
  generating: "var(--status-generating)",
  candidates: "var(--status-candidates)",
  revision: "var(--status-revision)",
  approved: "var(--status-approved)",
  final: "var(--status-final)",
};

export const CANON_ASPECTS = [
  { key: "character_face", label: "Character face" },
  { key: "character_outfit", label: "Character outfit" },
  { key: "location_design", label: "Location design" },
  { key: "element_design", label: "Element design" },
  { key: "lighting", label: "Lighting" },
  { key: "composition", label: "Composition" },
] as const;

export const CAMERA_FIELDS = [
  { key: "size", label: "Shot size", placeholder: "Wide / Medium / Close up" },
  { key: "angle", label: "Angle", placeholder: "Low / Eye level / High" },
  { key: "movement", label: "Movement", placeholder: "Static / Push in / Tracking" },
  { key: "lens", label: "Lens", placeholder: "24mm / 50mm / 85mm" },
  { key: "dof", label: "Depth of field", placeholder: "Deep / Medium / Shallow" },
  { key: "composition", label: "Composition", placeholder: "Symmetrical / Thirds" },
] as const;

export type Camera = Partial<Record<(typeof CAMERA_FIELDS)[number]["key"], string>>;
export type PaletteEntry = { name: string; hex: string };

export const SCREEN_SIDES = [
  "left",
  "right",
  "centre",
  "upstage",
  "downstage",
  "overhead",
  "underfoot",
] as const;

export type ScreenSide = (typeof SCREEN_SIDES)[number];
export type Landmark = { name: string; side: ScreenSide };

export function asLandmarks(value: unknown): Landmark[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object")
    .map((v) => {
      const raw = v as { name?: unknown; side?: unknown };
      const side = String(raw.side ?? "centre") as ScreenSide;
      return {
        name: String(raw.name ?? ""),
        side: (SCREEN_SIDES as readonly string[]).includes(side) ? side : ("centre" as ScreenSide),
      };
    })
    .filter((l) => l.name);
}

export const LOCK_FIELDS = [
  {
    key: "style_lock",
    label: "Style lock",
    hint: "The medium: render technique, linework, shading value count, palette law, and the negative list of what it must never become.",
  },
  {
    key: "continuity",
    label: "Continuity",
    hint: "Character identity, world rules, location geography, and the palette law restated.",
  },
  {
    key: "direction",
    label: "Direction",
    hint: "Camera vocabulary, framing convention, cut style, sound-cue policy, and whether the project uses dialogue.",
  },
] as const;

export type LockKey = (typeof LOCK_FIELDS)[number]["key"];


export function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== null && v !== undefined && v !== "") out[k] = String(v);
  }
  return out;
}

export function asPalette(value: unknown): PaletteEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object")
    .map((v) => ({
      name: String((v as PaletteEntry).name ?? ""),
      hex: String((v as PaletteEntry).hex ?? ""),
    }));
}

export function stateSummary(state: unknown): string {
  const rec = asRecord(state);
  return Object.entries(rec)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}
