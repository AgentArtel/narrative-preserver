/**
 * Phase 2 craft layer: editable vocabularies, render-risk tails, keyframe
 * pairing forms, the five location locks and the pipeline gate ladder.
 *
 * Pure functions only — shared verbatim between the browser and the MCP
 * server so a warning shown in the editor is the warning an agent gets back.
 */

/* ----------------------------------------------------------- vocabularies */

export type VocabRow = {
  id: string;
  project_id: string | null;
  slug: string;
  label: string;
  description: string | null;
  hidden: boolean;
  sort_order: number;
};

export type CameraMoveRow = VocabRow & { is_time_move: boolean; implies_motion: boolean };
export type RiskClassRow = VocabRow & { guidance: string | null };

export const UNDECLARED_MOVE_HINT =
  "An undeclared move renders as a slow push-in — silence is not neutral.";

export const TIME_MOVE_HINT =
  "Slow motion is a time move. Fuse it to a framing move (e.g. “push, close slow-mo”), never use it bare.";

/**
 * A project row with the same slug replaces the global seed row; hidden rows
 * drop out. This is how a project adds a fourteenth move without a deploy.
 */
export function mergeVocab<T extends VocabRow>(rows: T[]): T[] {
  const bySlug = new Map<string, T>();
  for (const r of rows) if (!r.project_id) bySlug.set(r.slug, r);
  for (const r of rows) if (r.project_id) bySlug.set(r.slug, r);
  return [...bySlug.values()]
    .filter((r) => !r.hidden)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-–—]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** A movement field may fuse several moves: "push, close slow-mo". */
export function parseMovementTokens(movement: string | null | undefined): string[] {
  if (!movement) return [];
  return movement
    .split(/[,+&/]|\band\b/i)
    .map((t) => normalizeToken(t))
    .filter(Boolean);
}

export function matchMove(token: string, moves: CameraMoveRow[]): CameraMoveRow | undefined {
  return moves.find((m) => normalizeToken(m.slug) === token || normalizeToken(m.label) === token);
}

/** Warn — never reject. Operators are often mid-thought. */
export function cameraMoveWarnings(
  movement: string | null | undefined,
  moves: CameraMoveRow[],
): string[] {
  const warnings: string[] = [];
  const tokens = parseMovementTokens(movement);
  if (!tokens.length) {
    warnings.push(`No camera move declared. ${UNDECLARED_MOVE_HINT}`);
    return warnings;
  }
  const allowed = moves.map((m) => m.label).join(", ");
  const matched: CameraMoveRow[] = [];
  for (const t of tokens) {
    const m = matchMove(t, moves);
    if (m) matched.push(m);
    else
      warnings.push(
        `Camera move "${t}" is not in this project's vocabulary. Allowed: ${allowed || "none defined"}.`,
      );
  }
  if (matched.length && matched.every((m) => m.is_time_move)) {
    warnings.push(TIME_MOVE_HINT);
  }
  return warnings;
}

/** True when any declared move moves the camera — drives the keyframe form check. */
export function movementImpliesMotion(
  movement: string | null | undefined,
  moves: CameraMoveRow[],
): boolean {
  return parseMovementTokens(movement).some((t) => matchMove(t, moves)?.implies_motion === true);
}

/* -------------------------------------------------------------- risk tail */

export type RiskOccurred = "yes" | "no" | null;
export type RiskEntry = {
  class: string;
  prediction: string;
  fallback: string;
  occurred: RiskOccurred;
};

export function asRiskTail(value: unknown): RiskEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object")
    .map((v) => {
      const raw = v as Record<string, unknown>;
      const occurred = raw.occurred;
      return {
        class: String(raw.class ?? ""),
        prediction: String(raw.prediction ?? ""),
        fallback: String(raw.fallback ?? ""),
        occurred: (occurred === "yes" || occurred === "no" ? occurred : null) as RiskOccurred,
      };
    })
    .filter((e) => e.class || e.prediction || e.fallback);
}

export const RISK_SPLIT_WARNING =
  "Three or more distinct risk classes on one shot — this is really a sequence and should be split.";

export function riskTailWarnings(entries: RiskEntry[], classes: RiskClassRow[]): string[] {
  const warnings: string[] = [];
  const known = new Set(classes.map((c) => c.slug));
  const distinct = new Set(entries.map((e) => e.class).filter(Boolean));
  for (const c of distinct) {
    if (known.size && !known.has(c)) {
      warnings.push(
        `Risk class "${c}" is not in this project's vocabulary. Allowed: ${[...known].join(", ")}.`,
      );
    }
  }
  if (distinct.size >= 3) warnings.push(RISK_SPLIT_WARNING);
  return warnings;
}

