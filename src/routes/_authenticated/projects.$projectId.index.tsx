import { useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge, SectionLabel } from "@/components/sf/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronRight, ListTree, Lock as LockIcon, Plus } from "lucide-react";
import { ProjectLocksDialog } from "@/components/sf/ProjectLocksDialog";
import { VocabularyDialog } from "@/components/sf/VocabularyDialog";
import { LOCK_FIELDS } from "@/lib/storyforge";
import { spendRollup } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  head: () => ({
    meta: [
      { title: "Project Home — StoryForge" },
      {
        name: "description",
        content: "Counts, pending approvals and recent generation handoffs for your production.",
      },
      { property: "og:title", content: "Project Home — StoryForge" },
      {
        property: "og:description",
        content: "Counts, pending approvals and recent generation handoffs for your production.",
      },
    ],
  }),
  component: ProjectHome,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function ProjectHome() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [seqOpen, setSeqOpen] = useState(false);
  const [seqTitle, setSeqTitle] = useState("");
  const [sceneFor, setSceneFor] = useState<string | null>(null);
  const [sceneTitle, setSceneTitle] = useState("");
  const [sceneBrief, setSceneBrief] = useState("");
  const [locksOpen, setLocksOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["project-home", projectId],
    queryFn: async () => {
      const { data: project } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      const { data: sequences } = await supabase
        .from("sequences")
        .select("*, scenes(*)")
        .eq("project_id", projectId)
        .order("sort_order");
      const sceneIds = (sequences ?? []).flatMap((s) => (s.scenes ?? []).map((sc) => sc.id));
      const { data: shots } = sceneIds.length
        ? await supabase
            .from("shots")
            .select("id, shot_number, status, description, scene_id")
            .in("scene_id", sceneIds)
        : { data: [] };
      const [{ count: cast }, { count: locs }, { count: els }, { count: canon }] =
        await Promise.all([
          supabase
            .from("characters")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId),
          supabase
            .from("locations")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId),
          supabase
            .from("elements")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId),
          supabase
            .from("canon_records")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .is("retired_at", null),
        ]);
      const shotIds = (shots ?? []).map((s) => s.id);
      const { data: generations } = shotIds.length
        ? await supabase
            .from("generations")
            .select("*, shots(shot_number)")
            .in("shot_id", shotIds)
            .order("created_at", { ascending: false })
            .limit(6)
        : { data: [] };
      // Every generation, tier only — money is a first-class fact on this page.
      const { data: spendRows } = shotIds.length
        ? await supabase
            .from("generations")
            .select("shot_id, tier, status, cost_credits, created_at, shots(status)")
            .in("shot_id", shotIds)
        : { data: [] };
      return {
        project,
        sequences: sequences ?? [],
        shots: shots ?? [],
        counts: {
          scenes: sceneIds.length,
          shots: (shots ?? []).length,
          cast: cast ?? 0,
          locations: locs ?? 0,
          elements: els ?? 0,
          canon: canon ?? 0,
        },
        generations: generations ?? [],
        spend: spendRollup(
          (spendRows ?? []).map((g) => ({
            shot_id: g.shot_id ?? null,
            tier: g.tier ?? null,
            status: g.status ?? null,
            cost_credits: g.cost_credits ?? null,
            created_at: g.created_at,
            shot_status: g.shots?.status ?? null,
          })),
        ),
      };
    },
  });

  const pending = (data?.shots ?? []).filter((s) => s.status === "candidates");

  const locksSet = LOCK_FIELDS.some(
    (f) => !!(data?.project as Record<string, unknown> | undefined)?.[f.key],
  );

  const createSequence = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("sequences").insert({
        user_id: u.user!.id,
        project_id: projectId,
        title: seqTitle.trim(),
        sort_order: data?.sequences?.length ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSeqOpen(false);
      setSeqTitle("");
      qc.invalidateQueries({ queryKey: ["project-home", projectId] });
      qc.invalidateQueries({ queryKey: ["scene-tree", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createScene = useMutation({
    mutationFn: async () => {
      const seq = (data?.sequences ?? []).find((s) => s.id === sceneFor);
      const { data: u } = await supabase.auth.getUser();
      const { data: row, error } = await supabase
        .from("scenes")
        .insert({
          user_id: u.user!.id,
          sequence_id: sceneFor!,
          title: sceneTitle.trim(),
          brief: sceneBrief || null,
          status: "drafting",
          sort_order: seq?.scenes?.length ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return row;
    },
    onSuccess: (row) => {
      setSceneFor(null);
      setSceneTitle("");
      setSceneBrief("");
      qc.invalidateQueries({ queryKey: ["project-home", projectId] });
      qc.invalidateQueries({ queryKey: ["scene-tree", projectId] });
      navigate({
        to: "/projects/$projectId/scene/$sceneId",
        params: { projectId, sceneId: row.id },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{data?.project?.title}</h1>
      {data?.project?.description && (
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{data.project.description}</p>
      )}

      <section className="mt-6 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Production locks</SectionLabel>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Style lock, continuity and direction are emitted verbatim at the top of every
              generation package in this project.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setVocabOpen(true)}>
              <ListTree className="size-4" /> Vocabularies
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLocksOpen(true)}>
              <LockIcon className="size-4" /> {locksSet ? "Edit locks" : "Set locks"}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {LOCK_FIELDS.map((f) => {
            const set = !!(data?.project as Record<string, unknown> | undefined)?.[f.key];
            return (
              <span
                key={f.key}
                className={`rounded border px-2 py-1 ${
                  set ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {f.label} · {set ? "set" : "empty"}
              </span>
            );
          })}
          {data?.project?.locks_frozen_at && (
            <span className="rounded border border-border px-2 py-1 text-muted-foreground">
              Frozen {new Date(data.project.locks_frozen_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Scenes" value={data?.counts.scenes ?? 0} />
        <Stat label="Shots" value={data?.counts.shots ?? 0} />
        <Stat label="Cast" value={data?.counts.cast ?? 0} />
        <Stat label="Locations" value={data?.counts.locations ?? 0} />
        <Stat label="Elements" value={data?.counts.elements ?? 0} />
        <Stat label="Canon" value={data?.counts.canon ?? 0} />
      </div>

      {/* Spend: previs cheaply, finish only survivors. */}
      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <SectionLabel>Spend</SectionLabel>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          <Stat label="Total credits" value={data?.spend.total_credits ?? 0} />
          <Stat label="Finish tier" value={data?.spend.finish_credits ?? 0} />
          <Stat
            label="Finish credits that bought nothing"
            value={`${data?.spend.wasted_finish_credits ?? 0} (${data?.spend.wasted_pct ?? 0}%)`}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{data?.spend.sentence}</p>
      </div>

      <ProjectLocksDialog
        projectId={projectId}
        project={data?.project}
        open={locksOpen}
        onOpenChange={setLocksOpen}
      />

      <VocabularyDialog projectId={projectId} open={vocabOpen} onOpenChange={setVocabOpen} />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>Sequences &amp; scenes</SectionLabel>
            <Button size="sm" variant="outline" className="mb-2" onClick={() => setSeqOpen(true)}>
              <Plus className="size-4" /> New sequence
            </Button>
          </div>
          <div className="space-y-4">
            {(data?.sequences ?? []).map((seq) => (
              <div key={seq.id} className="rounded-lg border border-border bg-surface">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <span className="text-sm font-semibold">{seq.title}</span>
                  <Button size="sm" variant="ghost" onClick={() => setSceneFor(seq.id)}>
                    <Plus className="size-3.5" /> New scene
                  </Button>
                </div>

                <div className="divide-y divide-border">
                  {(seq.scenes ?? []).map((sc) => (
                    <Link
                      key={sc.id}
                      to="/projects/$projectId/scene/$sceneId"
                      params={{ projectId, sceneId: sc.id }}
                      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-raised"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{sc.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {(data?.shots ?? []).filter((s) => s.scene_id === sc.id).length} shots ·{" "}
                          {sc.status}
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                  {(seq.scenes ?? []).length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No scenes yet.</p>
                  )}
                </div>
              </div>
            ))}
            {(data?.sequences ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No sequences yet.</p>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div>
            <SectionLabel>Pending approvals</SectionLabel>
            <div className="space-y-2">
              {pending.map((s) => (
                <Link
                  key={s.id}
                  to="/projects/$projectId/shot/$shotId"
                  params={{ projectId, shotId: s.id }}
                  className="block rounded border border-border bg-surface p-3 transition-colors hover:border-primary/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-primary">{s.shot_number}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                    {s.description}
                  </p>
                </Link>
              ))}
              {pending.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing waiting on a decision.</p>
              )}
            </div>
          </div>

          <div>
            <SectionLabel>Recent generations</SectionLabel>
            <div className="space-y-2">
              {(data?.generations ?? []).map((g) => (
                <div key={g.id} className="rounded border border-border bg-surface p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-primary">{g.shots?.shot_number}</span>
                    <span className="label-caps">{g.status}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {g.provider} · {g.tool ?? "—"} · {new Date(g.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {(data?.generations ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No handoffs recorded yet.</p>
              )}
            </div>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/projects/$projectId/generations" params={{ projectId }}>
                View all generations
              </Link>
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={seqOpen} onOpenChange={setSeqOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New sequence</DialogTitle>
            <DialogDescription>
              A sequence groups the scenes of one continuous stretch of the story.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="seq-title">Title</Label>
            <Input
              id="seq-title"
              value={seqTitle}
              onChange={(e) => setSeqTitle(e.target.value)}
              placeholder="Opening Cinematic"
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => createSequence.mutate()}
              disabled={!seqTitle.trim() || createSequence.isPending}
            >
              Create sequence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sceneFor} onOpenChange={(v) => !v && setSceneFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New scene</DialogTitle>
            <DialogDescription>
              A scene holds beats and shots. You will land in its workspace after creating it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="scene-title">Title</Label>
              <Input
                id="scene-title"
                value={sceneTitle}
                onChange={(e) => setSceneTitle(e.target.value)}
                placeholder="The hero enters the ruined cathedral"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scene-brief">Brief</Label>
              <Textarea
                id="scene-brief"
                value={sceneBrief}
                onChange={(e) => setSceneBrief(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createScene.mutate()}
              disabled={!sceneTitle.trim() || createScene.isPending}
            >
              Create scene
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
