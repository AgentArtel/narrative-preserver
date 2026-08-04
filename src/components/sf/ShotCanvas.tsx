// The shot assembly canvas: n8n-style wiring over ComfyUI-style dataflow.
//
// The shot is the main node. Wiring an asset into one of its ports runs the
// SAME write the existing editors run (shot_characters, shot_elements,
// shots.location_id, shots.look_id) — the canvas edits wiring, never field
// contents, so no fact gains a second home. The package terminal on the right
// renders buildGenerationPackage(), the same compiler the package dialog and
// the MCP tools use: what flows into it is the payload itself.
//
// Every amber note on a node is a canonical warning message from
// validation.ts / dependency-graph.ts, verbatim — the canvas never authors its
// own wording, so it cannot disagree with the Dependencies dialog next door.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Chip, SectionLabel } from "@/components/sf/primitives";
import { useVocabularies } from "@/hooks/useVocabularies";
import { buildGenerationPackage } from "@/lib/generation-package";
import { checkLocationReady, lintShotLine } from "@/lib/validation";
import { NO_IDENTITY, OWNERS_NEEDING_IDENTITY } from "@/lib/dependency-graph";
import { asLandmarks } from "@/lib/storyforge";
import type { Camera } from "@/lib/storyforge";
import { LOCATION_LOCKS, asRiskTail, riskTailWarnings } from "@/lib/craft";
import {
  NODE_W,
  SHOT_PORTS,
  defaultLayout,
  loadPositions,
  savePositions,
  validTarget,
  type AssetKind,
  type CanvasAsset,
} from "@/lib/shot-canvas";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  Clapperboard,
  Copy,
  Check,
  Film,
  MapPin,
  Package,
  Palette,
  ScrollText,
  Users,
} from "lucide-react";

const KIND_META: Record<AssetKind, { label: string; icon: typeof Users }> = {
  location: { label: "environment", icon: MapPin },
  character: { label: "soul", icon: Users },
  element: { label: "element", icon: Boxes },
  look: { label: "look", icon: Palette },
};

/** Read-only anchors on the shot node for the intrinsic feeders. They exist so
 *  the script and motion-plan wires do not plug into typed asset ports whose
 *  accept-rules they would visually violate. */
const INTRINSIC_PORTS = [
  { id: "script", label: "Script" },
  { id: "motion", label: "Motion · a/b" },
] as const;

/* ------------------------------------------------------------------ nodes */

function AssetNode({ data }: NodeProps) {
  const a = data as unknown as CanvasAsset;
  const Icon = KIND_META[a.kind].icon;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card shadow-md",
        a.notes?.length ? "border-amber-500/50" : "border-border",
        !a.attached && "border-dashed opacity-80",
      )}
      style={{ width: NODE_W }}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <Icon className="size-3.5 text-primary/80" />
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
          {KIND_META[a.kind].label}
        </span>
        {!a.attached && (
          <span className="ml-auto text-[10px] text-muted-foreground">drag to a port →</span>
        )}
      </div>
      <div className="px-3 py-2">
        <div className="truncate text-sm font-medium">{a.name}</div>
        {a.externalId && (
          <div className="flex items-center gap-1.5">
            <span className="truncate font-mono text-[11px] text-primary/80">@{a.externalId}</span>
            {(a.extraIdentities ?? 0) > 0 && (
              <span
                className="text-[10px] text-muted-foreground"
                title="This asset has several active provider Elements. The compiled package lists all of them."
              >
                +{a.extraIdentities}
              </span>
            )}
          </div>
        )}
        {a.subtitle && <div className="truncate text-xs text-muted-foreground">{a.subtitle}</div>}
        {(a.notes ?? []).map((n, i) => (
          <div
            key={i}
            className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-amber-500/90"
          >
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            {n}
          </div>
        ))}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

type ShotNodeData = {
  shotNumber: string | null;
  description: string | null;
  movement?: string;
  status: string;
  warnings: string[];
};

