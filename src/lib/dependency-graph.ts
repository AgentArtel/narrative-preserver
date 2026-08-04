// Builds the dependency graph for a single shot: what it needs, and what is
// worth fixing before it is rendered. Pure — no React, no data fetching, no
// layout library — so the model survives if the canvas renderer is replaced.
//
// Nothing here decides a rule. Every judgement is delegated to the Phase 3
// validation layer (`@/lib/validation`), which is the shared home the MCP tools
// and the editors already use. This file only decides where a warning is
// ATTACHED, never what it says — otherwise the canvas would be a second home
// for the craft and could disagree with the agent about the same shot.
//
// It also never blocks. The one refusal in the app is editLineageBlock.
import {
  LOCATION_LOCKS,
  keyframeFormWarnings,
  type CameraMoveRow,
  type LocationLockSource,
} from "@/lib/craft";
import { checkLocationReady, warningText, type CraftWarning } from "@/lib/validation";

/** Mirrors the levels validation.ts emits. "unknown" is not a failure. */
export type DepStatus = "ready" | "attention" | "unknown";

export type DepKind =
  "shot" | "location" | "character" | "element" | "look" | "provider_identity" | "canon" | "frame";

export type DepNode = {
  id: string;
  kind: DepKind;
  title: string;
  subtitle?: string;
  status: DepStatus;
  /** What this node reports. Empty when there is nothing to say. */
  notes: CraftWarning[];
  /** 0 = the shot, 1 = its direct dependencies, 2 = their dependencies. */
  depth: number;
};

export type DepEdge = { id: string; source: string; target: string; dimmed?: boolean };

export type DepGraph = {
  nodes: DepNode[];
  edges: DepEdge[];
  /** Every note, attributed and ordered — the shot's own first. */
  summary: { node: string; kind: DepKind; text: string; level: CraftWarning["level"] }[];
};

/* ------------------------------------------------------------------ input */

export type GraphInput = {
  shot: {
    id: string;
    shot_number: string | null;
    description: string | null;
  };
  location: (LocationLockSource & { id: string; name: string }) | null;
  characters: { id: string; name: string }[];
  elements: { id: string; name: string; element_type: string | null }[];
  look: { id: string; name: string } | null;
  /** Active provider identities for any owner in this graph. */
  identities: {
    id: string;
    owner_id: string;
    provider: string;
    capability: string | null;
    external_id: string;
  }[];
  canon: { id: string; subject_id: string; aspect: string }[];
  /** Every pair on the shot — the editor lints all of them, so this must too. */
  keyframePairs: { id: string; form: string | null }[];
  /** camera.movement, needed to check a pair's form against the declared move. */
  movement: string | null | undefined;
  moves: CameraMoveRow[];
  /** lintShotLine output for this shot. Computed by the caller, never here. */
  shotWarnings: CraftWarning[];
};

/* ------------------------------------------------------------------ build */

export const OWNERS_NEEDING_IDENTITY: DepKind[] = ["location", "character", "element"];

/** A node is only "attention" if something concrete is wrong; a not-verified
 *  check means we could not tell, which is a different colour and a different
 *  conversation. */
function statusFor(notes: CraftWarning[]): DepStatus {
  if (!notes.length) return "ready";
  return notes.some((n) => n.level === "warning") ? "attention" : "unknown";
}

/** A local note that is genuinely this file's to make: an owner that carries no
 *  provider identity cannot be named in the package's PROVIDER ELEMENTS block. */
export const NO_IDENTITY: CraftWarning = {
  code: "provider_identity_missing",
  level: "warning",
  message: "No provider Element is registered for this asset.",
  reason:
    "The generation package can list the reference image but cannot say what to attach in the generation tool, so identity will not carry between shots.",
};

