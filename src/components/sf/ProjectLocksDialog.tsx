import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { LOCK_FIELDS, STYLE_LOOK_BOUNDARY, type LockKey } from "@/lib/storyforge";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

type Locks = Partial<Record<LockKey, string | null>> & { locks_frozen_at?: string | null };

export function ProjectLocksDialog({
  projectId,
  project,
  open,
  onOpenChange,
}: {
  projectId: string;
  project: Locks | null | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<LockKey, string>>({
    style_lock: "",
    continuity: "",
    direction: "",
  });

  useEffect(() => {
    if (!open) return;
    setValues({
      style_lock: project?.style_lock ?? "",
      continuity: project?.continuity ?? "",
      direction: project?.direction ?? "",
    });
  }, [open, project]);

  const frozen = !!project?.locks_frozen_at;

  const save = useMutation({
    mutationFn: async (freeze: boolean) => {
      const patch = {
        ...values,
        ...(freeze ? { locks_frozen_at: new Date().toISOString() } : {}),
      };
      const { error } = await supabase.from("projects").update(patch).eq("id", projectId);
      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries();
      onOpenChange(false);
      toast.success("Locks saved — every future prompt uses this text verbatim");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Production locks</DialogTitle>
          <DialogDescription>
            These three blocks are emitted byte-identically at the top of every generation package
            in this project. Anything editable per shot drifts; anything emitted verbatim does not.
          </DialogDescription>
        </DialogHeader>

        {frozen && (
          <div className="flex gap-2 rounded border border-primary/50 bg-primary/5 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0 text-primary" />
            <span>
              Locks were frozen on {new Date(project!.locks_frozen_at!).toLocaleString()}. Editing
              them changes <strong className="text-foreground">every prompt</strong> in this
              project, and frames approved earlier were made under the previous locks.
            </span>
          </div>
        )}

        <div className="space-y-4">
          {LOCK_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`lock-${f.key}`}>{f.label}</Label>
              <p className="text-xs text-muted-foreground">{f.hint}</p>
              <Textarea
                id={`lock-${f.key}`}
                rows={7}
                className="font-mono text-xs"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {!frozen && (
            <Button
              variant="outline"
              onClick={() => save.mutate(true)}
              disabled={save.isPending}
            >
              Save &amp; freeze
            </Button>
          )}
          <Button onClick={() => save.mutate(false)} disabled={save.isPending}>
            Save locks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