function ShotNode({ data }: NodeProps) {
  const s = data as unknown as ShotNodeData;
  return (
    <div
      className="rounded-lg border-2 border-primary/60 bg-card shadow-lg shadow-primary/5"
      style={{ width: NODE_W + 20 }}
    >
      <div className="flex items-center gap-2 rounded-t-md border-b border-border/60 bg-primary/10 px-3 py-2">
        <Clapperboard className="size-4 text-primary" />
        <span className="text-sm font-semibold">Shot {s.shotNumber ?? "—"}</span>
        {s.movement && <Chip>{s.movement}</Chip>}
        <Chip tone="default">{s.status}</Chip>
      </div>

      {s.description && (
        <div className="border-b border-border/40 px-3 py-2 text-xs leading-snug text-muted-foreground">
          {s.description.length > 140 ? `${s.description.slice(0, 140)}…` : s.description}
        </div>
      )}

      {/* Input ports, one row each — the n8n connector column. */}
      <div className="relative py-1">
        {SHOT_PORTS.map((p) => (
          <div key={p.id} className="relative flex items-center gap-2 px-3 py-1.5" title={p.hint}>
            <Handle
              id={p.id}
              type="target"
              position={Position.Left}
              className="!size-2.5 !border-2 !border-background !bg-muted-foreground"
              style={{ position: "absolute", left: -5, top: "50%" }}
            />
            <span className="text-xs text-foreground/90">{p.label}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {p.single ? "1" : "n"}
            </span>
          </div>
        ))}
        {/* Intrinsic feeders — visible as dataflow, edited on the shot page. */}
        {INTRINSIC_PORTS.map((p) => (
          <div
            key={p.id}
            className="relative flex items-center gap-2 border-t border-border/30 px-3 py-1.5"
            title="Read-only here — edited on the shot page."
          >
            <Handle
              id={p.id}
              type="target"
              position={Position.Left}
              isConnectable={false}
              className="!size-2 !border !border-background !bg-border"
              style={{ position: "absolute", left: -4, top: "50%" }}
            />
            <span className="text-xs text-muted-foreground">{p.label}</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">read-only</span>
          </div>
        ))}
      </div>

      {s.warnings.length > 0 && (
        <div className="border-t border-border/40 px-3 py-2">
          {s.warnings.slice(0, 3).map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-1 text-[11px] leading-snug text-amber-500/90"
            >
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              {w}
            </div>
          ))}
          {s.warnings.length > 3 && (
            <div className="text-[11px] text-muted-foreground">+{s.warnings.length - 3} more</div>
          )}
        </div>
      )}

      {/* Output: the compiled payload. */}
      <div className="relative flex items-center justify-end gap-2 rounded-b-md border-t border-border/60 bg-surface px-3 py-2">
        <span className="text-xs text-primary">generation package</span>
        <Handle
          id="out"
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-background !bg-primary"
          style={{ position: "absolute", right: -6, top: "50%" }}
        />
      </div>
    </div>
  );
}

