import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, SectionLabel, StatusBadge, StatusDot } from "@/components/sf/primitives";
import { GenerationPackageDialog } from "@/components/sf/GenerationPackageDialog";
import {
  CAMERA_FIELDS,
  SHOT_STATUSES,
  asRecord,
  stateSummary,
  type Camera,
  type ShotStatus,
} from "@/lib/storyforge";
import { toast } from "sonner";
import { Copy, GripVertical, Package, Plus, PanelLeft, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects/$projectId/scene/$sceneId")({
  head: () => ({
    meta: [
      { title: "Scene Workspace — StoryForge" },
      { name: "description", content: "Storyboard, shot list and per-shot generation context in one workspace." },
      { property: "og:title", content: "Scene Workspace — StoryForge" },
      { property: "og:description", content: "Storyboard, shot list and per-shot generation context in one workspace." },
    ],
  }),
  component: SceneWorkspace,
  errorComponent: ({ error }) => <div className="p-8 text-sm text-destructive">{error.message}</div>,
});

function SceneWorkspace() {
  const { projectId, sceneId } = useParams({
    from: "/_authenticated/projects/$projectId/scene/$sceneId",
  });
  const qc = useQueryClient();
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: tree } = useQuery({
    queryKey: ["scene-tree", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sequences")
        .select("*, scenes(*)")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: scene } = useQuery({
    queryKey: ["scene", sceneId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenes")
        .select("*, beats(*)")
        .eq("id", sceneId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: shots } = useQuery({
    queryKey: ["shots", sceneId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shots")
        .select(
          "*, frames(id, image_url, is_approved), shot_characters(character_id, state, characters(name)), shot_elements(element_id, state, elements(name)), locations(name)",
        )
        .eq("scene_id", sceneId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: library } = useQuery({
    queryKey: ["library", projectId],
    queryFn: async () => {
      const [chars, locs, els, looks] = await Promise.all([
        supabase.from("characters").select("*").eq("project_id", projectId).order("name"),
        supabase.from("locations").select("*").eq("project_id", projectId).order("name"),
        supabase.from("elements").select("*").eq("project_id", projectId).order("name"),
        supabase.from("looks").select("*").eq("project_id", projectId).order("name"),
      ]);
      return {
        characters: chars.data ?? [],
        locations: locs.data ?? [],
        elements: els.data ?? [],
        looks: looks.data ?? [],
      };
    },
  });

  useEffect(() => {
    if (!selectedShotId && shots?.length) setSelectedShotId(shots[0].id);
  }, [shots, selectedShotId]);

  const selected = useMemo(
    () => (shots ?? []).find((s) => s.id === selectedShotId) ?? null,
    [shots, selectedShotId],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["shots", sceneId] });
    qc.invalidateQueries({ queryKey: ["project-home", projectId] });
  };

  const addShot = useMutation({
    mutationFn: async (afterSort?: number) => {
      const { data: u } = await supabase.auth.getUser();
      const nextSort = (afterSort ?? (shots?.length ?? 0)) + 1;
      const { data, error } = await supabase
        .from("shots")
        .insert({
          user_id: u.user!.id,
          scene_id: sceneId,
          shot_number: `${(shots?.length ?? 0) + 1}`,
          description: "New shot",
          status: "idea" as ShotStatus,
          sort_order: nextSort,
          camera: {},
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      invalidate();
      setSelectedShotId(s.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateShot = useMutation({
    mutationFn: async (id: string) => {
      const src = (shots ?? []).find((s) => s.id === id);
      if (!src) throw new Error("Shot not found");
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("shots")
        .insert({
          user_id: u.user!.id,
          scene_id: sceneId,
          beat_id: src.beat_id,
          shot_number: `${src.shot_number}b`,
          description: src.description,
          dialogue: src.dialogue,
          duration_seconds: src.duration_seconds,
          camera: src.camera,
          location_id: src.location_id,
          location_state: src.location_state,
          look_id: src.look_id,
          status: "idea" as ShotStatus,
          sort_order: (src.sort_order ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (s) => {
      invalidate();
      setSelectedShotId(s.id);
      toast.success("Shot duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchShot = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("shots").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  async function reorder(targetId: string) {
    if (!dragId || dragId === targetId || !shots) return;
    const list = [...shots];
    const from = list.findIndex((s) => s.id === dragId);
    const to = list.findIndex((s) => s.id === targetId);
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setDragId(null);
    await Promise.all(
      list.map((s, i) => supabase.from("shots").update({ sort_order: i + 1 }).eq("id", s.id)),
    );
    invalidate();
  }

  async function toggleShotCharacter(characterId: string) {
    if (!selected) return;
    const existing = selected.shot_characters?.find((sc) => sc.character_id === characterId);
    if (existing) {
      await supabase
        .from("shot_characters")
        .delete()
        .eq("shot_id", selected.id)
        .eq("character_id", characterId);
    } else {
      const { data: u } = await supabase.auth.getUser();
      await supabase
        .from("shot_characters")
        .insert({ user_id: u.user!.id, shot_id: selected.id, character_id: characterId, state: {} });
    }
    invalidate();
  }

  async function toggleShotElement(elementId: string) {
    if (!selected) return;
    const existing = selected.shot_elements?.find((se) => se.element_id === elementId);
    if (existing) {
      await supabase
        .from("shot_elements")
        .delete()
        .eq("shot_id", selected.id)
        .eq("element_id", elementId);
    } else {
      const { data: u } = await supabase.auth.getUser();
      await supabase
        .from("shot_elements")
        .insert({ user_id: u.user!.id, shot_id: selected.id, element_id: elementId, state: {} });
    }
    invalidate();
  }

  async function setStateJson(
    table: "shot_characters" | "shot_elements",
    key: "character_id" | "element_id",
    id: string,
    text: string,
  ) {
    const state: Record<string, string> = {};
    for (const part of text.split(",")) {
      const [k, ...rest] = part.split(":");
      if (k?.trim() && rest.length) state[k.trim()] = rest.join(":").trim();
    }
    if (table === "shot_characters") {
      await supabase
        .from("shot_characters")
        .update({ state })
        .eq("shot_id", selected!.id)
        .eq("character_id", id);
    } else {
      await supabase
        .from("shot_elements")
        .update({ state })
        .eq("shot_id", selected!.id)
        .eq("element_id", id);
    }
    void key;
    invalidate();
  }

  const camera = (selected?.camera ?? {}) as Camera;

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setShowLeft((v) => !v)}>
          <PanelLeft className="size-4" /> Tree
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowRight((v) => !v)}>
          <PanelRight className="size-4" /> Context
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* LEFT */}
        <aside
          className={cn(
            "w-64 shrink-0 overflow-y-auto border-r border-border bg-surface p-3",
            !showLeft && "hidden",
            "max-lg:absolute max-lg:inset-y-0 max-lg:z-20 max-lg:mt-[104px]",
          )}
        >
          {(tree ?? []).map((seq) => (
            <div key={seq.id} className="mb-4">
              <div className="label-caps">{seq.title}</div>
              <div className="mt-1 space-y-0.5">
                {(seq.scenes ?? []).map((sc) => (
                  <Link
                    key={sc.id}
                    to="/projects/$projectId/scene/$sceneId"
                    params={{ projectId, sceneId: sc.id }}
                    className={cn(
                      "block truncate rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                      sc.id === sceneId && "bg-surface-raised text-foreground",
                    )}
                  >
                    {sc.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div className="mt-6 border-t border-border pt-4">
            <SectionLabel>Beats</SectionLabel>
            <ol className="space-y-1">
              {(scene?.beats ?? [])
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((b, i) => (
                  <li key={b.id} className="flex gap-2 text-xs text-muted-foreground">
                    <span className="font-mono text-primary">{i + 1}</span>
                    <span>{b.description}</span>
                  </li>
                ))}
            </ol>
          </div>

          <div className="mt-6 border-t border-border pt-4">
            <SectionLabel>Shots</SectionLabel>
            <div className="space-y-0.5">
              {(shots ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedShotId(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-surface-raised",
                    s.id === selectedShotId && "bg-surface-raised",
                  )}
                >
                  <StatusDot status={s.status} />
                  <span className="font-mono text-primary">{s.shot_number}</span>
                  <span className="truncate text-muted-foreground">{s.description}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">{scene?.title}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{scene?.brief}</p>
            </div>
            <Button size="sm" onClick={() => addShot.mutate(undefined)}>
              <Plus className="size-4" /> Add shot
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(shots ?? []).map((s) => {
              const approved = s.frames?.find((f) => f.is_approved);
              return (
                <article
                  key={s.id}
                  draggable
                  onDragStart={() => setDragId(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => reorder(s.id)}
                  onClick={() => setSelectedShotId(s.id)}
                  className={cn(
                    "cursor-pointer overflow-hidden rounded-lg border bg-surface transition-colors",
                    s.id === selectedShotId ? "border-primary" : "border-border hover:border-muted",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="size-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs text-primary">{s.shot_number}</span>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div
                    className={cn(
                      "aspect-video w-full border-y",
                      approved ? "frame-approved" : "frame-candidate",
                    )}
                  >
                    {approved ? (
                      <img
                        src={approved.image_url}
                        alt={`Approved frame for shot ${s.shot_number}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-background text-xs text-muted-foreground">
                        {s.frames?.length ? `${s.frames.length} candidates` : "No frame yet"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <p className="line-clamp-2 text-sm">{s.description}</p>
                    {s.dialogue && (
                      <p className="line-clamp-1 text-xs text-muted-foreground italic">
                        “{s.dialogue}”
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {s.shot_characters?.map((sc) => (
                        <Chip key={sc.character_id} tone="accent">
                          {sc.characters?.name}
                        </Chip>
                      ))}
                      {s.locations?.name && <Chip>{s.locations.name}</Chip>}
                      {s.duration_seconds != null && <Chip>{s.duration_seconds}s</Chip>}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          to="/projects/$projectId/shot/$shotId"
                          params={{ projectId, shotId: s.id }}
                        >
                          Open
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateShot.mutate(s.id);
                        }}
                      >
                        <Copy className="size-3.5" /> Duplicate
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        {/* RIGHT */}
        <aside
          className={cn(
            "w-80 shrink-0 overflow-y-auto border-l border-border bg-surface p-4",
            !showRight && "hidden",
            "max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:mt-[104px]",
          )}
        >
          {!selected ? (
            <p className="text-sm text-muted-foreground">Select a shot.</p>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-primary">{selected.shot_number}</span>
                  <StatusBadge status={selected.status} />
                </div>
                <Button className="mt-3 w-full" onClick={() => setPkgOpen(true)}>
                  <Package className="size-4" /> Generation package
                </Button>
              </div>

              <div className="space-y-2">
                <SectionLabel>Shot</SectionLabel>
                <Textarea
                  value={selected.description ?? ""}
                  onChange={(e) =>
                    patchShot.mutate({ id: selected.id, patch: { description: e.target.value } })
                  }
                  rows={3}
                />
                <Textarea
                  placeholder="Dialogue"
                  value={selected.dialogue ?? ""}
                  onChange={(e) =>
                    patchShot.mutate({ id: selected.id, patch: { dialogue: e.target.value } })
                  }
                  rows={2}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="Seconds"
                    value={selected.duration_seconds ?? ""}
                    onChange={(e) =>
                      patchShot.mutate({
                        id: selected.id,
                        patch: { duration_seconds: e.target.value ? Number(e.target.value) : null },
                      })
                    }
                  />
                  <Select
                    value={selected.status}
                    onValueChange={(v) =>
                      patchShot.mutate({ id: selected.id, patch: { status: v } })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHOT_STATUSES.map((st) => (
                        <SelectItem key={st} value={st}>
                          {st}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <SectionLabel>Camera</SectionLabel>
                {CAMERA_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{f.label}</Label>
                    <Input
                      placeholder={f.placeholder}
                      value={camera[f.key] ?? ""}
                      onChange={(e) =>
                        patchShot.mutate({
                          id: selected.id,
                          patch: { camera: { ...camera, [f.key]: e.target.value } },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <SectionLabel>Cast in shot</SectionLabel>
                {(library?.characters ?? []).map((c) => {
                  const sc = selected.shot_characters?.find((x) => x.character_id === c.id);
                  return (
                    <div key={c.id} className="rounded border border-border p-2">
                      <button
                        className="flex w-full items-center justify-between text-left text-sm"
                        onClick={() => toggleShotCharacter(c.id)}
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {sc ? "remove" : "add"}
                        </span>
                      </button>
                      {sc && (
                        <Input
                          className="mt-2 text-xs"
                          placeholder="outfit: hooded cloak, damage: torn sleeve"
                          defaultValue={stateSummary(sc.state).replaceAll(" · ", ", ")}
                          onBlur={(e) =>
                            setStateJson(
                              "shot_characters",
                              "character_id",
                              c.id,
                              e.target.value,
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <SectionLabel>Location</SectionLabel>
                <Select
                  value={selected.location_id ?? "none"}
                  onValueChange={(v) =>
                    patchShot.mutate({
                      id: selected.id,
                      patch: { location_id: v === "none" ? null : v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No location</SelectItem>
                    {(library?.locations ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="state — lighting: torchlit, condition: ruined"
                  defaultValue={Object.entries(asRecord(selected.location_state))
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")}
                  onBlur={(e) => {
                    const state: Record<string, string> = {};
                    for (const part of e.target.value.split(",")) {
                      const [k, ...rest] = part.split(":");
                      if (k?.trim() && rest.length) state[k.trim()] = rest.join(":").trim();
                    }
                    patchShot.mutate({ id: selected.id, patch: { location_state: state } });
                  }}
                />
              </div>

              <div className="space-y-2">
                <SectionLabel>Elements</SectionLabel>
                {(library?.elements ?? []).map((el) => {
                  const se = selected.shot_elements?.find((x) => x.element_id === el.id);
                  return (
                    <div key={el.id} className="rounded border border-border p-2">
                      <button
                        className="flex w-full items-center justify-between text-left text-sm"
                        onClick={() => toggleShotElement(el.id)}
                      >
                        <span>{el.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {se ? "remove" : "add"}
                        </span>
                      </button>
                      {se && (
                        <Input
                          className="mt-2 text-xs"
                          placeholder="state: glowing runes"
                          defaultValue={stateSummary(se.state).replaceAll(" · ", ", ")}
                          onBlur={(e) =>
                            setStateJson("shot_elements", "element_id", el.id, e.target.value)
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <SectionLabel>Look</SectionLabel>
                <Select
                  value={selected.look_id ?? "none"}
                  onValueChange={(v) =>
                    patchShot.mutate({
                      id: selected.id,
                      patch: { look_id: v === "none" ? null : v },
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No look" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No look</SelectItem>
                    {(library?.looks ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </aside>
      </div>

      {selected && (
        <GenerationPackageDialog shotId={selected.id} open={pkgOpen} onOpenChange={setPkgOpen} />
      )}
    </div>
  );
}
