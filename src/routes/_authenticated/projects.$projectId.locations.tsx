import { createFileRoute, useParams } from "@tanstack/react-router";
import { LibraryPage } from "@/components/sf/LibraryPage";

export const Route = createFileRoute("/_authenticated/projects/$projectId/locations")({
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
