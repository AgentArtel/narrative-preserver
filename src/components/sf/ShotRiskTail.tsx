import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionLabel } from "@/components/sf/primitives";
import { supabase } from "@/integrations/supabase/client";
import {
  asRiskTail,
  riskTailWarnings,
  type RiskClassRow,
  type RiskEntry,
} from "@/lib/craft";
import { toast } from "sonner";
import { AlertTriangle, Plus, X } from "lucide-react";

/**
 * The risk tail is written before the render, while everyone is calm.
 * It is app-only: it must never reach the generation package.
 */
export function ShotRiskTail({
  shotId,
  riskTail,
  classes,
}: {
  shotId: string;
  riskTail: unknown;
  classes: RiskClassRow[];
}) {
  const qc = useQueryClient();
  const [entries, setEntries] = useState<RiskEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEntries(asRiskTail(riskTail));
  }, [shotId, riskTail]);

  const warnings = riskTailWarnings(entries, classes);

  function patch(i: number, next: Partial<RiskEntry>) {
    setEntries((es) => es.map((e, j) => (j === i ? { ...e, ...next } : e)));
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("shots")
      .update({ risk_tail: entries.filter((e) => e.class || e.prediction) as never })
      .eq("id", shotId);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
    toast.success("Risk tail saved");
  }

  return (
    <div className="space-y-2">
      <SectionLabel>Render risk</SectionLabel>

      {entries.length === 0 ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setEntries([
              { class: classes[0]?.slug ?? "", prediction: "", fallback: "", occurred: null },
            ])
          }
        >
          <Plus className="size-3.5" /> Predict a failure
        </Button>
      ) : (
        <>
          {entries.map((e, i) => (
            <div key={i} className="space-y-1.5 rounded border border-border p-2">
              <div className="flex items-center gap-2">
                <Select value={e.class} onValueChange={(v) => patch(i, { class: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c.slug} value={c.slug} title={c.guidance ?? undefined}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => setEntries((es) => es.filter((_, j) => j !== i))}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <Input
                className="h-8 text-xs"
                placeholder="Prediction — how this shot will fail"
                value={e.prediction}
                onChange={(ev) => patch(i, { prediction: ev.target.value })}
              />
              <Input
                className="h-8 text-xs"
                placeholder="Fallback — what we do instead"
                value={e.fallback}
                onChange={(ev) => patch(i, { fallback: ev.target.value })}
              />
              <Select
                value={e.occurred ?? "unset"}
                onValueChange={(v) =>
                  patch(i, { occurred: v === "unset" ? null : (v as "yes" | "no") })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">Not rendered yet</SelectItem>
                  <SelectItem value="yes">Occurred</SelectItem>
                  <SelectItem value="no">Did not occur</SelectItem>
                </SelectContent>
              </Select>
              {classes.find((c) => c.slug === e.class)?.guidance && (
                <p className="text-[11px] text-muted-foreground">
                  {classes.find((c) => c.slug === e.class)!.guidance}
                </p>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setEntries((es) => [
                  ...es,
                  { class: classes[0]?.slug ?? "", prediction: "", fallback: "", occurred: null },
                ])
              }
            >
              <Plus className="size-3.5" /> Add
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              Save risk tail
            </Button>
          </div>
        </>
      )}

      {warnings.map((w) => (
        <p key={w} className="flex gap-1.5 text-[11px] text-primary">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          {w}
        </p>
      ))}
    </div>
  );
}
