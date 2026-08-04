import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Chip, SectionLabel, StatusBadge, CanonMarker } from "@/components/sf/primitives";
import { GenerationPackageDialog } from "@/components/sf/GenerationPackageDialog";
import { PromoteToCanonDialog } from "@/components/sf/PromoteToCanonDialog";
import { KeyframePairs } from "@/components/sf/KeyframePairs";
import { CraftWarnings } from "@/components/sf/CraftWarnings";
import { FrameApprovals } from "@/components/sf/FrameApprovals";
import { useVocabularies } from "@/hooks/useVocabularies";
import type { Camera } from "@/lib/storyforge";
import { asLandmarks } from "@/lib/storyforge";
import { lintShotLine } from "@/lib/validation";
import { approveFrameFor, DEFAULT_PURPOSE } from "@/lib/approvals-core";
import type { DB } from "@/lib/generation-package-core";
import { uploadImage } from "@/lib/upload";
import { importGenerationResults } from "@/lib/import-results";


import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, Package, Sparkles, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$projectId/shot/$shotId")({
  head: () => ({
    meta: [
      { title: "Shot Detail — StoryForge" },
      {
        name: "description",
        content: "Approve candidate frames, compare options and promote aspects to canon.",
      },
      { property: "og:title", content: "Shot Detail — StoryForge" },
      {
        property: "og:description",
        content: "Approve candidate frames, compare options and promote aspects to canon.",
      },
    ],
  }),
  component: ShotDetail,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

