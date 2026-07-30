import { cn } from "@/lib/utils";
import { statusColor, type ShotStatus } from "@/lib/storyforge";

export function StatusDot({ status, className }: { status: ShotStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: statusColor[status] }}
    />
  );
}

export function StatusBadge({ status, className }: { status: ShotStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        className,
      )}
      style={{
        color: statusColor[status],
        borderColor: `color-mix(in oklab, ${statusColor[status]} 45%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${statusColor[status]} 12%, transparent)`,
      }}
    >
      <StatusDot status={status} />
      {status}
    </span>
  );
}

export function Chip({
  children,
  tone = "default",
  title,
}: {
  children: React.ReactNode;
  tone?: "default" | "canon" | "accent";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px]",
        tone === "default" && "border-border bg-surface-raised text-muted-foreground",
        tone === "accent" && "border-primary/50 bg-primary/10 text-primary",
        tone === "canon" && "border-canon/50 bg-canon/10 text-canon",
      )}
    >
      {children}
    </span>
  );
}

export function CanonMarker({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span
      title={`${count} canon record${count === 1 ? "" : "s"} sourced from this frame`}
      className="inline-flex items-center gap-1 rounded-sm bg-canon px-1 py-px text-[10px] font-bold tracking-wide text-canon-foreground uppercase"
    >
      canon {count}
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="label-caps mb-2">{children}</div>;
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
