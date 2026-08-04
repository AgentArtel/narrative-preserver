// The doctrine channel: one source, two renderings.
//
// `doctrinePreamble()` produces the MCP server `instructions` — the only prose
// guaranteed to reach every client at connect. `get_house_rules` serves the
// same sections in full. Both read this file, so the short form and the long
// form cannot drift apart.
//
// Every section declares its BASIS. Some of this is measured against real
// renders; some of it is one team's habit promoted to practice. A session that
// cannot tell the two apart will defend a convention as if it were physics.

/** When the doctrine itself last changed — not when it was read. A session
 *  holding a cached copy can compare this and notice it is stale. */
export const DOCTRINE_UPDATED = "2026-08-03";

export type DoctrineBasis = "measured" | "convention" | "mixed";

export type DoctrineSection = {
  id: string;
  title: string;
  basis: DoctrineBasis;
  /** One line. Goes in the connect preamble — keep it to the expensive rule. */
  headline: string;
  /** Markdown. Served by get_house_rules. */
  body: string;
  /** Vocabulary table to quote under this section, resolved per project. */
  vocabulary?: VocabularyKind;
};

export type VocabularyKind =
  "camera_moves" | "risk_classes" | "sheet_checklist" | "model_rates" | "approval_purposes";

export const DOCTRINE: DoctrineSection[] = [
  {
    id: "prompt-architecture",
    title: "The four-block prompt",
    basis: "convention",
    headline:
      "A prompt is four blocks. STYLE LOCK, CONTINUITY and DIRECTION are emitted byte-identical every time; only SHOT varies. Never paraphrase, reflow or indent a lock.",
    body: `A generation prompt is always four blocks, in this order:

1. **STYLE LOCK** — the medium. Render technique, linework, value structure, palette law, negative list.
2. **CONTINUITY** — what must not change between shots.
3. **DIRECTION** — the standing directorial instruction.
4. **SHOT** — the only block that varies.

The first three are frozen at the project and emitted **verbatim and unindented** on
every compile. That is what makes two packages diffable at all: the locks are constant,
so any difference between two compiles is somewhere you can actually point at. Other
parts of the package do vary per shot — references, provider Elements, canon — so diff
the package rather than assuming only SHOT moved.

Consequences worth stating plainly:

- Re-wording a lock "just to read better" silently invalidates every earlier render as
  a comparison point.
- A Look is a variation *within* the medium — an act's palette shift, a time of day. A
  Look never contradicts the lock. If you find yourself wanting it to, the lock is wrong
  and should be re-frozen deliberately.
- Risk notes, lint warnings and readiness text never enter prompt text. See
  \`risk-classes\`.`,
  },
  {
    id: "camera-grammar",
    title: "Camera vocabulary",
    basis: "mixed",
    headline:
      "Declare the camera move in the first three words of a shot line. An undeclared move renders as a slow push-in. Slow motion is a time move — fuse it to a framing move, never bare.",
    vocabulary: "camera_moves",
    body: `The move belongs in the **first three words** of the shot line, and it must be a move
from the project's vocabulary. The vocabulary is a table, not a constant: a fourteenth
move is a row, not a deploy.

Two flags on each row carry meaning the name does not:

- **\`is_time_move\`** — the entry changes time rather than framing, and cannot stand
  alone: on its own it leaves the framing entirely to the model. \`close_slow_mo\` is the
  seeded case, and it is a *time* move, not a fused one. Write it fused to a framing
  move — \`"push, close slow-mo"\` — because \`"close slow-mo"\` by itself is exactly what
  the linter flags.
- **\`implies_motion\`** — the a/b framings must differ; the frame is not locked off.
  This is **not** the same as the camera travelling. A pivot changes the frame between a
  and b without the camera going anywhere, which is why \`vertical_tilt\` ("pivots up or
  down from a fixed position") and \`whip_pan\` both carry it while \`dutch_angle\` — a roll
  that leaves the framing where it was — does not. It exists to cross-check a pair's form:
  a \`locked_camera\` pair on
  a move that changes the frame, or a \`moving_camera\` pair on one that does not, is the
  most common failure in the pipeline, and the two need opposite instructions.

Which rows carry which flag is **data, not doctrine** — call \`get_vocabularies\` for the
values actually in force on a project rather than assuming them from a move's name.

*Measured:* an undeclared move renders as a slow push-in. *Convention:* the
first-three-words rule — it is a reliable way to hit the model's attention, not a law.`,
  },
  {
    id: "shot-line-grammar",
    title: "Writing a shot line",
    basis: "convention",
    headline:
      "Name at least one landmark from the location in every shot line, and anchor blocking to a named object — never to screen direction, which inverts on the reverse.",
    body: `A shot line does three things: it declares the move, it anchors the space, and it says
what happens.

- **Anchor to a named object, never to screen direction.** "Screen-left" becomes
  "screen-right" the moment the camera turns. "Left of the altar" survives the reverse;
  "on the left" does not.
- **Name a landmark.** Without an environment anchor the model re-invents the space on
  every render, and the drift is only visible once two shots sit next to each other.
- **One generation is not one shot.** Given a numbered shot list, a single 15s Seedance
  generation renders real internal hard cuts — **12–13 setups** in the measured reference
  clip, at roughly 1.0–1.25s each. Rendering one clip per shot costs about 3× more for the
  same footage. *(Measured by reading labelled 1fps contact sheets. Do not substitute
  automatic scene detection: scene-score thresholds cannot tell a hard cut from a whip-pan
  in cel animation.)*

\`lint_shot_line\` checks the move rules and the landmark rule, and warns. It does **not**
check for screen-direction language or for shot density — those two are on you. It never
refuses a save either: a warning that stops work gets switched off, and then the rule is
gone.`,
  },
  {
    id: "location-locks",
    title: "The five location locks",
    basis: "convention",
    headline:
      "A location is locked by five things — geography, blocking anchor, light logic, materials, depth — and is not a plate until its reverse has been separately generated and verified.",
    body: `The five locks:

1. **Geography** — the named landmarks and where they sit relative to each other.
2. **Blocking anchor** — the object positions are described against.
3. **Light logic** — where the light comes from and what it does.
4. **Materials** — what the surfaces are.
5. **Depth** — foreground, midground, background contents.

An unset lock is re-invented on every render.

**The reverse is not optional.** A plate whose reverse angle was never rendered is an
assumption, not a lock — you cannot know the geography survives the turn until you have
turned. A location with all five locks but no verified reverse can still serve a
single-angle shot; it cannot serve as a diagnostic baseline for continuity drift.

\`check_location_ready\` answers this in production terms: what the plate is usable for
and what it is not.`,
  },
  {
    id: "character-sheets",
    title: "Character sheets",
    basis: "mixed",
    headline:
      "Character sheets sit on a deep neutral grey plate, never white — white bleeds into video and washes out the location.",
    vocabulary: "sheet_checklist",
    body: `The sheet is the face of record. Everything downstream averages toward it, so competing
evidence inside one sheet is worse than less evidence.

*Measured against the reference project:* the plate is a deep neutral grey (\`#3a3a3c\`).
White bleeds into video and washes out the location behind the character. Note that the
vendor's own bundled workflow says "pure white seamless" — the vendor disagrees with its
own output, and the output is what shipped.

*Convention, but load-bearing:* three columns with the chest-up portrait largest and
leftmost at 25–30% of frame; heads cropped from the full-body panels rather than left at
40px; a catchlight in both eyes; a legible iris; symmetry deliberately broken. A
perfectly symmetrical sheet renders as a mannequin, and a 40px face drifts from the
portrait — two faces is competing evidence the model splits the difference on.

\`check_sheet\` walks the checklist. It cannot inspect pixels; it records a human verdict
per item, with the reason for each item beside it, because the reasons are what make the
items get checked honestly.`,
  },
  {
    id: "risk-classes",
    title: "The render-risk tail",
    basis: "convention",
    headline:
      "Risk notes are for humans only and never enter prompt text — a model shown “pink may drift to red” can read that as a request for red.",
    vocabulary: "risk_classes",
    body: `Before a render, predict how it will fail and what you will do about it. Each entry is a
class, a prediction, an agreed fallback, and whether it occurred.

**This is app-only.** None of it may reach a generation package. Naming a failure mode
inside a prompt is a way of asking for it.

A shot carrying **three or more risk classes** is not a shot. It is a sequence, and the
fix is to split it rather than to write a longer risk tail.`,
  },
  {
    id: "edit-discipline",
    title: "Never re-edit an edit",
    basis: "convention",
    headline:
      "Never edit a frame that is itself already an edit. Every pass silently re-renders the whole image, so damage compounds invisibly — composite back onto the original master instead.",
    body: `An edit pass does not modify a region. It re-renders the entire frame and keeps what you
asked to keep. The loss per pass is small enough to miss and cumulative, so two edits
deep the plate no longer matches the lock and nobody can name which pass broke it.

So: **chaining edits is refused.** This is the only place in the app that refuses rather
than warns, because unlike every other rule here the damage is invisible at the moment
you do it and unrecoverable afterwards.

The alternative is always available: composite the change back onto the original master
and mark the result a composite. Frame lineage is recorded so the master is one click
away.`,
  },
  {
    id: "approval",
    title: "Approval is scoped",
    basis: "convention",
    headline:
      "Approval is per-purpose, not global: one frame can pass as a costume reference and hold as a face reference at the same time.",
    vocabulary: "approval_purposes",
    body: `A frame is rarely good at everything. The armour reads perfectly and the face has drifted;
the palette is right and the pose is wrong. A single approved/not-approved flag forces
you to lie in one direction or the other.

So approval is \`(frame, purpose)\`. The same frame can be a pass for one downstream use
and a hold for another, simultaneously, and the scoped hold is visible on the frame card.

\`approve_frame\` with no purpose approves for **default**, which is what reference
selection and the generation package still read.`,
  },
  {
    id: "economics",
    title: "Previs cheap, finish rarely",
    basis: "measured",
    headline:
      "Previs at 480p and finish only the survivors — 4K costs 22× the cheapest previs per second, so a 15s 4K retry is 330 credits against 15 for the same shot at 480p.",
    vocabulary: "model_rates",
    body: `The rates are rows, not constants, because vendors change prices. The measured Seedance
card at the time of writing:

| tier | credits/sec | 15s |
|---|---|---|
| mini 480p | 1.0 | 15 |
| std 480p | 1.5 | 22.5 |
| std 1080p | 9.0 | 135 |
| std 4K | 22.0 | **330** |

That is a 22× spread between the cheapest previs and 4K finish. The number that actually
changes behaviour is not total spend but **finish credits that bought nothing**: a finish
render that was rejected, one that a later finish render on the same shot replaced, or one
on a shot now in revision or held as a still. Each of those is the whole cost with none of
the benefit.

Note what that figure deliberately does *not* count. A shot that was finished and then
approved is not waste, however much it was edited on the way — an earlier version counted
any post-render edit as waste and therefore flagged every successful shot.

Generations default to **previs** tier so that spending the expensive one is always a
deliberate act. \`preflight_generation\` quotes the cost before it is spent and quotes the
previs equivalent beside it.`,
  },
  {
    id: "pipeline-gates",
    title: "The gates",
    basis: "convention",
    headline:
      "Work moves through gates G0–G9; do not start a gate whose predecessor is not finished, because every downstream render inherits the defect.",
    body: `| gate | means |
|---|---|
| G0 | intake — premise, references, constraints |
| G1 | style lock frozen |
| G2 | continuity written |
| G3 | characters locked (sheets approved) |
| G4 | locations locked (five locks + verified reverse) |
| G5 | proof shot — one shot proving the stack holds |
| G6 | shot manifest complete |
| G7 | previs rendered |
| G8 | motion pass |
| G9 | finish |

The gates are a convention, not an enforcement: nothing blocks you from rendering at 4K
before a single sheet is approved. The reason to respect them is that defects at a low
gate are inherited by everything above, and they get more expensive to fix at exactly the
rate the render tier gets more expensive.`,
  },
];

