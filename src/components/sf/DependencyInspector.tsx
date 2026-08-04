// Read-only dependency canvas for one shot: what it needs, and what is not ready.
// Answers "why can't I render this yet" in one glance.
//
// Readiness is not computed here — it comes from craft.ts via dependency-graph.ts,
// so this view cannot disagree with the location editor or check_location_ready.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionLabel } from "@/components/sf/primitives";
import { useVocabularies } from "@/hooks/useVocabularies";
import { asRiskTail, riskTailWarnings } from "@/lib/craft";
import { lintShotLine, warningText, type CraftWarning } from "@/lib/validation";
import type { Camera } from "@/lib/storyforge";
import { asLandmarks } from "@/lib/storyforge";
import {
  DEP_CARD_WIDTH,
  buildDependencyGraph,
  layoutGraph,
  type DepNode,
  type DepStatus,
} from "@/lib/dependency-graph";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";

// Amber for "something is wrong", muted for "could not check". Nothing here is
// destructive-red: none of it blocks a render, and colouring a warning like a
// failure is how warnings get switched off.
const STATUS_RING: Record<DepStatus, string> = {
  ready: "border-border",
  attention: "border-amber-500/60",
  unknown: "border-muted-foreground/40 border-dashed",
};

const KIND_LABEL: Record<string, string> = {
  shot: "shot",
  location: "location",
  character: "cast",
  element: "element",
  look: "look",
  provider_identity: "element id",
  canon: "canon",
  frame: "keyframes",
};

/* ------------------------------------------------------------------- node */

