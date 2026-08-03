import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { buildGenerationPackage, type BuiltPackage } from "@/lib/generation-package";
import { importGenerationResults } from "@/lib/import-results";

import { toast } from "sonner";
import { Copy, Check, Upload } from "lucide-react";

export function GenerationPackageDialog({
  shotId,
  open,
  onOpenChange,
}: {
  shotId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [pkg, setPkg] = useState<BuiltPackage | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [tool, setTool] = useState("Higgsfield");
  const [model, setModel] = useState("");
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);

  const compile = useMutation({
    mutationFn: async () => {
      const built = await buildGenerationPackage(shotId);
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("generations")
        .insert({
          user_id: u.user!.id,
          shot_id: shotId,
          provider: "higgsfield",
          tool,
          model: model || null,
          prompt: built.text,
          negative_prompt: built.negativePrompt,
          reference_summary: built.referenceSummary as never,
          status: "handed_off",
        })
        .select()
        .single();
      if (error) throw error;
      return { built, id: data.id };
    },
    onSuccess: ({ built, id }) => {
      setPkg(built);
      setGenerationId(id);
      qc.invalidateQueries();
      toast.success("Package compiled — handoff recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function importResults(files: FileList | null) {
    if (!files?.length || !generationId) return;
    setUploading(true);
    try {
      await importGenerationResults({ shotId, generationId, files });
      qc.invalidateQueries();
      toast.success("Candidates imported");
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setPkg(null);
    setGenerationId(null);
    setCopied(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generation package</DialogTitle>
          <DialogDescription>
            Compiles scene, shot, camera, cast state, location, elements, look and canon into one
            copyable block. StoryForge does not call any provider — you hand this off yourself.
          </DialogDescription>
        </DialogHeader>

        {!pkg ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gp-tool">Tool</Label>
                <Input id="gp-tool" value={tool} onChange={(e) => setTool(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gp-model">Model (optional)</Label>
                <Input
                  id="gp-model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="soul / turbo / …"
                />
              </div>
            </div>
            <Button onClick={() => compile.mutate()} disabled={compile.isPending}>
              {compile.isPending ? "Compiling…" : "Compile package"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <pre className="max-h-80 overflow-auto rounded border border-border bg-background p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
              {pkg.text}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(pkg.text);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy package"}
              </Button>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => importResults(e.target.files)}
                />
                <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                  <Upload className="size-4" />
                  {uploading ? "Importing…" : "Import result"}
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Handoff recorded as generation {generationId?.slice(0, 8)}. Imported images land as
              candidate frames on this shot.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
