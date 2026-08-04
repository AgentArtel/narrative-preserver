/**
 * Phase 3 validation layer.
 *
 * Every rule is written exactly once here and called from both the MCP tools
 * and the editors — a rule that drifts between the two is worse than no rule.
 *
 * Validators warn; they never block. The single exception in the app is edit
 * lineage (`editLineageBlock`), because that damage is invisible until it is
 * too late to undo.
 *
 * A missing Phase 2 field is reported as **not verified**, never as a pass.
 */

import {
  LOCATION_LOCKS,
  UNDECLARED_MOVE_HINT,
  TIME_MOVE_HINT,
  locationLockState,
  matchMove,
  normalizeToken,
  parseMovementTokens,
  type CameraMoveRow,
  type LocationLockSource,
  type RiskEntry,
  type VocabRow,
} from "./craft";
import type { Landmark } from "./storyforge";

/** The camera key the validator reads. Named in every warning it emits. */
export const MOVEMENT_KEY = "camera.movement";

export type WarningLevel = "warning" | "not_verified";

export type CraftWarning = {
  code: string;
  level: WarningLevel;
  message: string;
  reason?: string;
  suggestion?: string;
};

function warn(
  code: string,
  message: string,
  reason?: string,
  suggestion?: string,
  level: WarningLevel = "warning",
): CraftWarning {
  return { code, level, message, reason, suggestion };
}