function DepCard({ data }: NodeProps) {
  const n = data as unknown as DepNode;
  const Icon =
    n.status === "ready" ? CheckCircle2 : n.status === "attention" ? AlertTriangle : CircleDashed;
  return (
    <div
      className={cn(
        "rounded-md border bg-card px-3 py-2 text-left shadow-sm",
        STATUS_RING[n.status],
        n.kind === "shot" && "border-primary/70 bg-primary/5",
      )}
      style={{ width: DEP_CARD_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!bg-border" />
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            n.status === "ready" && "text-muted-foreground/50",
            n.status === "attention" && "text-amber-500",
            n.status === "unknown" && "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {KIND_LABEL[n.kind] ?? n.kind}
          </div>
          <div className="truncate text-sm font-medium">{n.title}</div>
          {n.subtitle && <div className="truncate text-xs text-muted-foreground">{n.subtitle}</div>}
          {n.notes.map((w, i) => (
            <div
              key={i}
              className={cn(
                "mt-1 text-xs leading-snug",
                w.level === "warning" ? "text-amber-500/90" : "text-muted-foreground",
              )}
            >
              {w.message}
            </div>
          ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border" />
    </div>
  );
}

const nodeTypes = { dep: DepCard };

/* ------------------------------------------------------------------ panel */

export function DependencyInspector({
  open,
  onOpenChange,
  projectId,
  shotId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  shotId: string;
}) {
  const { data: vocab } = useVocabularies(projectId);

  const { data, error: queryError } = useQuery({
    queryKey: ["shot-dependencies", shotId],
    enabled: open,
    queryFn: async () => {
      const { data: shot, error } = await supabase
        .from("shots")
        .select(
          "*, locations(*), looks(id, name), shot_characters(characters(id, name)), shot_elements(elements(id, name, element_type))",
        )
        .eq("id", shotId)
        .single();
      if (error) throw error;

      const characters = (shot.shot_characters ?? []).map((r) => r.characters).filter(Boolean) as {
        id: string;
        name: string;
      }[];
      const elements = (shot.shot_elements ?? []).map((r) => r.elements).filter(Boolean) as {
        id: string;
        name: string;
        element_type: string | null;
      }[];

      const ownerIds = [
        ...characters.map((c) => c.id),
        ...elements.map((e) => e.id),
        ...(shot.location_id ? [shot.location_id] : []),
        shot.id,
      ];

      const [identities, canon, pairs] = await Promise.all([
        // Same predicate as fetchProviderElements, plus the row id the graph
        // needs for its node ids. Keep the .eq("status","active") filter in
        // step with generation-package-core.ts — that is the definition of
        // "an Element the package will attach".
        supabase
          .from("provider_identities")
          .select("id, owner_id, provider, capability, external_id")
          .eq("status", "active")
          .in("owner_id", ownerIds),
        supabase.from("canon_records").select("id, subject_id, aspect").eq("project_id", projectId),
        // Every pair, not just the newest — KeyframePairs.tsx lints them all,
        // and reporting on one of several is how two surfaces start disagreeing.
        supabase.from("keyframe_pairs").select("id, form").eq("shot_id", shotId),
      ]);

      // supabase-js resolves with { data: null, error } rather than rejecting.
      // Coalescing that to [] would turn "we could not find out" into a
      // confident "there are none" — which reads as a clean bill of health.
      for (const r of [identities, canon, pairs]) if (r.error) throw r.error;

      return {
        shot,
        characters,
        elements,
        identities: identities.data ?? [],
        canon: canon.data ?? [],
        keyframePairs: pairs.data ?? [],
      };
    },
  });

  const graph = useMemo(() => {
    if (!data) return null;
    const movement = ((data.shot.camera ?? {}) as Camera).movement;
    const moves = vocab?.moves ?? [];

    // Exactly the call the host page and the MCP tools make. Assembling this
    // set by hand from the craft.ts primitives is what let the canvas print an
    // all-clear for a shot the agent was being warned about.
    const shotWarnings = [
      ...lintShotLine({
        line: data.shot.description,
        movement,
        moves,
        landmarks: asLandmarks(data.shot.locations?.landmarks),
        blockingAnchor: data.shot.locations?.blocking_anchor ?? null,
        locationName: data.shot.locations?.name ?? null,
      }),
      ...riskTailWarnings(asRiskTail(data.shot.risk_tail), vocab?.classes ?? []).map<CraftWarning>(
        (message) => ({ code: "risk_tail", level: "warning", message }),
      ),
    ];

    return buildDependencyGraph({
      shot: data.shot,
      location: data.shot.locations ?? null,
      characters: data.characters,
      elements: data.elements,
      look: data.shot.looks ?? null,
      identities: data.identities,
      canon: data.canon,
      keyframePairs: data.keyframePairs,
      movement,
      moves,
      shotWarnings,
    });
  }, [data, vocab]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!graph) return { nodes: [], edges: [] };
    const pos = layoutGraph(graph.nodes);
    return {
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        type: "dep",
        position: pos[n.id] ?? { x: 0, y: 0 },
        data: n as unknown as Record<string, unknown>,
      })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: false,
        style: { stroke: e.dimmed ? "hsl(var(--border))" : undefined, opacity: e.dimmed ? 0.4 : 1 },
      })),
    };
  }, [graph]);

  const notes = graph?.summary ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Height is capped and the body scrolls: the note list has no upper
          bound, and an uncapped fixed dialog pushes its own close button off
          the top of the viewport. */}
      <DialogContent className="flex max-h-[90vh] max-w-[min(1200px,95vw)] flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Dependencies</DialogTitle>
          <DialogDescription>
            Everything this shot needs, and anything worth fixing first. These are the same checks
            the editors and the MCP tools run — they flag, they never stop a render.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {queryError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Could not load this shot&rsquo;s dependencies, so nothing below is trustworthy:{" "}
              {(queryError as Error).message}
            </div>
          ) : notes.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
              <SectionLabel>Worth fixing ({notes.length})</SectionLabel>
              <ul className="mt-1 space-y-1">
                {notes.map((w, i) => (
                  <li
                    key={i}
                    className={cn(
                      "text-xs leading-snug",
                      w.level === "warning" ? "text-amber-500/90" : "text-muted-foreground",
                    )}
                  >
                    {w.kind === "shot" ? w.text : `${w.node}: ${w.text}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            graph && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Nothing flagged. Every check these tools can run came back clean.
              </div>
            )
          )}

          <div className="h-[520px] w-full rounded-md border border-border bg-background/40">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              edgesFocusable={false}
              minZoom={0.3}
              // Read-only. Without these the cards show a grab cursor, discard
              // the drag, and — because React Flow marks draggable nodes
              // `nopan` — swallow the pan gesture on most of the canvas.
              nodesDraggable={false}
              elementsSelectable={false}
            >
              <Background gap={18} size={1} className="opacity-40" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
