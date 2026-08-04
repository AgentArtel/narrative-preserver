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
import { Chip, SectionLabel } from "@/components/sf/primitives";
import { approveFrameFor, revokeFrameApproval, DEFAULT_PURPOSE } from "@/lib/approvals-core";
import type { DB } from "@/lib/generation-package-core";
import type { VocabRow } from "@/lib/craft";
import { editLineageBlock } from "@/lib/validation";
import { toast } from "sonner";
import { Check, GitBranch, Lock, X } from "lucide-react";

type FrameRow = {
  id: string;
  image_url: string;
  derived_from_frame_id?: string | null;
  is_composite?: boolean | null;
};

/**
 * Approval is scoped, not global: the same frame can be a pass as an armour
 * design and a hold as a face reference, simultaneously. `default` stays wired
 * to the existing single-approved-frame behaviour.
 */
export function FrameApprovals({
  frame,
  purposes,
  onMaster,
}: {
  frame: FrameRow;
  purposes: VocabRow[];
  onMaster?: (frameId: string) => void;
}) {
  const qc = useQueryClient();
  const [purpose, setPurpose] = useState(DEFAULT_PURPOSE);
  const [busy, setBusy] = useState(false);

  const { data: approvals } = useQuery({
    queryKey: ["frame-approvals", frame.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("frame_approvals")
        .select("purpose, note, approved_at")
        .eq("frame_id", frame.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const lineageBlock = editLineageBlock(frame);
  const labelFor = (slug: string) => purposes.find((p) => p.slug === slug)?.label ?? slug;

  async function act(revoke: boolean) {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user!.id;
      const db = supabase as unknown as DB;
      if (revoke) await revokeFrameApproval(db, { userId, frameId: frame.id, purpose });
      else await approveFrameFor(db, { userId, frameId: frame.id, purpose });
      qc.invalidateQueries();
      toast.success(
        revoke
          ? `Approval withdrawn for ${labelFor(purpose)}`
          : `Approved for ${labelFor(purpose)} — a production decision`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change this approval");
    } finally {
      setBusy(false);
    }
  }

  const approvedFor = new Set((approvals ?? []).map((a) => a.purpose));

  return (
    <div className="space-y-2">
      <SectionLabel>Approved for</SectionLabel>
      <div className="flex flex-wrap gap-1">
        {(approvals ?? []).map((a) => (
          <Chip key={a.purpose} tone="accent">
            {labelFor(a.purpose)}
          </Chip>
        ))}
        {!approvals?.length && (
          <span className="text-xs text-muted-foreground">
            Candidate — not approved for any purpose yet.
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={purpose} onValueChange={setPurpose}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {purposes.map((p) => (
              <SelectItem key={p.slug} value={p.slug}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {approvedFor.has(purpose) ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(true)}>
            <X className="size-3.5" /> Hold for this purpose
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => act(false)}>
            <Check className="size-3.5" /> Approve for this purpose
          </Button>
        )}
      </div>

      {(frame.derived_from_frame_id || frame.is_composite) && (
        <div className="space-y-1 rounded border border-border bg-surface p-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitBranch className="size-3.5" />
            {frame.is_composite ? "Composited onto a master" : "Edit derived from a master"}
          </div>
          {frame.derived_from_frame_id && onMaster && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => onMaster(frame.derived_from_frame_id!)}
            >
              Show the original master
            </Button>
          )}
        </div>
      )}

      {/* The one place the app refuses. Disabled with the reason visible. */}
      <Button
        size="sm"
        variant="outline"
        className="w-full"
        disabled={!!lineageBlock}
        title={lineageBlock ?? undefined}
        onClick={() =>
          toast.info(
            "Edits are made in the generation tool. Register the result with record_frame_edit so the lineage back to this master is kept.",
          )
        }
      >
        {lineageBlock ? <Lock className="size-3.5" /> : <GitBranch className="size-3.5" />}
        {lineageBlock ? "Editing blocked — this frame is already an edit" : "Edit from this frame"}
      </Button>
      {lineageBlock && <p className="text-[11px] text-muted-foreground">{lineageBlock}</p>}
    </div>
  );
}
