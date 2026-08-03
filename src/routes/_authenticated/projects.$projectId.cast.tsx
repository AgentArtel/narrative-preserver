import { createFileRoute, useParams } from "@tanstack/react-router";
import { LibraryPage } from "@/components/sf/LibraryPage";

export const Route = createFileRoute("/_authenticated/projects/$projectId/cast")({
  head: () => ({
    meta: [
      { title: "Cast — StoryForge" },
      { name: "description", content: "Reusable characters, reference images and canon aspects." },
      { property: "og:title", content: "Cast — StoryForge" },
      {
        property: "og:description",
        content: "Reusable characters, reference images and canon aspects.",
      },
    ],
  }),
  component: () => {
    const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/cast" });
    return (
      <LibraryPage
        projectId={projectId}
        table="characters"
        title="Cast"
        subjectType="character"
        secondaryField={{ key: "role", label: "Role" }}
      />
    );
  },
});
