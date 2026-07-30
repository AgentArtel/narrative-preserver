import type { DB } from "./generation-package-core";
import type { FrameKind } from "./storyforge";

/**
 * Inserts candidate frames from already-hosted image URLs, and — when a
 * generation is given — marks it imported and moves the shot to "candidates".
 * Parameterized by client so the browser and the MCP route share semantics.
 */
export async function insertFramesFromUrls(
  supabase: DB,
  {
    userId,
    shotId,
    imageUrls,
    kind = "keyframe",
    generationId,
    notes,
  }: {
    userId: string;
    shotId: string;
    imageUrls: string[];
    kind?: FrameKind;
    generationId?: string | null;
    notes?: string | null;
  },
): Promise<string[]> {
  if (!imageUrls.length) return [];
  const rows = imageUrls.map((image_url) => ({
    user_id: userId,
    shot_id: shotId,
    image_url,
    kind,
    is_approved: false,
    notes:
      notes ??
      (generationId ? `Imported from generation ${generationId.slice(0, 8)}` : null),
  }));
  const { data, error } = await supabase.from("frames").insert(rows).select("id");
  if (error) throw error;

  if (generationId) {
    await supabase.from("generations").update({ status: "imported" }).eq("id", generationId);
    await supabase.from("shots").update({ status: "candidates" }).eq("id", shotId);
  }
  return (data ?? []).map((f) => f.id);
}
