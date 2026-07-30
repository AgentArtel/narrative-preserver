import { createFileRoute, useParams } from "@tanstack/react-router";
import { LibraryPage } from "@/components/sf/LibraryPage";

export const Route = createFileRoute("/_authenticated/projects/$projectId/elements")({
  component: () => {
    const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/elements" });
    return (
      <LibraryPage
        projectId={projectId}
        table="elements"
        title="Elements"
        subjectType="element"
        secondaryField={{ key: "element_type", label: "Type" }}
      />
    );
  },
});
