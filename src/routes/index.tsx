import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StoryForge — Persistent Workspace for AI Film Production" },
      {
        name: "description",
        content:
          "Generate freely. Approve intentionally. Preserve permanently. StoryForge is the memory layer around external AI generation tools.",
      },
      { property: "og:title", content: "StoryForge — Persistent Workspace for AI Film Production" },
      {
        property: "og:description",
        content:
          "Storyboard, script, reusable assets, approvals and continuity for AI-generated storytelling.",
      },
    ],
  }),
  component: Landing,
});

const PRINCIPLES = [
  {
    title: "Generate freely",
    body: "Every output from an external tool arrives as a candidate. Nothing is precious until you say so.",
    tone: "candidate",
  },
  {
    title: "Approve intentionally",
    body: "An approved frame is a production decision — marked with the accent border everywhere it appears.",
    tone: "approved",
  },
  {
    title: "Preserve permanently",
    body: "Canon records turn an approved frame into reusable project truth: a face, an outfit, a lighting rule.",
    tone: "canon",
  },
];

function Landing() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-28">
        <p className="label-caps">Visual production workspace</p>
        <h1 className="mt-4 text-5xl font-bold tracking-tight text-foreground md:text-6xl">
          StoryForge
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          The memory layer around external generation tools. Storyboard, script, reusable assets,
          approvals and continuity — compiled into clean generation context, and kept forever.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/projects">Open workspace</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>

        <div className="mt-20 grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="bg-surface p-6">
              <div
                className="mb-4 h-1 w-10 rounded-full"
                style={{
                  backgroundColor:
                    p.tone === "approved"
                      ? "var(--primary)"
                      : p.tone === "canon"
                        ? "var(--canon)"
                        : "var(--border)",
                }}
              />
              <h2 className="text-base font-semibold text-foreground">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-16 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          StoryForge does not generate media. It compiles a complete generation package for handoff
          to your tool of choice, then stores what comes back as candidate frames on the shot.
        </p>
      </div>
    </main>
  );
}
