import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Chip, SectionLabel } from "@/components/sf/primitives";
import { LocationGeography } from "@/components/sf/LocationGeography";
import {
  LocationLockChips,
  LocationLocks,
  type LocationLockRow,
} from "@/components/sf/LocationLocks";

import { uploadImage } from "@/lib/upload";
import { toast } from "sonner";
import { Plus, Upload } from "lucide-react";
import type { CanonSubject } from "@/lib/storyforge";

type LibTable = "characters" | "locations" | "elements";

type Row = {
  id: string;
  name: string;
  description: string | null;
  role?: string | null;
  element_type?: string | null;
};

export function LibraryPage({
  projectId,
  table,
  title,
  subjectType,
  secondaryField,
}: {
  projectId: string;
  table: LibTable;
  title: string;
  subjectType: CanonSubject;
  secondaryField?: { key: "role" | "element_type"; label: string };
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [secondary, setSecondary] = useState("");
  const [description, setDescription] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["library-page", table, projectId],
    queryFn: async () => {
      const [rowsRes, canonRes, refsRes] = await Promise.all([
        supabase.from(table).select("*").eq("project_id", projectId).order("name"),
        supabase
          .from("canon_records")
          .select("*")
          .eq("project_id", projectId)
          .eq("subject_type", subjectType),
        supabase.from("reference_links").select("*, asset_references(*)").eq("owner_type", table),
      ]);
      if (rowsRes.error) throw rowsRes.error;
      return {
        rows: (rowsRes.data ?? []) as unknown as Row[],
        canon: canonRes.data ?? [],
        refs: refsRes.data ?? [],
      };
    },
  });

  const selected = (data?.rows ?? []).find((r) => r.id === selectedId) ?? data?.rows?.[0] ?? null;

  async function create() {
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const payload: Record<string, unknown> = {
      user_id: u.user!.id,
      project_id: projectId,
      name,
      description,
    };
    if (secondaryField) payload[secondaryField.key] = secondary || null;
    const { error } = await supabase.from(table).insert(payload as never);
    if (error) return toast.error(error.message);
    setOpen(false);
    setName("");
    setSecondary("");
    setDescription("");
    qc.invalidateQueries();
  }

  async function addReference(files: FileList | null) {
    if (!files?.length || !selected) return;
    try {
      const { data: u } = await supabase.auth.getUser();
      for (const f of Array.from(files)) {
        const url = await uploadImage(f);
        const { data: ref, error } = await supabase
          .from("asset_references")
          .insert({
            user_id: u.user!.id,
            project_id: projectId,
            image_url: url,
            roles: ["primary"],
          })
          .select()
          .single();
        if (error) throw error;
        const { error: linkErr } = await supabase.from("reference_links").insert({
          user_id: u.user!.id,
          reference_id: ref.id,
          owner_type: table,
          owner_id: selected.id,
          role: "primary",
        });
        if (linkErr) throw linkErr;
      }
      qc.invalidateQueries();
      toast.success("Reference added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }

  const selectedRefs = (data?.refs ?? []).filter((r) => r.owner_id === selected?.id);
  const selectedCanon = (data?.canon ?? []).filter((c) => c.subject_id === selected?.id);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New
        </Button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {(data?.rows ?? []).map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`rounded-lg border bg-surface p-4 text-left transition-colors ${
                r.id === selected?.id ? "border-primary" : "border-border hover:border-muted"
              }`}
            >
              <div className="text-sm font-semibold">{r.name}</div>
              {(r.role || r.element_type) && (
                <div className="label-caps mt-0.5">{r.role ?? r.element_type}</div>
              )}
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{r.description}</p>
              {table === "locations" && (
                <LocationLockChips className="mt-2" location={r as unknown as LocationLockRow} />
              )}
            </button>
          ))}
          {(data?.rows ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </div>

        <aside className="space-y-6">
          {selected ? (
            <>
              <div>
                <SectionLabel>{selected.name}</SectionLabel>
                <p className="text-sm text-muted-foreground">{selected.description}</p>
              </div>
              {table === "locations" && (
                <>
                  <LocationGeography
                    location={
                      selected as {
                        id: string;
                        landmarks?: unknown;
                        blocking_anchor?: string | null;
                      }
                    }
                  />
                  <LocationLocks location={selected as unknown as LocationLockRow} />
                </>
              )}

              <div>
                <SectionLabel>Reference images</SectionLabel>
                <div className="grid grid-cols-2 gap-2">
                  {selectedRefs.map((r) => (
                    <img
                      key={r.id}
                      src={r.asset_references?.image_url}
                      alt={`Reference for ${selected.name}`}
                      className="aspect-square w-full rounded border border-border object-cover"
                    />
                  ))}
                </div>
                <label className="mt-2 inline-flex">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => addReference(e.target.files)}
                  />
                  <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-xs hover:bg-surface-raised">
                    <Upload className="size-3.5" /> Upload reference
                  </span>
                </label>
              </div>
              <div>
                <SectionLabel>Canon</SectionLabel>
                <div className="space-y-2">
                  {selectedCanon.map((c) => (
                    <div key={c.id} className="rounded border border-canon/40 bg-canon/5 p-2">
                      <Chip tone="canon">{c.aspect}</Chip>
                      <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
                    </div>
                  ))}
                  {selectedCanon.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No canon yet. Promote aspects from an approved frame.
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select an item.</p>
          )}
        </aside>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New {title.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lib-name">Name</Label>
              <Input id="lib-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {secondaryField && (
              <div className="space-y-1.5">
                <Label htmlFor="lib-sec">{secondaryField.label}</Label>
                <Input
                  id="lib-sec"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="lib-desc">Description</Label>
              <Textarea
                id="lib-desc"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
