// The assembly model for the shot canvas: the shot is the main node, and the
// things wired into it — environment, cast (Souls), elements, look, script,
// keyframes — are exactly the inputs the generation package compiles from.
//
// Pure: no React, no fetching, no layout library. The canvas is an EDITOR VIEW
// over relationships that already live in the database (shot_characters,
// shot_elements, shots.location_id, shots.look_id). Connecting an edge runs
// the same write the existing editors run; nothing here is a second home for
// a fact. The output node renders buildGenerationPackage() — the same compiler
// the package dialog and the MCP tools use — so what flows into it IS the
// payload, not a picture of it.

/** The shot node's input ports, in display order (top to bottom). */
export const SHOT_PORTS = [
  {
    id: "environment",
    label: "Environment",
    accepts: "location",
    single: true,
    hint: "The location plate. One per shot — connecting another replaces it.",
  },
  {
    id: "cast",
    label: "Cast · Souls",
    accepts: "character",
    single: false,
    hint: "Characters in the shot. Each carries its provider Element so identity survives between shots.",
  },
  {
    id: "elements",
    label: "Elements",
    accepts: "element",
    single: false,
    hint: "Props, effects, recurring objects.",
  },
  {
    id: "look",
    label: "Look",
    accepts: "look",
    single: true,
    hint: "A variation within the medium — never a contradiction of the style lock.",
  },
] as const;

export type ShotPortId = (typeof SHOT_PORTS)[number]["id"];
export type AssetKind = (typeof SHOT_PORTS)[number]["accepts"];

export function portFor(kind: AssetKind) {
  return SHOT_PORTS.find((p) => p.accepts === kind)!;
}

/** Which port an asset node may connect to. Anything else is refused. */
export function validTarget(kind: AssetKind, portId: string): boolean {
  return portFor(kind).id === portId;
}

export type CanvasAsset = {
  id: string;
  kind: AssetKind;
  name: string;
  subtitle?: string;
  /** Higgsfield Element id, when one is registered. */
  externalId?: string;
  /** How many active provider identities beyond the displayed one. */
  extraIdentities?: number;
  /** Amber notes. NEVER authored here — these are the canonical warning
   *  messages from validation.ts / dependency-graph.ts, verbatim, so the
   *  canvas cannot disagree with the Dependencies dialog about the same fact. */
  notes?: string[];
  attached: boolean;
};

/* ----------------------------------------------------------------- layout */

export const NODE_W = 280;
const SHOT_X = 420;
const PACKAGE_X = 860;
const INPUT_X = 40;
const ROW_GAP = 24;

/** Rough card heights; erring high only adds whitespace. */
const ASSET_H = 92;
const SHOT_H = 300;

/**
 * Default positions: attached inputs in a left column, the shot in the middle,
 * the package terminal on the right. User-moved positions (persisted by the
 * component) override these per node id.
 */
export function defaultLayout(
  shotId: string,
  attached: CanvasAsset[],
  extras: { script: boolean; keyframes: boolean },
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};

  const column: string[] = [];
  // Stable order: mirror the port order so the wiring reads top-to-bottom.
  for (const port of SHOT_PORTS) {
    for (const a of attached.filter((x) => x.kind === port.accepts)) column.push(a.id);
  }
  if (extras.script) column.push("script");
  if (extras.keyframes) column.push("keyframes");

  const total = column.length * (ASSET_H + ROW_GAP) - ROW_GAP;
  let y = Math.max(40, 40 + (SHOT_H - total) / 2);
  for (const id of column) {
    pos[id] = { x: INPUT_X, y };
    y += ASSET_H + ROW_GAP;
  }

  pos[shotId] = { x: SHOT_X, y: 40 };
  pos["package"] = { x: PACKAGE_X, y: 40 };
  return pos;
}

/* -------------------------------------------------- position persistence */

/** localStorage — user-dragged positions survive a reload with no schema
 *  change. If the canvas earns a saved-layout column later, this moves. */
export function positionsKey(shotId: string): string {
  return `sf-canvas-pos:${shotId}`;
}

export function loadPositions(shotId: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(positionsKey(shotId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function savePositions(shotId: string, pos: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(positionsKey(shotId), JSON.stringify(pos));
  } catch {
    // Storage full or blocked — layout falls back to defaults next open.
  }
}