/* --------------------------------------------------------- keyframe pairs */

export const KEYFRAME_FORMS = [
  {
    value: "locked_camera",
    label: "Locked camera",
    hint: "Framing is identical in a and b; only the subject moved.",
  },
  {
    value: "moving_camera",
    label: "Moving camera",
    hint: "a and b are the start and end of the camera move, so the framings must differ.",
  },
] as const;

export type KeyframeForm = (typeof KEYFRAME_FORMS)[number]["value"];

export const KEYFRAME_FORM_HELP =
  "Picking the wrong form is the most common failure in the pipeline: locked-camera form on a moving shot yields an inert clip, moving-camera form on a locked shot yields a drift nobody asked for.";

export function keyframeFormWarnings(
  form: string | null | undefined,
  movement: string | null | undefined,
  moves: CameraMoveRow[],
): string[] {
  if (!form) return ["This pair has no form recorded — the video model will guess the move."];
  const motion = movementImpliesMotion(movement, moves);
  if (form === "moving_camera" && !motion && parseMovementTokens(movement).length) {
    return ["Moving-camera form on a shot whose declared move holds the camera still."];
  }
  if (form === "locked_camera" && motion) {
    return ["Locked-camera form on a shot whose declared move travels the camera."];
  }
  return [];
}

/* --------------------------------------------------------- location locks */

export const DEPTH_PLANES = ["foreground", "midground", "background"] as const;
export type DepthPlaneName = (typeof DEPTH_PLANES)[number];
export type DepthPlane = { plane: DepthPlaneName; contents: string };

export function asDepthPlanes(value: unknown): DepthPlane[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object")
    .map((v) => {
      const raw = v as Record<string, unknown>;
      const plane = String(raw.plane ?? "foreground") as DepthPlaneName;
      return {
        plane: (DEPTH_PLANES as readonly string[]).includes(plane) ? plane : "foreground",
        contents: String(raw.contents ?? ""),
      };
    })
    .filter((p) => p.contents);
}

export const LOCATION_LOCKS = [
  { key: "geography", label: "Geography" },
  { key: "blocking_anchor", label: "Blocking anchor" },
  { key: "light_logic", label: "Light logic" },
  { key: "materials", label: "Materials" },
  { key: "depth", label: "Depth" },
] as const;

export type LocationLockKey = (typeof LOCATION_LOCKS)[number]["key"];

export type LocationLockSource = {
  landmarks?: unknown;
  blocking_anchor?: string | null;
  light_logic?: string | null;
  materials?: string | null;
  depth_planes?: unknown;
  reverse_verified_at?: string | null;
};

export function locationLockState(loc: LocationLockSource | null | undefined) {
  const filled: Record<LocationLockKey, boolean> = {
    geography: Array.isArray(loc?.landmarks) && (loc!.landmarks as unknown[]).length > 0,
    blocking_anchor: !!loc?.blocking_anchor?.trim(),
    light_logic: !!loc?.light_logic?.trim(),
    materials: !!loc?.materials?.trim(),
    depth: asDepthPlanes(loc?.depth_planes).length > 0,
  };
  const allFilled = LOCATION_LOCKS.every((l) => filled[l.key]);
  const reverseVerified = !!loc?.reverse_verified_at;
  return { filled, allFilled, reverseVerified, plateLocked: allFilled && reverseVerified };
}

export const REVERSE_VERIFY_HINT =
  "A reverse that was never rendered is an assumption, not a lock. Generate the reverse angle separately and check it against the blocking anchor, openings, light side, materials and palette.";

/* ------------------------------------------------------------------ gates */

export const GATES = [
  { value: "G0", label: "intake" },
  { value: "G1", label: "style lock" },
  { value: "G2", label: "continuity" },
  { value: "G3", label: "character lock" },
  { value: "G4", label: "locations" },
  { value: "G5", label: "proof shot" },
  { value: "G6", label: "shot manifest" },
  { value: "G7", label: "previs" },
  { value: "G8", label: "motion" },
  { value: "G9", label: "finish" },
] as const;

export type Gate = (typeof GATES)[number]["value"];

export function gateLabel(gate: string | null | undefined): string {
  return GATES.find((g) => g.value === gate)?.label ?? "intake";
}

/* ----------------------------------------------------------- project code */

export const PROJECT_CODE_HINT =
  "2–4 uppercase letters, used by the Element naming convention @sheet_<CODE>_<name> / @loc_ / @prop_ / @fx_. Existing external ids are never rewritten.";

export function isValidProjectCode(code: string): boolean {
  return /^[A-Z]{2,4}$/.test(code);
}