export function warningText(w: CraftWarning): string {
  return [w.message, w.reason, w.suggestion && `Try: ${w.suggestion}`].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------- shot line */

export type ShotLineInput = {
  /** The shot line as written — usually the shot description. */
  line: string | null | undefined;
  /** The declared move, read from `camera.movement`. */
  movement?: string | null;
  moves: CameraMoveRow[];
  landmarks?: Landmark[];
  blockingAnchor?: string | null;
  locationName?: string | null;
};

function firstWords(line: string, n: number): string {
  return line.trim().split(/\s+/).slice(0, n).join(" ");
}

function mentionsMove(text: string, move: CameraMoveRow): boolean {
  const hay = normalizeToken(text);
  return hay.includes(normalizeToken(move.slug)) || hay.includes(normalizeToken(move.label));
}

/**
 * Shot-line grammar: the camera is declared in the first three words, and at
 * least one named landmark is referenced.
 */
export function lintShotLine(input: ShotLineInput): CraftWarning[] {
  const out: CraftWarning[] = [];
  const line = (input.line ?? "").trim();
  const moves = input.moves ?? [];

  if (!line) {
    out.push(
      warn("shot_line_empty", "This shot has no line yet.", "There is nothing to lint until it does."),
    );
  }

  if (!moves.length) {
    out.push(
      warn(
        "move_vocabulary_missing",
        "Not verified: this project has no camera-move vocabulary.",
        "Without the vocabulary table the move cannot be checked at all.",
        undefined,
        "not_verified",
      ),
    );
  }

  const tokens = parseMovementTokens(input.movement);
  const matched = tokens.map((t) => ({ token: t, move: matchMove(t, moves) }));

  if (!tokens.length) {
    out.push(
      warn(
        "move_undeclared",
        `No camera move declared — expected \`${MOVEMENT_KEY}\`.`,
        UNDECLARED_MOVE_HINT,
        "push, close slow-mo",
      ),
    );
  } else if (moves.length) {
    for (const m of matched) {
      if (!m.move) {
        out.push(
          warn(
            "move_unknown",
            `Camera move "${m.token}" is not in this project's camera vocabulary.`,
            `An unknown move renders as a slow push-in. Allowed: ${moves.map((x) => x.label).join(", ")}.`,
            moves[0]?.label,
          ),
        );
      }
    }
    const known = matched.map((m) => m.move).filter(Boolean) as CameraMoveRow[];
    if (known.length && known.every((m) => m.is_time_move)) {
      out.push(
        warn(
          "time_move_bare",
          `A time move is standing bare in \`${MOVEMENT_KEY}\`.`,
          TIME_MOVE_HINT,
          `push, ${known[0].label.toLowerCase()}`,
        ),
      );
    }
  }

  // Declared in the first three words of the line.
  if (line && moves.length) {
    const opening = firstWords(line, 3);
    const declared = moves.some((m) => mentionsMove(opening, m));
    if (!declared) {
      out.push(
        warn(
          "move_not_in_opening",
          "The camera move is not declared in the first three words of the shot line.",
          "A move announced late reads as description; the renderer keys off the opening and defaults to a slow push-in.",
          `${(matched[0]?.move?.label ?? moves[0]?.label ?? "PUSH").toUpperCase()} ${firstWords(line, 3)}…`,
        ),
      );
    }
  }

  // At least one named landmark from the shot's location.
  const landmarks = input.landmarks ?? [];
  if (!landmarks.length) {
    out.push(
      warn(
        "landmarks_unknown",
        input.locationName
          ? `Not verified: "${input.locationName}" has no named landmarks recorded.`
          : "Not verified: this shot has no location, so the landmark check cannot run.",
        "Geography is the first of the five location locks; without named landmarks nothing anchors the frame.",
        undefined,
        "not_verified",
      ),
    );
  } else if (line) {
    const hay = line.toLowerCase();
    const hit = landmarks.find((l) => l.name && hay.includes(l.name.toLowerCase()));
    const anchorHit =
      input.blockingAnchor && hay.includes(input.blockingAnchor.toLowerCase().slice(0, 24));
    if (!hit && !anchorHit) {
      out.push(
        warn(
          "no_landmark_referenced",
          "No named landmark from this location is referenced in the shot line.",
          "Without an environment anchor the model re-invents the space every render.",
          `…, ${landmarks[0].name} ${landmarks[0].side} of frame`,
        ),
      );
    }
  }

  return out;
}

/* --------------------------------------------------------- location ready */

export type LocationReadiness = {
  lock_state: ReturnType<typeof locationLockState>;
  missing_locks: string[];
  usable_for: string[];
  not_usable_for: string[];
  warnings: CraftWarning[];
};

/** Answers in production terms, not booleans. Reuses the `lock_state` shape. */
export function checkLocationReady(
  loc: LocationLockSource | null | undefined,
  name?: string | null,
): LocationReadiness {
  const state = locationLockState(loc);
  const missing = LOCATION_LOCKS.filter((l) => !state.filled[l.key]);
  const usable: string[] = [];
  const notUsable: string[] = [];
  const warnings: CraftWarning[] = [];

  if (!loc) {
    warnings.push(
      warn(
        "location_missing",
        "Not verified: no location is attached, so none of the five locks can be read.",
        undefined,
        undefined,
        "not_verified",
      ),
    );
    return { lock_state: state, missing_locks: [], usable_for: [], not_usable_for: [], warnings };
  }

  if (missing.length) {
    warnings.push(
      warn(
        "locks_unset",
        `${missing.length} of the five locks are unset: ${missing.map((m) => m.label).join(", ")}.`,
        "An unset lock is re-invented on every render, and the drift is only visible once two shots sit next to each other.",
      ),
    );
    usable.push("rough previs and blocking exploration");
    notUsable.push("approved plates", "continuity across shots in this location");
  } else {
    usable.push("single-angle shots that never turn the camera");
  }

  if (!state.reverseVerified) {
    warnings.push(
      warn(
        "reverse_unverified",
        `${name ? `"${name}"` : "This location"} has no verified reverse angle.`,
        "Screen-left becomes screen-right the moment the camera turns; a reverse that was never rendered is an assumption, not a lock.",
        "Generate the reverse separately, then stamp it verified.",
      ),
    );
    notUsable.push(
      "reverse or over-shoulder coverage",
      "a diagnostic baseline for continuity drift",
    );
  } else if (state.plateLocked) {
    usable.push(
      "reverse and over-shoulder coverage",
      "a diagnostic baseline for continuity drift",
    );
  }

  return {
    lock_state: state,
    missing_locks: missing.map((m) => m.key),
    usable_for: usable,
    not_usable_for: notUsable,
    warnings,
  };
}

/* ------------------------------------------------------------ sheet check */

export type SheetChecklistRow = VocabRow & { reason: string | null };
export const SHEET_VERDICTS = ["pass", "fail", "na"] as const;
export type SheetVerdictValue = (typeof SHEET_VERDICTS)[number];
export type SheetVerdict = { item: string; verdict: SheetVerdictValue; note?: string | null };

export function asSheetVerdicts(value: unknown): SheetVerdict[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => v && typeof v === "object")
    .map((v) => {
      const raw = v as Record<string, unknown>;
      const verdict = String(raw.verdict ?? "");
      return {
        item: String(raw.item ?? ""),
        verdict: ((SHEET_VERDICTS as readonly string[]).includes(verdict)
          ? verdict
          : "na") as SheetVerdictValue,
        note: typeof raw.note === "string" ? raw.note : null,
      };
    })
    .filter((v) => v.item);
}

export function sheetSummary(items: SheetChecklistRow[], verdicts: SheetVerdict[]) {
  const byItem = new Map(verdicts.map((v) => [v.item, v]));
  const answered = items.filter((i) => byItem.has(i.slug));
  const failed = items.filter((i) => byItem.get(i.slug)?.verdict === "fail");
  const unanswered = items.filter((i) => !byItem.has(i.slug));
  return {
    total: items.length,
    answered: answered.length,
    failed: failed.map((f) => f.slug),
    unanswered: unanswered.map((u) => u.slug),
    complete: unanswered.length === 0,
    passes: failed.length === 0 && unanswered.length === 0,
    sentence: unanswered.length
      ? `${answered.length} of ${items.length} items answered — the rest are not verified.`
      : failed.length
        ? `${failed.length} item${failed.length === 1 ? "" : "s"} failed: ${failed.map((f) => f.label).join(", ")}.`
        : "Every checklist item passes.",
  };
}

