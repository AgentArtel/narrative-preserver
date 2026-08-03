import { createFileRoute, useParams } from "@tanstack/react-router";
import { LibraryPage } from "@/components/sf/LibraryPage";

export const Route = createFileRoute("/_authenticated/projects/$projectId/locations")({
  head: () => ({
    meta: [
      { title: "Locations — StoryForge" },
      { name: "description", content: "Reusable locations, reference images and canon aspects." },
      { property: "og:title", content: "Locations — StoryForge" },
      {
        property: "og:description",
        content: "Reusable locations, reference images and canon aspects.",
      },
    ],
  }),
  component: () => {
    const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/locations" });
    return (
      <LibraryPage
        projectId={projectId}
        table="locations"
        title="Locations"
        subjectType="location"
      />
    );
  },
});
