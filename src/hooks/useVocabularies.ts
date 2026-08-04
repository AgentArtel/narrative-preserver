import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mergeVocab, type CameraMoveRow, type RiskClassRow, type VocabRow } from "@/lib/craft";
import type { ModelRateRow, SheetChecklistRow } from "@/lib/validation";

/**
 * Global seed rows plus this project's override rows, merged by slug.
 * A project row with the same slug wins; hidden rows drop out.
 *
 * Phase 3 adds three vocabularies on the same pattern: the sheet checklist,
 * the model rate card and approval purposes.
 */
export function useVocabularies(projectId: string) {
  return useQuery({
    queryKey: ["vocabularies", projectId],
    queryFn: async () => {
      const scope = `project_id.is.null,project_id.eq.${projectId}`;
      const [moves, classes, sheet, rates, purposes] = await Promise.all([
        supabase.from("camera_moves").select("*").or(scope),
        supabase.from("risk_classes").select("*").or(scope),
        supabase.from("sheet_checklist_items").select("*").or(scope),
        supabase.from("model_rates").select("*").or(scope),
        supabase.from("approval_purposes").select("*").or(scope),
      ]);
      if (moves.error) throw moves.error;
      if (classes.error) throw classes.error;
      if (sheet.error) throw sheet.error;
      if (rates.error) throw rates.error;
      if (purposes.error) throw purposes.error;
      return {
        moves: mergeVocab((moves.data ?? []) as CameraMoveRow[]),
        classes: mergeVocab((classes.data ?? []) as RiskClassRow[]),
        sheetItems: mergeVocab((sheet.data ?? []) as SheetChecklistRow[]),
        rates: mergeVocab((rates.data ?? []) as ModelRateRow[]),
        purposes: mergeVocab((purposes.data ?? []) as VocabRow[]),
        rawMoves: (moves.data ?? []) as CameraMoveRow[],
        rawClasses: (classes.data ?? []) as RiskClassRow[],
      };
    },
  });
}

