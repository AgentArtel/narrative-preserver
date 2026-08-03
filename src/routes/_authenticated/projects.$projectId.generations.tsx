import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/projects/$projectId/generations")({
  head: () => ({
    meta: [
      { title: "Generations — StoryForge" },
      {
        name: "description",
        content: "Filterable history of every generation handoff and imported result.",
      },
      { property: "og:title", content: "Generations — StoryForge" },
      {
        property: "og:description",
        content: "Filterable history of every generation handoff and imported result.",
      },
    ],
  }),
  component: GenerationsPage,
});

function GenerationsPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/generations" });
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["generations", projectId],
    queryFn: async () => {
      const { data: seqs } = await supabase
        .from("sequences")
        .select("scenes(id)")
        .eq("project_id", projectId);
      const sceneIds = (seqs ?? []).flatMap((s) => (s.scenes ?? []).map((sc) => sc.id));
      if (!sceneIds.length) return [];
      const { data: shots } = await supabase.from("shots").select("id").in("scene_id", sceneIds);
      const shotIds = (shots ?? []).map((s) => s.id);
      if (!shotIds.length) return [];
      const { data, error } = await supabase
        .from("generations")
        .select("*, shots(id, shot_number)")
        .in("shot_id", shotIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (data ?? []).filter(
    (g) =>
      (status === "all" || g.status === status) &&
      (!q ||
        [g.provider, g.tool, g.model, g.shots?.shot_number]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase())),
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Generations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every handoff compiled from this project, and what came back.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Filter by provider, model, shot…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="handed_off">handed_off</SelectItem>
            <SelectItem value="imported">imported</SelectItem>
            <SelectItem value="rejected">rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shot</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell>
                  <Link
                    to="/projects/$projectId/shot/$shotId"
                    params={{ projectId, shotId: g.shot_id }}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {g.shots?.shot_number}
                  </Link>
                </TableCell>
                <TableCell className="text-sm">{g.provider}</TableCell>
                <TableCell className="text-sm">{g.tool ?? "—"}</TableCell>
                <TableCell className="text-sm">{g.model ?? "—"}</TableCell>
                <TableCell className="label-caps">{g.status}</TableCell>
                <TableCell className="text-sm tabular-nums">{g.cost_credits ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(g.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-sm text-muted-foreground">
                  No generations match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
