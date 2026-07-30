import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CanonSubject } from "@/lib/storyforge";

type AspectRow = {
  key: string;
  label: string;
  subjectType: CanonSubject;
  subjectId: string;
  aspect: string;
};

export function PromoteToCanonDialog({
  shotId,
  projectId,
  frameId,
  open,
  onOpenChange,
}: {
  shotId: string;
  projectId: string;
  frameId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: rows } = useQuery({
    queryKey: ["canon-aspects", shotId],
    enabled: open,
    queryFn: async (): Promise<AspectRow[]> => {
      const [{ data: shot }, { data: chars }, { data: els }] = await Promise.all([
        supabase.from("shots").select("id, location_id, locations(*)").eq("id", shotId).single(),
        supabase.from("shot_characters").select("character_id, characters(*)").eq("shot_id", shotId),
        supabase.from("shot_elements").select("element_id, elements(*)").eq("shot_id", shotId),
      ]);
      const out: AspectRow[] = [];
      for (const c of chars ?? []) {
        const name = c.characters?.name ?? "Character";
        out.push({
          key: `char-face-${c.character_id}`,
          label: `${name} — face`,
          subjectType: "character",
          subjectId: c.character_id,
          aspect: "face",
        });
        out.push({
          key: `char-outfit-${c.character_id}`,
          label: `${name} — outfit`,
          subjectType: "character",
          subjectId: c.character_id,
          aspect: "outfit",
        });
      }
      if (shot?.location_id) {
        out.push({
          key: `loc-${shot.location_id}`,
          label: `${shot.locations?.name ?? "Location"} — design`,
          subjectType: "location",
          subjectId: shot.location_id,
          aspect: "architecture",
        });
      }
      for (const e of els ?? []) {
        out.push({
          key: `el-${e.element_id}`,
          label: `${e.elements?.name ?? "Element"} — design`,
          subjectType: "element",
          subjectId: e.element_id,
          aspect: "design",
        });
      }
      out.push({
        key: "lighting",
        label: "Lighting",
        subjectType: "shot",
        subjectId: shotId,
        aspect: "lighting",
      });
      out.push({
        key: "composition",
        label: "Composition",
        subjectType: "shot",
        subjectId: shotId,
        aspect: "composition",
      });
      return out;
    },
  });

  async function save() {
    const selected = (rows ?? []).filter((r) => checked[r.key]);
    if (!selected.length) {
      toast.error("Select at least one aspect");
      return;
    }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("canon_records").insert(
        selected.map((r) => ({
          user_id: u.user!.id,
          project_id: projectId,
          subject_type: r.subjectType,
          subject_id: r.subjectId,
          aspect: r.aspect,
          description: notes[r.key] || r.label,
          source_frame_id: frameId,
        })),
      );
      if (error) throw error;
      qc.invalidateQueries();
      toast.success(`${selected.length} canon record${selected.length === 1 ? "" : "s"} created`);
      setChecked({});
      setNotes({});
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Promote to canon</DialogTitle>
          <DialogDescription>
            Each checked aspect becomes a permanent canon record tied to this frame, and is injected
            into every future generation package for that subject.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(rows ?? []).map((r) => (
            <div key={r.key} className="rounded border border-border bg-surface p-3">
              <label className="flex cursor-pointer items-center gap-3">
                <Checkbox
                  checked={!!checked[r.key]}
                  onCheckedChange={(v) => setChecked((s) => ({ ...s, [r.key]: !!v }))}
                />
                <span className="text-sm font-medium">{r.label}</span>
              </label>
              {checked[r.key] && (
                <Input
                  className="mt-3"
                  placeholder="Describe what is now canon (e.g. scar over left brow, always visible)"
                  value={notes[r.key] ?? ""}
                  onChange={(e) => setNotes((s) => ({ ...s, [r.key]: e.target.value }))}
                />
              )}
            </div>
          ))}
          {rows?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Add cast, a location or elements to this shot first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            Create canon records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
