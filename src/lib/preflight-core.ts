/**
 * Preflight: run before a roll. It reports; it never gates the roll.
 *
 * Parameterized by client so the browser and the MCP tools produce identical
 * findings. Risk and warning text produced here is app-only and must never be
 * emitted into a generation package.
 */

import type { DB } from "./generation-package-core";
import { fetchProviderElements } from "./generation-package-core";
import { asRiskTail, locationLockState, mergeVocab, type CameraMoveRow } from "./craft";
import {
  checkLocationReady,
  lintShotLine,
  quoteCost,
  riskSplitWarning,
  type CraftWarning,
  type GenerationTier,
  type ModelRateRow,
} from "./validation";
import { asLandmarks, type Camera } from "./storyforge";

export type PreflightInput = {
  projectId?: string | null;
  shotIds?: string[];
  tier?: GenerationTier;
  rateSlug?: string | null;
  seconds?: number | null;
};

export type PreflightShotFinding = {
  shot_id: string;
  shot_number: string;
  status: string;
  duration_seconds: number | null;
  warnings: CraftWarning[];
};

export async function runPreflight(db: DB, userId: string, input: PreflightInput) {
  const tier: GenerationTier = input.tier ?? "previs";

  let shotQuery = db
    .from("shots")
    .select(
      "id, shot_number, status, description, duration_seconds, camera, risk_tail, location_id, scene_id, scenes(id, sequence_id, sequences(id, project_id))",
    )
    .eq("user_id", userId);
  if (input.shotIds?.length) shotQuery = shotQuery.in("id", input.shotIds);
  const { data: allShots, error } = await shotQuery;
  if (error) throw new Error(error.message);

  type ShotRow = NonNullable<typeof allShots>[number];
  const projectOf = (s: ShotRow) => s.scenes?.sequences?.project_id ?? null;
  const shots = (allShots ?? []).filter((s) =>
    input.projectId ? projectOf(s) === input.projectId : true,
  );
  const projectId = input.projectId ?? (shots.length ? projectOf(shots[0]) : null);
  if (!projectId) {
    return {
      project_id: null,
      shots: [] as PreflightShotFinding[],
      unresolved_elements: [],
      risk_split_shots: [],
      location_findings: [],
      cost: quoteCost([], tier, input.seconds ?? 0, input.rateSlug),
      note: "No shots matched — nothing to preflight.",
    };
  }

  const scope = `project_id.is.null,project_id.eq.${projectId}`;
  const [moves, rates, locations, elements, characters] = await Promise.all([
    db.from("camera_moves").select("*").or(scope),
    db.from("model_rates").select("*").or(scope),
    db.from("locations").select("*").eq("project_id", projectId).eq("user_id", userId),
    db
      .from("elements")
      .select("id, name")
      .eq("project_id", projectId)
      .eq("user_id", userId),
    db
      .from("characters")
      .select("id, name")
      .eq("project_id", projectId)
      .eq("user_id", userId),
  ]);

  const moveRows = mergeVocab((moves.data ?? []) as unknown as CameraMoveRow[]);
  const rateRows = mergeVocab((rates.data ?? []) as unknown as ModelRateRow[]);
  const locById = new Map((locations.data ?? []).map((l) => [l.id, l]));

  // Unresolved Elements: assets with no active provider identity. Reuses the
  // one provider-identity query the generation package already uses.
  const assets = [
    ...(elements.data ?? []).map((e) => ({ ...e, kind: "element" })),
    ...(characters.data ?? []).map((c) => ({ ...c, kind: "character" })),
    ...(locations.data ?? []).map((l) => ({ id: l.id, name: l.name, kind: "location" })),
  ];
  const nameById = new Map(assets.map((a) => [a.id, a.name]));
  const identities = await fetchProviderElements(
    db,
    assets.map((a) => a.id),
    (id) => nameById.get(id) ?? "Unknown",
  );
  const resolved = new Set(identities.map((i) => i.owner_id));
  const unresolved = assets
    .filter((a) => !resolved.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind }));

  const shotFindings: PreflightShotFinding[] = [];
  const riskSplit: { shot_id: string; shot_number: string; classes: number }[] = [];

  for (const s of shots) {
    const loc = s.location_id ? locById.get(s.location_id) : null;
    const warnings: CraftWarning[] = lintShotLine({
      line: s.description,
      movement: ((s.camera ?? {}) as Camera).movement,
      moves: moveRows,
      landmarks: asLandmarks((loc as { landmarks?: unknown } | null)?.landmarks),
      blockingAnchor: (loc as { blocking_anchor?: string | null } | null)?.blocking_anchor ?? null,
      locationName: (loc as { name?: string } | null)?.name ?? null,
    });
    const split = riskSplitWarning(asRiskTail(s.risk_tail));
    if (split) {
      warnings.push(split);
      riskSplit.push({
        shot_id: s.id,
        shot_number: s.shot_number,
        classes: new Set(
          asRiskTail(s.risk_tail)
            .map((r) => r.class)
            .filter(Boolean),
        ).size,
      });
    }
    shotFindings.push({
      shot_id: s.id,
      shot_number: s.shot_number,
      status: s.status,
      duration_seconds: s.duration_seconds,
      warnings,
    });
  }

  const usedLocationIds = new Set(shots.map((s) => s.location_id).filter(Boolean) as string[]);
  const locationFindings = [...locById.values()]
    .filter((l) => !usedLocationIds.size || usedLocationIds.has(l.id))
    .map((l) => {
      const readiness = checkLocationReady(l as never, l.name);
      return {
        location_id: l.id,
        name: l.name,
        lock_state: locationLockState(l as never),
        missing_locks: readiness.missing_locks,
        usable_for: readiness.usable_for,
        not_usable_for: readiness.not_usable_for,
        warnings: readiness.warnings,
      };
    })
    .filter((f) => f.missing_locks.length || !f.lock_state.reverseVerified);

  const seconds =
    input.seconds ??
    shots.reduce((sum, s) => sum + (s.duration_seconds ? Number(s.duration_seconds) : 0), 0);

  return {
    project_id: projectId,
    shots: shotFindings,
    unresolved_elements: unresolved,
    risk_split_shots: riskSplit,
    location_findings: locationFindings,
    cost: quoteCost(rateRows, tier, seconds, input.rateSlug),
    note: "Preflight reports; it does not gate the roll.",
  };
}
