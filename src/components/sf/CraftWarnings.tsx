import { useState } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CraftWarning } from "@/lib/validation";

/**
 * Validators warn; they never block. Amber, inline and dismissible — a
 * warning that stops work gets switched off, a warning that informs it gets
 * read. Never rendered into prompt text.
 */
export function CraftWarnings({
  warnings,
  className,
}: {
  warnings: CraftWarning[];
  className?: string;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const shown = warnings.filter((w) => !dismissed.includes(w.code + w.message));
  if (!shown.length) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {shown.map((w) => {
        const notVerified = w.level === "not_verified";
        return (
          <div
            key={w.code + w.message}
            className={cn(
              "flex gap-2 rounded border px-2.5 py-2 text-[11px] leading-relaxed",
              notVerified
                ? "border-border bg-surface text-muted-foreground"
                : "border-primary/40 bg-primary/5 text-foreground",
            )}
          >
            {notVerified ? (
              <HelpCircle className="mt-px size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-primary" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{w.message}</p>
              {w.reason && <p className="text-muted-foreground">{w.reason}</p>}
              {w.suggestion && (
                <p className="mt-0.5 font-mono text-[10px] text-primary">{w.suggestion}</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss this hint"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setDismissed((d) => [...d, w.code + w.message])}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
