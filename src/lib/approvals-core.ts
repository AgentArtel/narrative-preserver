/**
 * Approval is scoped, not global: the same frame can be a pass as an armour
 * design and a hold as a face reference, simultaneously.
 *
 * `default` stays wired to the existing single-approved-frame behaviour so
 * nothing that already reads `frames.is_approved` regresses.
 */

import type { DB } from "./generation-package-core";

export const DEFAULT_PURPOSE = "default";

export type FrameApprovalRow = {
  id: string;
  frame_id: string;
  purpose: string;
  note: string | null;
  approved_at: string;
  approved_by: string | null;
};

export async function approveFrameFor(
  db: DB,
  {
    userId,
    frameId,
    purpose = DEFAULT_PURPOSE,
    note = null,
  }: { userId: string; frameId: string; purpose?: string; note?: string | null },
) {
  const { data: frame, error: frameError } = await db
    .from("frames")
    .select("id, shot_id")
    .eq("id", frameId)
    .eq("user_id", userId)
    .maybeSingle();
  if (frameError) throw new Error(frameError.message);
  if (!frame) throw new Error(`frames ${frameId} not found for this account`);

  const { error } = await db.from("frame_approvals").upsert(
    {
      user_id: userId,
      frame_id: frameId,
      purpose,
      note,
      approved_by: userId,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "frame_id,purpose" },
  );
  if (error) throw new Error(error.message);

  let shotStatus: string | null = null;
  if (purpose === DEFAULT_PURPOSE) {
    // Default approval keeps the single approved frame per shot in sync.
    await db
      .from("frames")
      .update({ is_approved: false })
      .eq("shot_id", frame.shot_id)
      .eq("user_id", userId);
    await db
      .from("frame_approvals")
      .delete()
      .eq("user_id", userId)
      .eq("purpose", DEFAULT_PURPOSE)
      .neq("frame_id", frameId)
      .in(
        "frame_id",
        (
          await db.from("frames").select("id").eq("shot_id", frame.shot_id).eq("user_id", userId)
        ).data?.map((f) => f.id) ?? [],
      );
    const { error: approveError } = await db
      .from("frames")
      .update({ is_approved: true })
      .eq("id", frameId)
      .eq("user_id", userId);
    if (approveError) throw new Error(approveError.message);

    const { data: shot } = await db
      .from("shots")
      .select("id, status")
      .eq("id", frame.shot_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (shot && shot.status !== "final") {
      await db
        .from("shots")
        .update({ status: "approved" })
        .eq("id", frame.shot_id)
        .eq("user_id", userId);
      shotStatus = "approved";
    } else {
      shotStatus = shot?.status ?? null;
    }
  }

  return { frame_id: frameId, shot_id: frame.shot_id, purpose, shot_status: shotStatus };
}

export async function revokeFrameApproval(
  db: DB,
  { userId, frameId, purpose }: { userId: string; frameId: string; purpose: string },
) {
  const { error } = await db
    .from("frame_approvals")
    .delete()
    .eq("user_id", userId)
    .eq("frame_id", frameId)
    .eq("purpose", purpose);
  if (error) throw new Error(error.message);
  if (purpose === DEFAULT_PURPOSE) {
    await db.from("frames").update({ is_approved: false }).eq("id", frameId).eq("user_id", userId);
  }
  return { frame_id: frameId, purpose, revoked: true };
}