function ScriptNode({ data }: NodeProps) {
  const d = data as unknown as { description: string | null; dialogue: string | null };
  return (
    <div
      className="rounded-lg border border-border/70 bg-card/70 shadow-sm"
      style={{ width: NODE_W }}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <ScrollText className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">script</span>
      </div>
      <div className="px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        {(d.description ?? "").slice(0, 110) || "No shot line yet."}
        {d.dialogue && <div className="mt-1 italic">“{d.dialogue.slice(0, 60)}…”</div>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}

function KeyframesNode({ data }: NodeProps) {
  const d = data as unknown as { pairs: { form: string | null }[] };
  return (
    <div
      className="rounded-lg border border-border/70 bg-card/70 shadow-sm"
      style={{ width: NODE_W }}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <Film className="size-3.5 text-muted-foreground" />
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
          motion · a/b pairs
        </span>
      </div>
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        {d.pairs.length
          ? d.pairs.map((p, i) => (
              <div key={i}>
                pair {i + 1} — {p.form ? p.form.replace(/_/g, " ") : "form not set"}
              </div>
            ))
          : "No keyframe pair yet."}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}

function PackageNode({ data }: NodeProps) {
  const d = data as unknown as { text: string | null; loading: boolean; error: string | null };
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-primary/40 bg-card shadow-lg" style={{ width: 360 }}>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-background !bg-primary"
      />
      <div className="flex items-center gap-2 rounded-t-md border-b border-border/60 bg-primary/10 px-3 py-2">
        <Package className="size-4 text-primary" />
        <span className="text-sm font-semibold">Generation package</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {d.text ? `${d.text.length.toLocaleString()} chars` : ""}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5"
          disabled={!d.text}
          onClick={() => {
            if (!d.text) return;
            void navigator.clipboard.writeText(d.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      {d.error ? (
        // A failed compile must never read as "the package is empty".
        <div className="px-3 py-2 text-[11px] leading-snug text-destructive">
          Compile failed — nothing below the wire is trustworthy: {d.error}
        </div>
      ) : (
        <pre className="nowheel max-h-[380px] overflow-auto px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {d.loading ? "compiling…" : (d.text ?? "—")}
        </pre>
      )}
    </div>
  );
}

const nodeTypes = {
  asset: AssetNode,
  shot: ShotNode,
  script: ScriptNode,
  keyframes: KeyframesNode,
  package: PackageNode,
};

/* ---------------------------------------------------------------- surface */

function ShotCanvasInner({ projectId, shotId }: { projectId: string; shotId: string }) {
  const qc = useQueryClient();
  const { screenToFlowPosition } = useReactFlow();
  const { data: vocab } = useVocabularies(projectId);
  /** Palette assets dropped on the canvas but not yet wired. */
  const [floating, setFloating] = useState<{ asset: CanvasAsset; x: number; y: number }[]>([]);
  /** Persisted positions. A ref, not state: live positions during a session
   *  belong to React Flow's node state; this only seeds the next mount. */
  const movedRef = useRef<Record<string, { x: number; y: number }>>(loadPositions(shotId));

  const { data, error } = useQuery({
    queryKey: ["shot-canvas", shotId],
    queryFn: async () => {
      const [shotQ, chars, els, locs, looks] = await Promise.all([
        supabase
          .from("shots")
          .select(
            "*, locations(*), looks(id, name), shot_characters(characters(id, name, role)), shot_elements(elements(id, name, element_type))",
          )
          .eq("id", shotId)
          .single(),
        supabase.from("characters").select("id, name, role").eq("project_id", projectId),
        supabase.from("elements").select("id, name, element_type").eq("project_id", projectId),
        supabase.from("locations").select("*").eq("project_id", projectId),
        supabase.from("looks").select("id, name").eq("project_id", projectId),
      ]);
      if (shotQ.error) throw shotQ.error;
      for (const r of [chars, els, locs, looks]) if (r.error) throw r.error;
      const shot = shotQ.data;

      const ownerIds = [
        ...(chars.data ?? []).map((c) => c.id),
        ...(els.data ?? []).map((e) => e.id),
        ...(locs.data ?? []).map((l) => l.id),
        shot.id,
      ];
      const identities = await supabase
        .from("provider_identities")
        .select("owner_id, external_id, capability")
        .eq("status", "active")
        .in("owner_id", ownerIds);
      if (identities.error) throw identities.error;

      const pairs = await supabase.from("keyframe_pairs").select("id, form").eq("shot_id", shotId);
      if (pairs.error) throw pairs.error;

      return {
        shot,
        characters: chars.data ?? [],
        elements: els.data ?? [],
        locations: locs.data ?? [],
        looks: looks.data ?? [],
        identities: identities.data ?? [],
        pairs: pairs.data ?? [],
      };
    },
  });

  // The payload terminal recompiles whenever wiring changes invalidate it.
  const pkg = useQuery({
    queryKey: ["canvas-package", shotId],
    enabled: !!data,
    queryFn: () => buildGenerationPackage(shotId),
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["shot-canvas", shotId] });
    void qc.invalidateQueries({ queryKey: ["canvas-package", shotId] });
  }, [qc, shotId]);

  /* ------------------------------------------------------------ assets */

  const assets = useMemo<CanvasAsset[]>(() => {
    if (!data) return [];
    const byOwner = new Map<string, { external_id: string }[]>();
    for (const i of data.identities) {
      const list = byOwner.get(i.owner_id) ?? [];
      list.push(i);
      byOwner.set(i.owner_id, list);
    }
    const identity = (ownerId: string) => {
      const list = byOwner.get(ownerId) ?? [];
      return { externalId: list[0]?.external_id, extraIdentities: Math.max(0, list.length - 1) };
    };
    // The canonical wording for "this asset has no provider Element" — the
    // same constant the Dependencies dialog renders, applied to the same set
    // of kinds (locations included).
    const identityNotes = (kind: AssetKind, ownerId: string): string[] =>
      (OWNERS_NEEDING_IDENTITY as string[]).includes(kind) && !byOwner.get(ownerId)?.length
        ? [NO_IDENTITY.message]
        : [];

    const attachedChars = new Set(
      (data.shot.shot_characters ?? []).map((r) => r.characters?.id).filter(Boolean),
    );
    const attachedEls = new Set(
      (data.shot.shot_elements ?? []).map((r) => r.elements?.id).filter(Boolean),
    );

    const out: CanvasAsset[] = [];
    for (const c of data.characters) {
      out.push({
        id: c.id,
        kind: "character",
        name: c.name,
        subtitle: c.role ?? undefined,
        ...identity(c.id),
        notes: identityNotes("character", c.id),
        attached: attachedChars.has(c.id),
      });
    }
    for (const e of data.elements) {
      out.push({
        id: e.id,
        kind: "element",
        name: e.name,
        subtitle: e.element_type ?? undefined,
        ...identity(e.id),
        notes: identityNotes("element", e.id),
        attached: attachedEls.has(e.id),
      });
    }
    for (const l of data.locations) {
      // checkLocationReady owns this judgement — same call, same words as the
      // Dependencies dialog and the check_location_ready MCP tool.
      const readiness = checkLocationReady(l as never, l.name);
      const filled = LOCATION_LOCKS.length - readiness.missing_locks.length;
      out.push({
        id: l.id,
        kind: "location",
        name: l.name,
        subtitle: `${filled}/${LOCATION_LOCKS.length} locks · ${
          readiness.lock_state.plateLocked ? "plate locked" : "not plate locked"
        }`,
        ...identity(l.id),
        notes: [...readiness.warnings.map((w) => w.message), ...identityNotes("location", l.id)],
        attached: data.shot.location_id === l.id,
      });
    }
    for (const lk of data.looks) {
      out.push({ id: lk.id, kind: "look", name: lk.name, attached: data.shot.look_id === lk.id });
    }
    return out;
  }, [data]);

  const shotWarnings = useMemo(() => {
    if (!data) return [];
    const movement = ((data.shot.camera ?? {}) as Camera).movement;
    // The same composition the Dependencies dialog uses — lint plus risk tail.
    return [
      ...lintShotLine({
        line: data.shot.description,
        movement,
        moves: vocab?.moves ?? [],
        landmarks: asLandmarks(data.shot.locations?.landmarks),
        blockingAnchor: data.shot.locations?.blocking_anchor ?? null,
        locationName: data.shot.locations?.name ?? null,
      }).map((w) => w.message),
      ...riskTailWarnings(asRiskTail(data.shot.risk_tail), vocab?.classes ?? []),
    ];
  }, [data, vocab]);

  /* ---------------------------------------------------------- mutations */

  const attach = useCallback(
    async (asset: CanvasAsset) => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        toast.error("Your session has expired — sign in again, then re-wire.");
        invalidate();
        return;
      }
      let err: { message: string } | null = null;
      if (asset.kind === "character") {
        ({ error: err } = await supabase
          .from("shot_characters")
          .insert({ user_id: userId, shot_id: shotId, character_id: asset.id, state: {} }));
      } else if (asset.kind === "element") {
        ({ error: err } = await supabase
          .from("shot_elements")
          .insert({ user_id: userId, shot_id: shotId, element_id: asset.id, state: {} }));
      } else if (asset.kind === "location") {
        ({ error: err } = await supabase
          .from("shots")
          .update({ location_id: asset.id })
          .eq("id", shotId));
      } else {
        ({ error: err } = await supabase
          .from("shots")
          .update({ look_id: asset.id })
          .eq("id", shotId));
      }
      if (err) {
        // The floating node stays put so the gesture is not destroyed.
        toast.error(`Could not wire ${asset.name}: ${err.message}`);
        invalidate();
        return;
      }
      setFloating((f) => f.filter((x) => x.asset.id !== asset.id));
      invalidate();
    },
    [shotId, invalidate],
  );

  const detach = useCallback(
    async (asset: CanvasAsset) => {
      let err: { message: string } | null = null;
      if (asset.kind === "character") {
        ({ error: err } = await supabase
          .from("shot_characters")
          .delete()
          .eq("shot_id", shotId)
          .eq("character_id", asset.id));
      } else if (asset.kind === "element") {
        ({ error: err } = await supabase
          .from("shot_elements")
          .delete()
          .eq("shot_id", shotId)
          .eq("element_id", asset.id));
      } else if (asset.kind === "location") {
        // Guarded by the asset id, like the join deletes above: a stale detach
        // (another client already swapped the location) must be a no-op, not
        // a silent wipe of the replacement.
        ({ error: err } = await supabase
          .from("shots")
          .update({ location_id: null })
          .eq("id", shotId)
          .eq("location_id", asset.id));
      } else {
        ({ error: err } = await supabase
          .from("shots")
          .update({ look_id: null })
          .eq("id", shotId)
          .eq("look_id", asset.id));
      }
      if (err) toast.error(`Could not unwire ${asset.name}: ${err.message}`);
      invalidate();
    },
    [shotId, invalidate],
  );

  /* -------------------------------------------------------- graph build */

  const attached = useMemo(() => assets.filter((a) => a.attached), [assets]);
  const palette = useMemo(() => assets.filter((a) => !a.attached), [assets]);

  const built = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!data) return { nodes: [], edges: [] };
    const base = defaultLayout(shotId, attached, {
      script: true,
      keyframes: data.pairs.length > 0,
    });
    const pos = (id: string, fallback: { x: number; y: number }) =>
      movedRef.current[id] ?? base[id] ?? fallback;

    const movement = ((data.shot.camera ?? {}) as Camera).movement;
    const ns: Node[] = [
      {
        id: shotId,
        type: "shot",
        position: pos(shotId, { x: 420, y: 40 }),
        deletable: false,
        data: {
          shotNumber: data.shot.shot_number,
          description: data.shot.description,
          movement,
          status: data.shot.status,
          warnings: shotWarnings,
        } as unknown as Record<string, unknown>,
      },
      {
        id: "package",
        type: "package",
        position: pos("package", { x: 860, y: 40 }),
        deletable: false,
        data: {
          text: pkg.data?.text ?? null,
          loading: pkg.isFetching,
          error: pkg.error ? ((pkg.error as Error).message ?? "unknown error") : null,
        } as unknown as Record<string, unknown>,
      },
      {
        id: "script",
        type: "script",
        position: pos("script", { x: 40, y: 420 }),
        deletable: false,
        data: {
          description: data.shot.description,
          dialogue: data.shot.dialogue,
        } as unknown as Record<string, unknown>,
      },
    ];
    const es: Edge[] = [
      {
        id: "e:shot->package",
        source: shotId,
        sourceHandle: "out",
        target: "package",
        animated: true,
        deletable: false,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5 },
      },
      {
        id: "e:script->feed",
        source: "script",
        target: shotId,
        targetHandle: "script",
        deletable: false,
        selectable: false,
        style: { opacity: 0.25 },
      },
    ];

    if (data.pairs.length) {
      ns.push({
        id: "keyframes",
        type: "keyframes",
        position: pos("keyframes", { x: 40, y: 540 }),
        deletable: false,
        data: { pairs: data.pairs } as unknown as Record<string, unknown>,
      });
      es.push({
        id: "e:keyframes->feed",
        source: "keyframes",
        target: shotId,
        targetHandle: "motion",
        deletable: false,
        selectable: false,
        style: { opacity: 0.25 },
      });
    }

    for (const a of attached) {
      ns.push({
        id: a.id,
        type: "asset",
        position: pos(a.id, { x: 40, y: 40 }),
        data: a as unknown as Record<string, unknown>,
      });
      es.push({
        id: `e:${a.id}->shot`,
        source: a.id,
        target: shotId,
        targetHandle: SHOT_PORTS.find((p) => p.accepts === a.kind)!.id,
        animated: true,
        style: { stroke: "hsl(var(--primary) / 0.6)", strokeWidth: 1.25 },
      });
    }
    for (const f of floating) {
      ns.push({
        id: f.asset.id,
        type: "asset",
        position: movedRef.current[f.asset.id] ?? { x: f.x, y: f.y },
        data: f.asset as unknown as Record<string, unknown>,
      });
    }
    return { nodes: ns, edges: es };
  }, [data, attached, floating, shotId, shotWarnings, pkg.data, pkg.isFetching, pkg.error]);

  // Controlled React Flow state: changes (drag, select, remove) apply here so
  // interaction works; server truth re-seeds it whenever `built` changes,
  // keeping any position the user has already given a node this session.
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const livePos = new Map(prev.map((n) => [n.id, n.position]));
      return built.nodes.map((n) => ({ ...n, position: livePos.get(n.id) ?? n.position }));
    });
    setEdges(built.edges);
  }, [built]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((ns) => applyNodeChanges(changes, ns));
      // Side effects stay OUTSIDE the state updater: under StrictMode an
      // updater runs twice, and a detach that fires twice is a real bug.
      for (const ch of changes) {
        if (ch.type === "position" && ch.position && !ch.dragging) {
          movedRef.current = { ...movedRef.current, [ch.id]: ch.position };
          savePositions(shotId, movedRef.current);
        }
        if (ch.type === "remove") {
          const asset = assets.find((a) => a.id === ch.id);
          if (asset?.attached) void detach(asset);
          else if (asset) setFloating((f) => f.filter((x) => x.asset.id !== ch.id));
        }
      }
    },
    [assets, detach, shotId],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((es) => applyEdgeChanges(changes, es));
      for (const ch of changes) {
        if (ch.type !== "remove") continue;
        const m = /^e:(.+)->shot$/.exec(ch.id);
        if (!m) continue;
        const asset = assets.find((a) => a.id === m[1]);
        if (asset?.attached) void detach(asset);
      }
    },
    [assets, detach],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.target !== shotId || !c.targetHandle) return;
      const asset = assets.find((a) => a.id === c.source);
      if (!asset || !validTarget(asset.kind, c.targetHandle)) return;
      // Optimistic edge so the gesture lands instantly; the server-truth
      // rebuild replaces it (same id) or removes it if the write failed.
      setEdges((es) => [
        ...es.filter((e) => e.id !== `e:${asset.id}->shot`),
        {
          id: `e:${asset.id}->shot`,
          source: asset.id,
          target: shotId,
          targetHandle: c.targetHandle,
          animated: true,
          style: { stroke: "hsl(var(--primary) / 0.6)", strokeWidth: 1.25 },
        },
      ]);
      void attach(asset);
    },
    [assets, shotId, attach],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      if (c.target !== shotId || !c.targetHandle) return false;
      const asset = assets.find((a) => a.id === c.source);
      return !!asset && !asset.attached && validTarget(asset.kind, c.targetHandle);
    },
    [assets, shotId],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("application/sf-asset");
      const asset = palette.find((a) => a.id === id);
      if (!asset) return;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setFloating((f) => [
        ...f.filter((x) => x.asset.id !== id),
        { asset, x: p.x - NODE_W / 2, y: p.y - 30 },
      ]);
    },
    [palette, screenToFlowPosition],
  );

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load this shot: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Palette — everything in the project not yet wired into this shot. */}
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface/50 p-3">
        <SectionLabel>Palette</SectionLabel>
        <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
          Drag onto the canvas, then wire into a port. Connecting runs the same write the editors
          make. Select a wire or node and press Delete to unwire.
        </p>
        {(["location", "character", "element", "look"] as AssetKind[]).map((kind) => {
          const items = palette.filter((a) => a.kind === kind);
          if (!items.length) return null;
          const Icon = KIND_META[kind].icon;
          return (
            <div key={kind} className="mb-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
                <Icon className="size-3" /> {KIND_META[kind].label}
              </div>
              {items.map((a) => (
                <div
                  key={a.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("application/sf-asset", a.id)}
                  className="mb-1 cursor-grab rounded border border-border bg-card px-2 py-1.5 text-xs hover:border-primary/50 active:cursor-grabbing"
                >
                  <div className="truncate">{a.name}</div>
                  {a.externalId && (
                    <div className="truncate font-mono text-[10px] text-primary/70">
                      @{a.externalId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        {palette.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Everything in this project is already wired in.
          </p>
        )}
      </aside>

      <div className="min-w-0 flex-1" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.25}
          proOptions={{ hideAttribution: true }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
          <Controls showInteractive={false} />
          <MiniMap
            pannable
            zoomable
            className="!h-28 !w-40 !bg-surface"
            maskColor="rgb(0 0 0 / 0.55)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export function ShotCanvas({ projectId, shotId }: { projectId: string; shotId: string }) {
  const { data } = useQuery({
    queryKey: ["shot-canvas-header", shotId],
    queryFn: async () => {
      const { data: shot, error } = await supabase
        .from("shots")
        .select("shot_number, description, scenes(title)")
        .eq("id", shotId)
        .single();
      if (error) throw error;
      return shot;
    },
  });
  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Button asChild size="sm" variant="ghost">
          <Link to="/projects/$projectId/shot/$shotId" params={{ projectId, shotId }}>
            <ArrowLeft className="size-4" /> Shot {data?.shot_number ?? ""}
          </Link>
        </Button>
        <span className="truncate text-sm text-muted-foreground">{data?.scenes?.title}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          wiring = the payload · edits run the same writes as the editors
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider>
          <ShotCanvasInner projectId={projectId} shotId={shotId} />
        </ReactFlowProvider>
      </div>
    </div>
  );
}