/* --------------------------------------------------------- cost rate card */

export const GENERATION_TIERS = ["previs", "finish"] as const;
export type GenerationTier = (typeof GENERATION_TIERS)[number];

export type ModelRateRow = VocabRow & {
  provider: string;
  model: string;
  resolution: string;
  credits_per_second: number;
};

export function rateCredits(rate: ModelRateRow | null | undefined, seconds: number): number | null {
  if (!rate || !Number.isFinite(seconds)) return null;
  return Math.round(rate.credits_per_second * seconds * 100) / 100;
}

/** The cheapest rate is the previs yardstick the finish quote is measured against. */
export function cheapestRate(rates: ModelRateRow[]): ModelRateRow | undefined {
  return [...rates].sort((a, b) => a.credits_per_second - b.credits_per_second)[0];
}

export function defaultRateForTier(
  rates: ModelRateRow[],
  tier: GenerationTier,
): ModelRateRow | undefined {
  if (tier === "previs") return cheapestRate(rates);
  return [...rates].sort((a, b) => b.credits_per_second - a.credits_per_second)[0];
}

export type CostQuote = {
  tier: GenerationTier;
  seconds: number;
  rate_slug: string | null;
  rate_label: string | null;
  credits: number | null;
  previs_rate_label: string | null;
  previs_credits: number | null;
  sentence: string;
};

export function quoteCost(
  rates: ModelRateRow[],
  tier: GenerationTier,
  seconds: number,
  rateSlug?: string | null,
): CostQuote {
  const rate = (rateSlug && rates.find((r) => r.slug === rateSlug)) || defaultRateForTier(rates, tier);
  const previs = cheapestRate(rates);
  const credits = rateCredits(rate, seconds);
  const previsCredits = rateCredits(previs, seconds);
  const sentence = !rate
    ? "Not verified: the rate card has no rows, so this roll cannot be quoted."
    : `${seconds}s at ${rate.label} costs ${credits} credits${
        previs && previs.slug !== rate.slug
          ? ` — the same ${seconds}s at ${previs.label} previs is ${previsCredits}.`
          : "."
      }`;
  return {
    tier,
    seconds,
    rate_slug: rate?.slug ?? null,
    rate_label: rate?.label ?? null,
    credits,
    previs_rate_label: previs?.label ?? null,
    previs_credits: previsCredits,
    sentence,
  };
}

/* ------------------------------------------------------------ spend rollup */

export type SpendRow = {
  tier: string | null;
  cost_credits: number | null;
  created_at: string;
  shot_status: string | null;
  shot_updated_at: string | null;
};

/** The number that changes behaviour: finish credits spent on shots that later changed. */
export function spendRollup(rows: SpendRow[]) {
  let total = 0;
  let finish = 0;
  let wasted = 0;
  for (const r of rows) {
    const credits = r.cost_credits ?? 0;
    total += credits;
    if (r.tier !== "finish") continue;
    finish += credits;
    const changedAfter =
      !!r.shot_updated_at && new Date(r.shot_updated_at).getTime() > new Date(r.created_at).getTime();
    const abandoned = r.shot_status === "held_still" || r.shot_status === "revision";
    if (changedAfter || abandoned) wasted += credits;
  }
  const pct = total > 0 ? Math.round((wasted / total) * 100) : 0;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    total_credits: round(total),
    finish_credits: round(finish),
    wasted_finish_credits: round(wasted),
    wasted_pct: pct,
    sentence: total
      ? `${round(total)} credits total, ${pct}% finish tier on shots that later changed.`
      : "No spend recorded yet.",
  };
}

/* ----------------------------------------------------------- edit lineage */

export type FrameLineage = {
  id: string;
  derived_from_frame_id?: string | null;
  is_composite?: boolean | null;
};

/**
 * The one hard block in the app. Every edit pass silently re-renders the whole
 * frame, so damage is cumulative and invisible per step; two edits deep the
 * plate no longer matches the lock and nobody can name which pass broke it.
 */
export function editLineageBlock(frame: FrameLineage | null | undefined): string | null {
  if (!frame?.derived_from_frame_id) return null;
  return `This frame is already an edit of frame ${frame.derived_from_frame_id}. Editing an edit re-renders the whole image again and the damage is cumulative and invisible per step — composite the change back onto that original master instead of chaining.`;
}

/* --------------------------------------------------------------- risk tail */

export const RISK_SPLIT_CODE = "risk_split";

export function riskSplitWarning(entries: RiskEntry[]): CraftWarning | null {
  const distinct = new Set(entries.map((e) => e.class).filter(Boolean));
  if (distinct.size < 3) return null;
  return warn(
    RISK_SPLIT_CODE,
    `This shot carries ${distinct.size} distinct risk classes.`,
    "Three or more means it is really a sequence — split it.",
    "Split it into separate shots, one risk surface each.",
  );
}