export const DOCTRINE_IDS = DOCTRINE.map((s) => s.id);

/** What each gate needs before the next one is worth starting. Lives here
 *  rather than beside the GATES list in craft.ts because it is doctrine prose,
 *  and get_project_overview quotes it back at the session. */
export const GATE_REQUIREMENT: Record<string, string> = {
  G0: "Write the premise, gather references, and state the constraints — aspect ratio, length, tone.",
  G1: "Freeze the STYLE LOCK: render technique, linework, value structure, palette law, negative list.",
  G2: "Write the CONTINUITY block — what must not change between shots — and the DIRECTION block.",
  G3: "Approve a character sheet for every character in the cast.",
  G4: "Fill all five locks on every location and verify a separately generated reverse angle.",
  G5: "Render one proof shot that exercises the whole stack, and confirm it holds.",
  G6: "Complete the shot manifest: every shot has a line, a declared camera move and a location.",
  G7: "Render previs for every shot at the cheapest tier and cut it together.",
  G8: "Run the motion pass — a/b keyframe pairs with the right form for each shot's move.",
  G9: "Finish only the shots that survived previs. Everything else stays at previs tier.",
};

const BASIS_NOTE: Record<DoctrineBasis, string> = {
  measured: "measured against real renders",
  convention: "convention — one team's practice, not a law",
  mixed: "part measured, part convention (marked inline)",
};