export function buildDependencyGraph(input: GraphInput): DepGraph {
  const nodes: DepNode[] = [];
  const edges: DepEdge[] = [];

  // React Flow silently misbehaves on repeated node or edge ids, and the ids
  // here come from several tables. The join tables are unique-constrained so a
  // repeat should be impossible, but the renderer degrades badly enough that it
  // is not worth relying on that.
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();
  const addNode = (n: DepNode) => {
    if (seenNodes.has(n.id)) return;
    seenNodes.add(n.id);
    nodes.push(n);
  };
  const addEdge = (e: DepEdge) => {
    if (seenEdges.has(e.id)) return;
    seenEdges.add(e.id);
    edges.push(e);
  };

  const identitiesFor = (ownerId: string) => input.identities.filter((i) => i.owner_id === ownerId);
  const canonFor = (subjectId: string) => input.canon.filter((c) => c.subject_id === subjectId);

  /* the shot itself — lintShotLine output, verbatim */
  addNode({
    id: input.shot.id,
    kind: "shot",
    title: `Shot ${input.shot.shot_number ?? "—"}`,
    subtitle: input.shot.description?.slice(0, 90) ?? undefined,
    status: statusFor(input.shotWarnings),
    notes: input.shotWarnings,
    depth: 0,
  });

  /** Provider Elements hanging off whatever owns them. */
  function addIdentityNodes(ownerId: string, ids: GraphInput["identities"], depth: number) {
    for (const pi of ids) {
      const nid = `pi:${pi.id}`;
      addNode({
        id: nid,
        kind: "provider_identity",
        title: pi.external_id,
        subtitle: `${pi.provider}${pi.capability ? ` · ${pi.capability}` : ""}`,
        status: "ready",
        notes: [],
        depth,
      });
      addEdge({ id: `${ownerId}->${nid}`, source: ownerId, target: nid });
    }
  }

  /** Adds a dependency plus its identity and canon children. */
  function addDependency(
    id: string,
    kind: DepKind,
    title: string,
    subtitle: string | undefined,
    notes: CraftWarning[],
  ) {
    const ids = identitiesFor(id);
    const all = [...notes];
    if (OWNERS_NEEDING_IDENTITY.includes(kind) && !ids.length) all.push(NO_IDENTITY);

    addNode({ id, kind, title, subtitle, status: statusFor(all), notes: all, depth: 1 });
    addEdge({ id: `${input.shot.id}->${id}`, source: input.shot.id, target: id });
    addIdentityNodes(id, ids, 2);

    for (const c of canonFor(id)) {
      const nid = `canon:${c.id}`;
      addNode({
        id: nid,
        kind: "canon",
        title: c.aspect,
        subtitle: "canon",
        status: "ready",
        notes: [],
        depth: 2,
      });
      addEdge({ id: `${id}->${nid}`, source: id, target: nid, dimmed: true });
    }
  }

  // The generation package emits Elements owned by the shot itself, so the
  // inspector has to show them too or it under-reports what gets attached.
  addIdentityNodes(input.shot.id, identitiesFor(input.shot.id), 1);

  /* location — checkLocationReady owns this judgement, not this file */
  if (input.location) {
    const readiness = checkLocationReady(input.location, input.location.name);
    const filled = LOCATION_LOCKS.length - readiness.missing_locks.length;
    addDependency(
      input.location.id,
      "location",
      input.location.name,
      `${filled}/${LOCATION_LOCKS.length} locks · ${
        readiness.lock_state.plateLocked ? "plate locked" : "not plate locked"
      }`,
      readiness.warnings,
    );
  } else {
    // checkLocationReady(null) is the canonical wording for "no location".
    addNode({
      id: "no-location",
      kind: "location",
      title: "No location",
      status: "unknown",
      notes: checkLocationReady(null).warnings,
      depth: 1,
    });
    addEdge({ id: "shot->no-location", source: input.shot.id, target: "no-location" });
  }

  for (const c of input.characters) addDependency(c.id, "character", c.name, "cast", []);
  for (const e of input.elements) {
    addDependency(e.id, "element", e.name, e.element_type ?? "element", []);
  }
  if (input.look) addDependency(input.look.id, "look", input.look.name, "look", []);

  /* keyframe pairs — craft.ts owns the form-vs-move rule, and the warning is
     attached to the pair it describes rather than to the shot. */
  for (const pair of input.keyframePairs) {
    const notes = keyframeFormWarnings(pair.form, input.movement, input.moves).map<CraftWarning>(
      (message) => ({
        code: "keyframe_form",
        level: "warning",
        message,
        reason:
          "Locked-camera and moving-camera pairs need opposite instructions; picking the wrong one is the most common failure in the pipeline.",
      }),
    );
    const nid = `kf:${pair.id}`;
    addNode({
      id: nid,
      kind: "frame",
      title: "a/b keyframe pair",
      subtitle: pair.form?.replace(/_/g, " ") ?? "form not set",
      status: statusFor(notes),
      notes,
      depth: 1,
    });
    addEdge({ id: `${input.shot.id}->${nid}`, source: input.shot.id, target: nid });
  }

  /* summary — the shot's own notes first, then real warnings, then unknowns */
  const rank = (n: DepNode) => (n.kind === "shot" ? 0 : n.status === "attention" ? 1 : 2);
  const summary: DepGraph["summary"] = [];
  for (const n of [...nodes].sort((a, b) => rank(a) - rank(b))) {
    for (const w of n.notes) {
      summary.push({ node: n.title, kind: n.kind, text: warningText(w), level: w.level });
    }
  }

  return { nodes, edges, summary };
}

/* ----------------------------------------------------------------- layout */

const COL_X = [0, 340, 680];
const CARD_W = 280;
/** Card chrome: border, padding, kind label, title, subtitle. */
const CHROME_H = 72;
const ROW_GAP = 20;
/** Characters that fit on one line of the ~232px text column at text-xs. */
const CHARS_PER_LINE = 44;
const NOTE_LINE_H = 17;

/** Cards grow with their notes, so a fixed row pitch overlaps them. Estimating
 *  height from the text is approximate, but erring high only adds whitespace
 *  whereas erring low hides a card behind an opaque one. */
export function nodeHeight(n: DepNode): number {
  let h = CHROME_H;
  for (const w of n.notes) {
    h += 4 + Math.max(1, Math.ceil(w.message.length / CHARS_PER_LINE)) * NOTE_LINE_H;
  }
  return h;
}

/** Deterministic three-column layout. The graph is shallow, so a layout
 *  library would be more dependency than it is worth. */
export function layoutGraph(nodes: DepNode[]): Record<string, { x: number; y: number }> {
  const byDepth = new Map<number, DepNode[]>();
  for (const n of nodes) {
    const list = byDepth.get(n.depth) ?? [];
    list.push(n);
    byDepth.set(n.depth, list);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [depth, list] of byDepth) {
    const total = list.reduce((sum, n) => sum + nodeHeight(n) + ROW_GAP, -ROW_GAP);
    let y = -total / 2;
    for (const n of list) {
      pos[n.id] = { x: COL_X[depth] ?? COL_X[COL_X.length - 1], y };
      y += nodeHeight(n) + ROW_GAP;
    }
  }
  return pos;
}

export const DEP_CARD_WIDTH = CARD_W;
