import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionLabel } from "@/components/sf/primitives";
import { asPalette, STYLE_LOOK_BOUNDARY } from "@/lib/storyforge";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/projects/$projectId/looks")({
  head: () => ({
    meta: [
      { title: "Looks — StoryForge" },
      { name: "description", content: "Palettes, prompt fragments and negative constraints per project look." },
      { property: "og:title", content: "Looks — StoryForge" },
      { property: "og:description", content: "Palettes, prompt fragments and negative constraints per project look." },
    ],
  }),
  component: LooksPage,
});

function LooksPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/looks" });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [palette, setPalette] = useState("");
  const [fragments, setFragments] = useState("");
  const [negatives, setNegatives] = useState("");

  const { data: looks } = useQuery({
    queryKey: ["looks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("looks")
        .select("*")
        .eq("project_id", projectId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  async function create() {
    if (!name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const paletteJson = palette
      .split("\n")
      .map((line) => line.split(/\s+#/))
      .filter((p) => p.length === 2)
      .map(([n, hex]) => ({ name: n.trim(), hex: `#${hex.trim()}` }));
    const { error } = await supabase.from("looks").insert({
      user_id: u.user!.id,
      project_id: projectId,
      name,
      description,
      palette: paletteJson,
      prompt_fragments: fragments.split(",").map((s) => s.trim()).filter(Boolean),
      negative_constraints: negatives.split(",").map((s) => s.trim()).filter(Boolean),
    });
    if (error) return toast.error(error.message);
    setOpen(false);
    setName("");
    setDescription("");
    setPalette("");
    setFragments("");
    setNegatives("");
    qc.invalidateQueries();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Looks</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New look
        </Button>
      </div>
      <p className="mt-2 max-w-3xl text-xs text-muted-foreground/80">{STYLE_LOOK_BOUNDARY}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {(looks ?? []).map((l) => (
          <article key={l.id} className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold">{l.name}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{l.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {asPalette(l.palette).map((p) => (
                <div key={p.hex} className="flex items-center gap-1.5">
                  <span
                    className="size-5 rounded border border-border"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {p.name} {p.hex}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-xs">
              <div>
                <SectionLabel>Prompt fragments</SectionLabel>
                <p className="text-muted-foreground">
                  {(l.prompt_fragments ?? []).join(" · ") || "—"}
                </p>
              </div>
              <div className="pt-2">
                <SectionLabel>Negative constraints</SectionLabel>
                <p className="text-muted-foreground">
                  {(l.negative_constraints ?? []).join(" · ") || "—"}
                </p>
              </div>
            </div>
          </article>
        ))}
        {(looks ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No looks yet.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New look</DialogTitle>
            <DialogDescription>
              A look is reusable project truth: palette, prompt fragments and negative constraints.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="look-name">Name</Label>
              <Input id="look-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="look-desc">Description</Label>
              <Textarea
                id="look-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="look-palette">Palette (one per line: Name #HEX)</Label>
              <Textarea
                id="look-palette"
                rows={4}
                placeholder={"Moonlight Blue #4A6FA5\nAsh Gray #55575A"}
                value={palette}
                onChange={(e) => setPalette(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="look-frag">Prompt fragments (comma separated)</Label>
              <Input
                id="look-frag"
                value={fragments}
                onChange={(e) => setFragments(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="look-neg">Negative constraints (comma separated)</Label>
              <Input
                id="look-neg"
                value={negatives}
                onChange={(e) => setNegatives(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
