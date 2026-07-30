import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/lib/upload";
import { insertFramesFromUrls } from "@/lib/frames-core";

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
  const urls: string[] = [];
  for (const file of list) urls.push(await uploadImage(file));

  await insertFramesFromUrls(supabase, {
    userId: u.user!.id,
    shotId,
    imageUrls: urls,
    kind: "keyframe",
    generationId,
  });
  return list.length;
}
