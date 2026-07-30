import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Sparkles, LogOut, Plug } from "lucide-react";
import { McpAccessDialog } from "@/components/sf/McpAccessDialog";


export const Route = createFileRoute("/_authenticated/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("projects")
        .insert({ title, description, user_id: u.user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (p) => {
      setOpen(false);
      setTitle("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seed = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("seed_demo_project");
      if (error) throw error;
      return data as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      navigate({ to: "/projects/$projectId", params: { projectId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link to="/" className="label-caps hover:text-foreground">
          StoryForge
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMcpOpen(true)}>
            <Plug className="size-4" /> MCP access
          </Button>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </header>
      <McpAccessDialog open={mcpOpen} onOpenChange={setMcpOpen} />


      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate freely. Approve intentionally. Preserve permanently.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
              <Sparkles className="size-4" /> Load "Ashfall" demo
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> New project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New project</DialogTitle>
                  <DialogDescription>
                    A project holds sequences, scenes, shots and all reusable canon.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="p-title">Title</Label>
                    <Input
                      id="p-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ashfall"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p-desc">Description</Label>
                    <Textarea
                      id="p-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => create.mutate()}
                    disabled={!title.trim() || create.isPending}
                  >
                    Create project
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {projects?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one, or load the Ashfall demo to see a full slice.
            </p>
          )}
          {projects?.map((p) => (
            <Link
              key={p.id}
              to="/projects/$projectId"
              params={{ projectId: p.id }}
              className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/60"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{p.title}</h2>
                <span className="label-caps">{p.status}</span>
              </div>
              {p.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
