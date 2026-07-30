import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Check, Trash2 } from "lucide-react";

async function sha256Hex(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return (
    "sf_" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export function McpAccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("Claude");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys } = useQuery({
    queryKey: ["api-keys"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, label, created_at, last_used_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const raw = randomKey();
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("api_keys")
        .insert({ user_id: u.user!.id, key_hash: await sha256Hex(raw), label: label || null });
      if (error) throw error;
      return raw;
    },
    onSuccess: (raw) => {
      setPlaintext(raw);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key generated — copy it now, it is shown only once");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success("Key revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = plaintext ? `${origin}/api/mcp/${plaintext}` : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setPlaintext(null);
          setCopied(false);
        }
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>MCP access</DialogTitle>
          <DialogDescription>
            Generate a personal key so an external AI client can read and write this workspace over
            MCP. Only the hash is stored — the key is shown once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="mcp-label">Label</Label>
              <Input id="mcp-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {plaintext ? "Regenerate" : "Generate key"}
            </Button>
          </div>

          {plaintext && (
            <div className="space-y-2 rounded border border-primary/60 bg-surface p-3">
              <p className="label-caps">Connector URL</p>
              <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-foreground">
                {url}
              </pre>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy URL"}
              </Button>
              <p className="text-xs text-muted-foreground">
                The key can also be sent as an Authorization: Bearer header.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="label-caps">Existing keys</p>
            {(keys ?? []).map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-medium">{k.label ?? "Key"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    created {new Date(k.created_at).toLocaleDateString()} ·{" "}
                    {k.last_used_at
                      ? `last used ${new Date(k.last_used_at).toLocaleString()}`
                      : "never used"}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(k.id)}>
                  <Trash2 className="size-4" /> Revoke
                </Button>
              </div>
            ))}
            {keys?.length === 0 && (
              <p className="text-sm text-muted-foreground">No keys yet.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
