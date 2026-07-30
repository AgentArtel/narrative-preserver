import { createFileRoute, useParams } from "@tanstack/react-router";
import { LibraryPage } from "@/components/sf/LibraryPage";

export const Route = createFileRoute("/_authenticated/projects/$projectId/cast")({
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
