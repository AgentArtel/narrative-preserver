import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeVocab, type CameraMoveRow, type RiskClassRow } from "@/lib/craft";

/**
 * Global seed rows plus this project's override rows, merged by slug.
 * A project row with the same slug wins; hidden rows drop out.
 */
export function useVocabularies(projectId: string) {
  return useQuery({
    queryKey: ["vocabularies", projectId],
    queryFn: async () => {
      const scope = `project_id.is.null,project_id.eq.${projectId}`;
      const [moves, classes] = await Promise.all([
        supabase.from("camera_moves").select("*").or(scope),
        supabase.from("risk_classes").select("*").or(scope),
      ]);
      if (moves.error) throw moves.error;
      if (classes.error) throw classes.error;
      return {
        moves: mergeVocab((moves.data ?? []) as CameraMoveRow[]),
        classes: mergeVocab((classes.data ?? []) as RiskClassRow[]),
        rawMoves: (moves.data ?? []) as CameraMoveRow[],
        rawClasses: (classes.data ?? []) as RiskClassRow[],
      };
    },
  });
}
