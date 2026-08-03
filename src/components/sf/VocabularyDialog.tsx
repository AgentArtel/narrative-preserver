import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useVocabularies } from "@/hooks/useVocabularies";
import { UNDECLARED_MOVE_HINT, TIME_MOVE_HINT, normalizeToken } from "@/lib/craft";
import type { CameraMoveRow, RiskClassRow, VocabRow } from "@/lib/craft";
import { toast } from "sonner";
import { EyeOff, Plus, RotateCcw } from "lucide-react";

type Table = "camera_moves" | "risk_classes";

/**
 * The doctrine is days old and partly one team's habit promoted to law.
 * A fourteenth camera move must be a row, not a deploy.
 */
export function VocabularyDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data } = useVocabularies(projectId);
  const [busy, setBusy] = useState(false);

  async function writeOverride(table: Table, row: VocabRow, patch: Record<string, unknown>) {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const base =
      table === "camera_moves"
        ? {
            is_time_move: (row as CameraMoveRow).is_time_move,
            implies_motion: (row as CameraMoveRow).implies_motion,
          }
        : { guidance: (row as RiskClassRow).guidance };
    const error = row.project_id
      ? (await supabase.from(table).update(patch as never).eq("id", row.id)).error
      : (
          await supabase.from(table).insert({
            user_id: u.user!.id,
            project_id: projectId,
            slug: row.slug,
            label: row.label,
            description: row.description,
            sort_order: row.sort_order,
            ...base,
            ...patch,
          } as never)
        ).error;
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vocabularies", projectId] });
  }

  async function restore(table: Table, row: VocabRow) {
    if (!row.project_id) return;
    setBusy(true);
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vocabularies", projectId] });
  }

  async function addRow(table: Table, label: string) {
    if (!label.trim()) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from(table).insert({
      user_id: u.user!.id,
      project_id: projectId,
      slug: normalizeToken(label),
      label: label.trim(),
      sort_order: 100,
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["vocabularies", projectId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vocabularies</DialogTitle>
          <DialogDescription>
            Camera moves and render-risk classes for this project. Editing a global entry creates a
            project override; hiding one removes it from this project only.
          </DialogDescription>
        </DialogHeader>

        <Section
          title="Camera moves"
          note={`${UNDECLARED_MOVE_HINT} ${TIME_MOVE_HINT}`}
          rows={data?.moves ?? []}
          busy={busy}
          onPatch={(row, patch) => writeOverride("camera_moves", row, patch)}
          onRestore={(row) => restore("camera_moves", row)}
          onAdd={(label) => addRow("camera_moves", label)}
          badge={(row) =>
            (row as CameraMoveRow).is_time_move
              ? "time move"
              : (row as CameraMoveRow).implies_motion
                ? "motion"
                : "still"
          }
        />

        <Section
          title="Render-risk classes"
          note="Three or more distinct classes on one shot means it is really a sequence."
          rows={data?.classes ?? []}
          busy={busy}
          onPatch={(row, patch) => writeOverride("risk_classes", row, patch)}
          onRestore={(row) => restore("risk_classes", row)}
          onAdd={(label) => addRow("risk_classes", label)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  note,
  rows,
  busy,
  onPatch,
  onRestore,
  onAdd,
  badge,
}: {
  title: string;
  note: string;
  rows: VocabRow[];
  busy: boolean;
  onPatch: (row: VocabRow, patch: Record<string, unknown>) => void;
  onRestore: (row: VocabRow) => void;
  onAdd: (label: string) => void;
  badge?: (row: VocabRow) => string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <section className="space-y-2">
      <div className="label-caps">{title}</div>
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.slug} className="flex items-center gap-2 rounded border border-border p-2">
            <div className="w-40 shrink-0">
              <div className="text-xs font-medium">{row.label}</div>
              <div className="font-mono text-[10px] text-muted-foreground">
                {row.slug}
                {badge ? ` · ${badge(row)}` : ""}
                {row.project_id ? " · project" : ""}
              </div>
            </div>
            <Input
              className="h-8 text-xs"
              defaultValue={row.description ?? ""}
              placeholder="Description"
              onBlur={(e) => {
                if (e.target.value !== (row.description ?? "")) {
                  onPatch(row, { description: e.target.value || null });
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              title="Hide in this project"
              disabled={busy}
              onClick={() => onPatch(row, { hidden: true })}
            >
              <EyeOff className="size-3.5" />
            </Button>
            {row.project_id && (
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                title="Remove this project override"
                disabled={busy}
                onClick={() => onRestore(row)}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs"
          placeholder={`Add a ${title.toLowerCase().replace(/e?s$/, "")}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !draft.trim()}
          onClick={() => {
            onAdd(draft);
            setDraft("");
          }}
        >
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </section>
  );
}
