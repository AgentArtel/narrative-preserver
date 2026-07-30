import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/lib/upload";

/**
 * Uploads generation results as candidate frames on a shot, marks the
 * generation imported and moves the shot into the "candidates" state.
 */
export async function importGenerationResults({
  shotId,
  generationId,
  files,
}: {
  shotId: string;
  generationId: string;
  files: FileList | File[];
}): Promise<number> {
  const list = Array.from(files);
  if (!list.length) return 0;

  const { data: u } = await supabase.auth.getUser();
  for (const file of list) {
    const url = await uploadImage(file);
    const { error } = await supabase.from("frames").insert({
      user_id: u.user!.id,
      shot_id: shotId,
      image_url: url,
      kind: "keyframe",
      is_approved: false,
      notes: `Imported from generation ${generationId.slice(0, 8)}`,
    });
    if (error) throw error;
  }

  await supabase.from("generations").update({ status: "imported" }).eq("id", generationId);
  await supabase.from("shots").update({ status: "candidates" }).eq("id", shotId);
  return list.length;
}
