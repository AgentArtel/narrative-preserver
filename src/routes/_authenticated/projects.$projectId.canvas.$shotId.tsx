import { lazy, Suspense } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";

// Lazy: the canvas pulls in React Flow (~180 kB). It shares the chunk with the
// dependency inspector, and neither belongs in the eager route bundles.
const ShotCanvas = lazy(() =>
  import("@/components/sf/ShotCanvas").then((m) => ({ default: m.ShotCanvas })),
);

export const Route = createFileRoute("/_authenticated/projects/$projectId/canvas/$shotId")({
  head: () => ({
    meta: [
      { title: "Shot Canvas — StoryForge" },
      {
        name: "description",
        content:
          "Wire environment, souls, elements and look into a shot — the payload as dataflow.",
      },
      { property: "og:title", content: "Shot Canvas — StoryForge" },
      {
        property: "og:description",
        content:
          "Wire environment, souls, elements and look into a shot — the payload as dataflow.",
      },
    ],
  }),
  component: CanvasPage,
});

function CanvasPage() {
  const { projectId, shotId } = useParams({
    from: "/_authenticated/projects/$projectId/canvas/$shotId",
  });
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading canvas…</div>}>
      <ShotCanvas projectId={projectId} shotId={shotId} />
    </Suspense>
  );
}
