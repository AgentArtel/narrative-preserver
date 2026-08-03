import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GATES, PROJECT_CODE_HINT, isValidProjectCode } from "@/lib/craft";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — StoryForge" },
      { name: "description", content: "Persistent visual-production workspace for AI-generated storytelling." },
      { property: "og:title", content: "Project — StoryForge" },
      { property: "og:description", content: "Persistent visual-production workspace for AI-generated storytelling." },
    ],
  }),
  component: ProjectLayout,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

export function useProject() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId" });
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

const NAV: { to: string; label: string; exact?: boolean }[] = [
  { to: "/projects/$projectId", label: "Home", exact: true },
  { to: "/projects/$projectId/cast", label: "Cast" },
  { to: "/projects/$projectId/locations", label: "Locations" },
  { to: "/projects/$projectId/elements", label: "Elements" },
  { to: "/projects/$projectId/looks", label: "Looks" },
  { to: "/projects/$projectId/generations", label: "Generations" },
];

function ProjectLayout() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId" });
  const { data: project } = useProject();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/projects" className="label-caps hover:text-foreground">
            StoryForge
          </Link>
          <span className="text-sm font-semibold tracking-tight">
            {project?.title ?? "Loading…"}
          </span>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.label}
                to={n.to}
                params={{ projectId }}
                activeOptions={{ exact: n.exact ?? false }}
                className="rounded px-2.5 py-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
                activeProps={{ className: "bg-surface-raised text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={signOut}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