/**
 * The connect preamble. Every session pays for this on every connect, so it
 * carries only the rules whose violation is expensive AND invisible — the ones
 * you would not discover by simply using the tools.
 */
export function doctrinePreamble(): string {
  const rules = DOCTRINE.map((s) => `- **${s.title}.** ${s.headline}`).join("\n");
  return `StoryForge is a production tool for cel-shaded anime shorts. It holds the state — projects, sequences, scenes, beats, shots, cast, locations, elements, looks, references, canon, frames and generation history — and it also holds the craft, as validators you can call rather than rules you have to remember.

The non-negotiables, because violating them is expensive and the damage is not visible at the time:

${rules}

Validators warn; they never block. The single exception is editing an already-edited frame, which is refused.

First calls: \`get_project_overview\` for where a project stands and what to do next, \`get_house_rules\` for any rule above in full, \`get_vocabularies\` for the camera moves, risk classes, sheet checklist, rate card and approval purposes as data. Doctrine last updated ${DOCTRINE_UPDATED}.`;
}

/** A vocabulary table rendered for quoting inside a house-rules section. */
export type VocabQuote = { kind: VocabularyKind; lines: string[] };

/**
 * Full doctrine as markdown. `quotes` lets the caller splice in a project's
 * resolved vocabulary rows so the rules a session reads are the rules its
 * validators actually enforce.
 */
export function renderHouseRules(sections: DoctrineSection[], quotes: VocabQuote[] = []): string {
  const byKind = new Map(quotes.map((q) => [q.kind, q.lines]));
  const parts = sections.map((s) => {
    const quoted = s.vocabulary ? byKind.get(s.vocabulary) : undefined;
    const block =
      quoted && quoted.length
        ? `\n\n**This project's \`${s.vocabulary}\` right now:**\n${quoted.map((l) => `- ${l}`).join("\n")}`
        : "";
    return `## ${s.title}\n\n_id: \`${s.id}\` · basis: ${BASIS_NOTE[s.basis]}_\n\n${s.body}${block}`;
  });
  return parts.join("\n\n---\n\n");
}

export function doctrineSections(ids?: string[] | null): DoctrineSection[] {
  if (!ids || !ids.length) return DOCTRINE;
  const wanted = new Set(ids);
  return DOCTRINE.filter((s) => wanted.has(s.id));
}
