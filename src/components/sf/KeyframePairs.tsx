import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionLabel } from "@/components/sf/primitives";
import {
  KEYFRAME_FORMS,
  KEYFRAME_FORM_HELP,
  keyframeFormWarnings,
  type CameraMoveRow,
} from "@/lib/craft";
import { toast } from "sonner";
import { AlertTriangle, Plus, X } from "lucide-react";

type Frame = { id: string; image_url: string; kind: string };

/**
 * An a/b pair is recorded explicitly rather than inferred from frame kind:
 * the video model interpolates between a and b, so it renders the move you
 * chose instead of inventing one.
 */
export function KeyframePairs({
  shotId,
  frames,
  movement,
  moves,
}: {
  shotId: string;
  frames: Frame[];
  movement: string | null | undefined;
  moves: CameraMoveRow[];
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: pairs } = useQuery({
    queryKey: ["keyframe-pairs", shotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("keyframe_pairs")
        .select("*")
        .eq("shot_id", shotId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const frameById = new Map(frames.map((f) => [f.id, f]));

  async function addPair() {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("keyframe_pairs").insert({
      user_id: u.user!.id,
      shot_id: shotId,
      a_frame_id: frames[0]?.id ?? null,
      b_frame_id: frames[1]?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["keyframe-pairs", shotId] });
  }

  async function patchPair(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("keyframe_pairs").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["keyframe-pairs", shotId] });
  }

  async function removePair(id: string) {
    const { error } = await supabase.from("keyframe_pairs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["keyframe-pairs", shotId] });
  }

  return (
    <div>
      <SectionLabel>Keyframe pairs</SectionLabel>
      <p className="mb-2 text-xs text-muted-foreground">{KEYFRAME_FORM_HELP}</p>

      <div className="space-y-3">
        {(pairs ?? []).map((p) => {
          const warnings = keyframeFormWarnings(p.form, movement, moves);
          const a = p.a_frame_id ? frameById.get(p.a_frame_id) : undefined;
          const b = p.b_frame_id ? frameById.get(p.b_frame_id) : undefined;
          return (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="grid grid-cols-2 gap-3">
                {(["a", "b"] as const).map((slot) => {
                  const frame = slot === "a" ? a : b;
                  const column = slot === "a" ? "a_frame_id" : "b_frame_id";
                  return (
                    <div key={slot}>
                      <div className="label-caps mb-1">
                        {slot} — {slot === "a" ? "start" : "end"}
                      </div>
                      <div className="aspect-video w-full overflow-hidden rounded border border-border bg-background">
                        {frame ? (
                          <img
                            src={frame.image_url}
                            alt={`Keyframe ${slot} for this shot`}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                            none
                          </div>
                        )}
                      </div>
                      <Select
                        value={(slot === "a" ? p.a_frame_id : p.b_frame_id) ?? "none"}
                        onValueChange={(v) => patchPair(p.id, { [column]: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="mt-1.5 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No frame</SelectItem>
                          {frames.map((f, i) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.kind} {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Select
                  value={p.form ?? "unset"}
                  onValueChange={(v) => patchPair(p.id, { form: v === "unset" ? null : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">No form recorded</SelectItem>
                    {KEYFRAME_FORMS.map((f) => (
                      <SelectItem key={f.value} value={f.value} title={f.hint}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => removePair(p.id)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {KEYFRAME_FORMS.find((f) => f.value === p.form)?.hint ??
                  "Record which form the b frame used."}
              </p>
              {warnings.map((w) => (
                <p key={w} className="mt-1 flex gap-1.5 text-[11px] text-primary">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {w}
                </p>
              ))}
            </div>
          );
        })}
      </div>

      <Button size="sm" variant="outline" className="mt-3" onClick={addPair} disabled={busy}>
        <Plus className="size-3.5" /> Pair keyframes
      </Button>
    </div>
  );
}
