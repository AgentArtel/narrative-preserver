import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionLabel, Chip } from "@/components/sf/primitives";
import { supabase } from "@/integrations/supabase/client";
import {
  DEPTH_PLANES,
  LOCATION_LOCKS,
  REVERSE_VERIFY_HINT,
  asDepthPlanes,
  locationLockState,
  type DepthPlane,
  type DepthPlaneName,
  type LocationLockSource,
} from "@/lib/craft";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type LocationLockRow = LocationLockSource & {
  id: string;
  reverse_verification_note?: string | null;
  motion_test_passed_at?: string | null;
  motion_test_note?: string | null;
};

/** Five small chips: filled when the lock is present. Reverse verification is separate. */
export function LocationLockChips({
  location,
  className,
}: {
  location: LocationLockSource | null | undefined;
  className?: string;
}) {
  const state = locationLockState(location);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {LOCATION_LOCKS.map((l) => (
        <span
          key={l.key}
          title={l.label}
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] tracking-wide uppercase",
            state.filled[l.key]
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-surface-raised text-muted-foreground",
          )}
        >
          {l.label}
        </span>
      ))}
      <Chip tone={state.plateLocked ? "canon" : "default"}>
        {state.plateLocked
          ? "plate locked"
          : state.reverseVerified
            ? "reverse verified"
            : "reverse unverified"}
      </Chip>
    </div>
  );
}

export function LocationLocks({ location }: { location: LocationLockRow }) {
  const qc = useQueryClient();
  const [light, setLight] = useState("");
  const [materials, setMaterials] = useState("");
  const [planes, setPlanes] = useState<DepthPlane[]>([]);
  const [note, setNote] = useState("");
  const [motionNote, setMotionNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLight(location.light_logic ?? "");
    setMaterials(location.materials ?? "");
    setPlanes(asDepthPlanes(location.depth_planes));
    setNote(location.reverse_verification_note ?? "");
    setMotionNote(location.motion_test_note ?? "");
  }, [
    location.id,
    location.light_logic,
    location.materials,
    location.depth_planes,
    location.reverse_verification_note,
    location.motion_test_note,
  ]);

  async function update(patch: Record<string, unknown>, message: string) {
    setSaving(true);
    const { error } = await supabase
      .from("locations")
      .update(patch as never)
      .eq("id", location.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries();
    toast.success(message);
  }

  const state = locationLockState({
    ...location,
    light_logic: light,
    materials,
    depth_planes: planes,
  });

  return (
    <div className="space-y-3">
      <SectionLabel>Plate locks</SectionLabel>
      <LocationLockChips
        location={{ ...location, light_logic: light, materials, depth_planes: planes }}
      />

      <div className="space-y-1.5">
        <span className="label-caps">Light logic</span>
        <Textarea
          rows={2}
          className="text-xs"
          placeholder="Moonlight through the collapsed roof, falling on the subject's camera-left side."
          value={light}
          onChange={(e) => setLight(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Where the light comes from, and which side of the subject it falls on.
        </p>
      </div>

      <div className="space-y-1.5">
        <span className="label-caps">Materials</span>
        <Textarea
          rows={2}
          className="text-xs"
          placeholder="Wet limestone, oxidised bronze, scorched oak."
          value={materials}
          onChange={(e) => setMaterials(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <span className="label-caps">Depth planes</span>
        {planes.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={p.plane}
              onValueChange={(v) =>
                setPlanes((ps) =>
                  ps.map((x, j) => (j === i ? { ...x, plane: v as DepthPlaneName } : x)),
                )
              }
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPTH_PLANES.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs"
              placeholder="What sits in this plane"
              value={p.contents}
              onChange={(e) =>
                setPlanes((ps) =>
                  ps.map((x, j) => (j === i ? { ...x, contents: e.target.value } : x)),
                )
              }
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => setPlanes((ps) => ps.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setPlanes((ps) => [...ps, { plane: "foreground", contents: "" }])}
        >
          <Plus className="size-3.5" /> Add plane
        </Button>
      </div>

      <Button
        size="sm"
        disabled={saving}
        onClick={() =>
          update(
            {
              light_logic: light.trim() || null,
              materials: materials.trim() || null,
              depth_planes: planes.filter((p) => p.contents.trim()) as never,
            },
            "Plate locks saved",
          )
        }
      >
        Save plate locks
      </Button>

      <div className="space-y-1.5 border-t border-border pt-3">
        <span className="label-caps">Reverse verification</span>
        <p className="text-xs text-muted-foreground">{REVERSE_VERIFY_HINT}</p>
        <Input
          className="h-8 text-xs"
          placeholder="What the reverse confirmed"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() =>
              update(
                {
                  reverse_verified_at: new Date().toISOString(),
                  reverse_verification_note: note.trim() || null,
                },
                "Reverse verified",
              )
            }
          >
            <Check className="size-3.5" /> Mark reverse verified
          </Button>
          {location.reverse_verified_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(location.reverse_verified_at).toLocaleString()}
            </span>
          )}
        </div>
        {!state.allFilled && (
          <p className="text-xs text-muted-foreground">
            All five locks must be filled before this plate counts as locked.
          </p>
        )}
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <span className="label-caps">Motion test</span>
        <p className="text-xs text-muted-foreground">
          The empty 480p motion test that proves the plate holds under motion, before any character
          is put in it.
        </p>
        <Input
          className="h-8 text-xs"
          placeholder="What the motion test showed"
          value={motionNote}
          onChange={(e) => setMotionNote(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() =>
              update(
                {
                  motion_test_passed_at: new Date().toISOString(),
                  motion_test_note: motionNote.trim() || null,
                },
                "Motion test passed",
              )
            }
          >
            <Check className="size-3.5" /> Mark motion test passed
          </Button>
          {location.motion_test_passed_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(location.motion_test_passed_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
