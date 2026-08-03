import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionLabel } from "@/components/sf/primitives";
import { supabase } from "@/integrations/supabase/client";
import { asLandmarks, SCREEN_SIDES, type Landmark, type ScreenSide } from "@/lib/storyforge";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

export function LocationGeography({
  location,
}: {
  location: { id: string; landmarks?: unknown; blocking_anchor?: string | null };
}) {
  const qc = useQueryClient();
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [anchor, setAnchor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLandmarks(asLandmarks(location.landmarks));
    setAnchor(location.blocking_anchor ?? "");
  }, [location.id, location.landmarks, location.blocking_anchor]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("locations")
      .update({
        landmarks: landmarks.filter((l) => l.name.trim()) as never,
        blocking_anchor: anchor.trim() || null,
      })
      .eq("id", location.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
    toast.success("Geography saved");
  }

  return (
    <div>
      <SectionLabel>Geography</SectionLabel>
      <p className="mb-2 text-xs text-muted-foreground">
        Screen-left is a fact about the camera and breaks the moment it turns. Name landmarks and
        one immovable blocking anchor so positions survive the cut.
      </p>

      <div className="space-y-2">
        {landmarks.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              className="h-8 text-xs"
              placeholder="Landmark name"
              value={l.name}
              onChange={(e) =>
                setLandmarks((ls) =>
                  ls.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <Select
              value={l.side}
              onValueChange={(v) =>
                setLandmarks((ls) =>
                  ls.map((x, j) => (j === i ? { ...x, side: v as ScreenSide } : x)),
                )
              }
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCREEN_SIDES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => setLandmarks((ls) => ls.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLandmarks((ls) => [...ls, { name: "", side: "centre" }])}
        >
          <Plus className="size-3.5" /> Add landmark
        </Button>
      </div>

      <div className="mt-3 space-y-1.5">
        <span className="label-caps">Blocking anchor</span>
        <Input
          className="h-8 text-xs"
          placeholder="The plinth at the crossing"
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          One large immovable object all character positions are measured against — never a
          character, never a hand prop.
        </p>
      </div>

      <Button size="sm" className="mt-3" onClick={save} disabled={saving}>
        Save geography
      </Button>
    </div>
  );
}
