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
import type { ModelRateRow, SheetChecklistRow } from "@/lib/validation";

import { toast } from "sonner";
import { EyeOff, Plus, RotateCcw } from "lucide-react";

type Table =
  | "camera_moves"
  | "risk_classes"
  | "sheet_checklist_items"
  | "model_rates"
  | "approval_purposes";


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
    // The columns a project override must carry over from the global row it
    // shadows, so hiding or re-describing one never drops its craft payload.
    const base =
      table === "camera_moves"
        ? {
            is_time_move: (row as CameraMoveRow).is_time_move,
            implies_motion: (row as CameraMoveRow).implies_motion,
          }
        : table === "risk_classes"
          ? { guidance: (row as RiskClassRow).guidance }
          : table === "sheet_checklist_items"
            ? { reason: (row as SheetChecklistRow).reason }
            : table === "model_rates"
              ? {
                  provider: (row as ModelRateRow).provider,
                  model: (row as ModelRateRow).model,
                  resolution: (row as ModelRateRow).resolution,
                  credits_per_second: (row as ModelRateRow).credits_per_second,
                }
              : {};

    const error = row.project_id
      ? (
          await supabase
            .from(table)
            .update(patch as never)
            .eq("id", row.id)
        ).error
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
    // A rate row needs its NOT NULL craft columns; the operator then edits
    // the credits-per-second in place.
    const required =
      table === "model_rates"
        ? { provider: "higgsfield", model: label.trim(), resolution: "480p", credits_per_second: 1 }
        : {};
    const { error } = await supabase.from(table).insert({
      user_id: u.user!.id,
      project_id: projectId,
      slug: normalizeToken(label),
      label: label.trim(),
      sort_order: 100,
      ...required,
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
            Camera moves, render-risk classes, the character-sheet checklist, the model rate card
            and approval purposes for this project. Editing a global entry creates a project
            override; hiding one removes it from this project only.
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

        <Section
          title="Character-sheet checklist"
          note="check_sheet cannot inspect pixels — it walks a human through these items. The reason beside each item is why it gets checked honestly."
          rows={data?.sheetItems ?? []}
          busy={busy}
          descriptionField="reason"
          descriptionPlaceholder="Reason — why this item matters"
          onPatch={(row, patch) => writeOverride("sheet_checklist_items", row, patch)}
          onRestore={(row) => restore("sheet_checklist_items", row)}
          onAdd={(label) => addRow("sheet_checklist_items", label)}
        />

        <Section
          title="Model rate card"
          note="Rates change, so they are rows rather than constants. A 15s retry at the top tier is 330 credits; the same 15s at previs is 15."
          rows={data?.rates ?? []}
          busy={busy}
          numericField={{
            key: "credits_per_second",
            label: "cr/s",
            get: (row) => (row as ModelRateRow).credits_per_second,
          }}
          badge={(row) =>
            `${(row as ModelRateRow).provider} ${(row as ModelRateRow).resolution}`
          }
          onPatch={(row, patch) => writeOverride("model_rates", row, patch)}
          onRestore={(row) => restore("model_rates", row)}
          onAdd={(label) => addRow("model_rates", label)}
        />

        <Section
          title="Approval purposes"
          note="Approval is scoped: the same frame can be a pass as an armour design and a hold as a face reference."
          rows={data?.purposes ?? []}
          busy={busy}
          onPatch={(row, patch) => writeOverride("approval_purposes", row, patch)}
          onRestore={(row) => restore("approval_purposes", row)}
          onAdd={(label) => addRow("approval_purposes", label)}
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
  descriptionField = "description",
  descriptionPlaceholder = "Description",
  numericField,
}: {
  title: string;
  note: string;
  rows: VocabRow[];
  busy: boolean;
  onPatch: (row: VocabRow, patch: Record<string, unknown>) => void;
  onRestore: (row: VocabRow) => void;
  onAdd: (label: string) => void;
  badge?: (row: VocabRow) => string;
  /** Some vocabularies carry their prose in a craft-specific column. */
  descriptionField?: string;
  descriptionPlaceholder?: string;
  numericField?: { key: string; label: string; get: (row: VocabRow) => number };
}) {
  const [draft, setDraft] = useState("");
  return (
    <section className="space-y-2">
      <div className="label-caps">{title}</div>
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="space-y-1.5">
        {rows.map((row) => {
          const prose = String((row as unknown as Record<string, unknown>)[descriptionField] ?? "");
          return (
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
                defaultValue={prose}
                placeholder={descriptionPlaceholder}
                onBlur={(e) => {
                  if (e.target.value !== prose) {
                    onPatch(row, { [descriptionField]: e.target.value || null });
                  }
                }}
              />
              {numericField && (
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20 text-xs tabular-nums"
                    defaultValue={numericField.get(row)}
                    onBlur={(e) => {
                      const next = Number(e.target.value);
                      if (Number.isFinite(next) && next !== numericField.get(row)) {
                        onPatch(row, { [numericField.key]: next });
                      }
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">{numericField.label}</span>
                </div>
              )}

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