function ShotDetail() {
  const { projectId, shotId } = useParams({
    from: "/_authenticated/projects/$projectId/shot/$shotId",
  });
  const qc = useQueryClient();
  const [compare, setCompare] = useState<string[]>([]);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [canonFrame, setCanonFrame] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["shot-detail", shotId],
    queryFn: async () => {
      const { data: shot, error } = await supabase
        .from("shots")
        .select(
          "*, scenes(id, title, sequences(title)), frames(*), locations(name, landmarks, blocking_anchor), shot_characters(character_id, characters(name)), shot_elements(element_id, elements(name))",
        )
        .eq("id", shotId)
        .single();
      if (error) throw error;
      const [{ data: prev }, { data: gens }, { data: canon }] = await Promise.all([
        supabase
          .from("shots")
          .select("shot_number, frames(image_url, is_approved)")
          .eq("scene_id", shot.scene_id)
          .lt("sort_order", shot.sort_order ?? 0)
          .order("sort_order", { ascending: false })
          .limit(1),
        supabase
          .from("generations")
          .select("*")
          .eq("shot_id", shotId)
          .order("created_at", { ascending: false }),
        supabase.from("canon_records").select("*").eq("project_id", projectId),
      ]);
      return {
        shot,
        prev: prev?.[0] ?? null,
        generations: gens ?? [],
        canon: canon ?? [],
      };
    },
  });

  const shot = data?.shot;
  const frames = shot?.frames ?? [];
  const approved = frames.find((f) => f.is_approved);
  const candidates = frames.filter((f) => !f.is_approved);
  const prevApproved = data?.prev?.frames?.find((f) => f.is_approved)?.image_url;
  const { data: vocab } = useVocabularies(projectId);
  const movement = ((shot?.camera ?? {}) as Camera).movement;

  // The same rules the MCP tools return, shown inline as amber hints.
  const shotWarnings = shot
    ? lintShotLine({
        line: shot.description,
        movement,
        moves: vocab?.moves ?? [],
        landmarks: asLandmarks(shot.locations?.landmarks),
        blockingAnchor: shot.locations?.blocking_anchor ?? null,
        locationName: shot.locations?.name ?? null,
      })
    : [];

  // Scoped approvals, so a hold for one purpose is visible at a glance.
  const { data: approvals } = useQuery({
    queryKey: ["shot-frame-approvals", shotId, frames.map((f) => f.id).join(",")],
    enabled: frames.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("frame_approvals")
        .select("frame_id, purpose")
        .in(
          "frame_id",
          frames.map((f) => f.id),
        );
      if (error) throw error;
      return data ?? [];
    },
  });
  const purposeLabel = (slug: string) =>
    (vocab?.purposes ?? []).find((p) => p.slug === slug)?.label ?? slug;
  const purposesFor = (frameId: string) =>
    (approvals ?? []).filter((a) => a.frame_id === frameId).map((a) => a.purpose);



  async function approveFrame(frameId: string) {
    try {
      const { data: u } = await supabase.auth.getUser();
      await approveFrameFor(supabase as unknown as DB, {
        userId: u.user!.id,
        frameId,
        purpose: DEFAULT_PURPOSE,
      });
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Approval failed");
    }
    qc.invalidateQueries();
    toast.success("Frame approved for default — this is now a production decision");
  }


  async function importForGeneration(generationId: string, files: FileList | null) {
    if (!files?.length) return;
    setImportingId(generationId);
    try {
      await importGenerationResults({ shotId, generationId, files });
      qc.invalidateQueries();
      toast.success("Result imported as candidates");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      for (const f of Array.from(files)) {
        const url = await uploadImage(f);
        const { error } = await supabase.from("frames").insert({
          user_id: u.user!.id,
          shot_id: shotId,
          image_url: url,
          kind: "keyframe",
          is_approved: false,
        });
        if (error) throw error;
      }
      qc.invalidateQueries();
      toast.success("Candidates added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function toggleCompare(id: string) {
    setCompare((c) =>
      c.includes(id) ? c.filter((x) => x !== id) : c.length >= 2 ? [c[1], id] : [...c, id],
    );
  }

  const canonForFrame = (frameId: string) =>
    (data?.canon ?? []).filter((c) => c.source_frame_id === frameId).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label-caps">
            {shot?.scenes?.sequences?.title} ·{" "}
            {shot?.scenes && (
              <Link
                to="/projects/$projectId/scene/$sceneId"
                params={{ projectId, sceneId: shot.scenes.id }}
                className="hover:text-foreground"
              >
                {shot.scenes.title}
              </Link>
            )}
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold tracking-tight">
            <span className="font-mono text-primary">{shot?.shot_number}</span>
            {shot && <StatusBadge status={shot.status} />}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPkgOpen(true)}>
            <Package className="size-4" /> Generation package
          </Button>
          <label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-surface-raised">
              <Upload className="size-4" /> {uploading ? "Uploading…" : "Add candidates"}
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionLabel>Approved frame</SectionLabel>
          <div
            className={cn(
              "aspect-video w-full overflow-hidden rounded-lg border",
              approved ? "frame-approved" : "frame-candidate",
            )}
          >
            {approved ? (
              <img
                src={approved.image_url}
                alt={`Approved frame for shot ${shot?.shot_number}`}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-surface text-sm text-muted-foreground">
                No approved frame — approve a candidate below.
              </div>
            )}
          </div>
          {approved && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <CanonMarker count={canonForFrame(approved.id)} />
                <Button size="sm" variant="outline" onClick={() => setCanonFrame(approved.id)}>
                  <Sparkles className="size-4" /> Promote to canon
                </Button>
              </div>
              <FrameApprovals frame={approved} purposes={vocab?.purposes ?? []} />
            </div>
          )}

          <CraftWarnings warnings={shotWarnings} className="mt-4" />


          <div className="mt-8">
            <SectionLabel>Candidates ({candidates.length})</SectionLabel>
            {compare.length === 2 && (
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-primary/50 bg-surface p-3">
                {compare.map((id) => {
                  const f = frames.find((x) => x.id === id);
                  return (
                    <div key={id}>
                      <img
                        src={f?.image_url}
                        alt="Compared candidate frame"
                        className="aspect-video w-full rounded object-cover"
                      />
                      <Button size="sm" className="mt-2 w-full" onClick={() => approveFrame(id)}>
                        <Check className="size-4" /> Approve this
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {candidates.map((f) => (
                <div
                  key={f.id}
                  className={cn(
                    "overflow-hidden rounded-lg border bg-surface",
                    compare.includes(f.id) ? "border-primary" : "border-border",
                  )}
                >
                  <img
                    src={f.image_url}
                    alt="Candidate frame"
                    loading="lazy"
                    className="aspect-video w-full cursor-pointer object-cover"
                    onClick={() => toggleCompare(f.id)}
                  />
                  <div className="space-y-2 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="label-caps">{f.kind}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => toggleCompare(f.id)}>
                          Compare
                        </Button>
                        <Button size="sm" onClick={() => approveFrame(f.id)}>
                          Approve
                        </Button>
                      </div>
                    </div>
                    {(purposesFor(f.id).length > 0 || f.derived_from_frame_id) && (
                      <div className="flex flex-wrap gap-1">
                        {purposesFor(f.id).map((p) => (
                          <Chip key={p} tone="accent">
                            {purposeLabel(p)}
                          </Chip>
                        ))}
                        {f.derived_from_frame_id && <Chip>edit of a master</Chip>}
                      </div>
                    )}
                  </div>

                </div>
              ))}
              {candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No candidates yet. Compile a generation package, then import results.
                </p>
              )}
            </div>
          </div>

          <div className="mt-8">
            <KeyframePairs
              shotId={shotId}
              frames={frames.map((f) => ({ id: f.id, image_url: f.image_url, kind: f.kind }))}
              movement={movement}
              moves={vocab?.moves ?? []}
            />
          </div>
        </section>

        <aside className="space-y-6">
          <div>
            <SectionLabel>Shot</SectionLabel>
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3 text-sm">
              <p>{shot?.description}</p>
              {shot?.dialogue && <p className="text-muted-foreground italic">“{shot.dialogue}”</p>}
              <div className="flex flex-wrap gap-1 pt-1">
                {shot?.shot_characters?.map((sc) => (
                  <Chip key={sc.character_id} tone="accent">
                    {sc.characters?.name}
                  </Chip>
                ))}
                {shot?.locations?.name && <Chip>{shot.locations.name}</Chip>}
                {shot?.shot_elements?.map((se) => (
                  <Chip key={se.element_id}>{se.elements?.name}</Chip>
                ))}
              </div>
            </div>
          </div>

          <div>
            <SectionLabel>Continuity reference</SectionLabel>
            {prevApproved ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <img
                  src={prevApproved}
                  alt={`Approved frame from previous shot ${data?.prev?.shot_number}`}
                  className="aspect-video w-full object-cover"
                />
                <div className="bg-surface px-3 py-2 text-xs text-muted-foreground">
                  Previous approved frame — shot {data?.prev?.shot_number}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No previous approved frame.</p>
            )}
          </div>

          <div>
            <SectionLabel>Generation history</SectionLabel>
            <div className="space-y-2">
              {(data?.generations ?? []).map((g) => (
                <div key={g.id} className="rounded border border-border bg-surface p-3 text-xs">
                  <div className="flex justify-between">
                    <span>
                      {g.provider} · {g.tool ?? "—"}
                    </span>
                    <span className="label-caps">{g.status}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {new Date(g.created_at).toLocaleString()}
                  </div>
                  {g.status === "handed_off" && (
                    <label className="mt-2 inline-flex">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => importForGeneration(g.id, e.target.files)}
                      />
                      <span className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium hover:bg-surface-raised">
                        <Upload className="size-3.5" />
                        {importingId === g.id ? "Importing…" : "Import result"}
                      </span>
                    </label>
                  )}
                </div>
              ))}
              {(data?.generations ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No handoffs yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <GenerationPackageDialog shotId={shotId} open={pkgOpen} onOpenChange={setPkgOpen} />
      <PromoteToCanonDialog
        shotId={shotId}
        projectId={projectId}
        frameId={canonFrame}
        open={!!canonFrame}
        onOpenChange={(v) => !v && setCanonFrame(null)}
      />
    </main>
  );
}
