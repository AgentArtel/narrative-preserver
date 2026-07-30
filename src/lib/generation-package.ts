import { supabase } from "@/integrations/supabase/client";
import { buildGenerationPackageWith, type BuiltPackage } from "./generation-package-core";

export type { BuiltPackage };

export async function buildGenerationPackage(shotId: string): Promise<BuiltPackage> {
  return buildGenerationPackageWith(supabase, shotId);
}
