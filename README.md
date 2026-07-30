# StoryForge Canvas

Build StoryForge — a persistent visual-production workspace for AI-generated storytelling. It is the memory layer around external generation tools (Higgsfield): storyboard, script, reusable assets, approvals, continuity. It does NOT generate media itself in this version — it compiles generation context for handoff and stores returned results.

Core principle driving all UX: "Generate freely. Approve intentionally. Preserve permanently." A generation output is only a candidate. An approved frame is a production decision. A Canon entry is reusable project truth. These three states must be visually distinct everywhere.

STACK: Enable Lovable Cloud: email auth, Postgres with RLS (per-user ownership), storage bucket for reference and frame images.

DATA MODEL:
- projects (title, description, status)
- sequences (project_id, title, sort_order)
- scenes (sequence_id, title, brief, sort_order, status)
- beats (scene_id, description, sort_order)
- shots (scene_id, beat_id nullable, shot_number, description, dialogue, duration_seconds, camera jsonb {size, angle, movement, lens, dof, composition}, location_id nullable, location_state jsonb, status enum: idea | drafting | ready | generating | candidates | revision | approved | final, sort_order)
- frames (shot_id, image_url, kind enum: concept | storyboard | keyframe | start | end | final, is_approved boolean, notes)
- characters (project_id, name, role, description, attributes jsonb)
- locations (project_id, name, description)
- elements (project_id, name, element_type, description)
- looks (project_id, name, description, palette jsonb array of {name, hex}, prompt_fragments text[], negative_constraints text[])
- shot_characters (shot_id, character_id, state jsonb for outfit/damage/props)
- shot_elements (shot_id, element_id, state jsonb)
- asset_references (project_id, image_url, roles text[], notes) + reference_links (reference_id, owner_type, owner_id, role) so one image can serve characters, locations, elements, or shots
- generations (shot_id, provider, tool, model, prompt, negative_prompt, settings jsonb, reference_summary jsonb, status enum: handed_off | imported | rejected, cost_credits numeric nullable, created_at)
- canon_records (project_id, subject_type enum: character | location | element | scene | shot, subject_id, aspect text e.g. face/outfit/architecture/lighting, description, source_frame_id nullable)
- provider_identities (provider, capability, external_id, owner_type, owner_id, status, metadata jsonb). NO provider-specific columns on core tables, ever.

SCREENS:
1. /projects — list + create.
2. Project Home — counts (scenes, shots, cast, locations, elements), pending approvals (shots in "candidates"), recent generations.
3. Scene Workspace (core screen, three panels): LEFT — sequence/scene tree, beats, shots with status dots. CENTER — storyboard: large shot cards (number, approved frame or placeholder, description, dialogue preview, duration, status badge, character/location chips), drag to reorder, insert/duplicate. RIGHT — selected shot context: characters with per-shot state, location + state, elements, look, camera fields, references, and a "Generation Package" button. Panels collapse on mobile.
4. Shot Detail — approved frame hero; candidate grid with side-by-side compare (pick 2); Approve action on a frame; "Promote to Canon" dialog listing granular aspects as checkboxes (character face, character outfit, location design, element design, lighting, composition), each checked aspect creating a canon_record tied to that frame; the previous shot's approved frame shown as continuity reference; shot generation history.
5. Cast, Locations, Elements, Looks — library pages: card grids, detail view, reference image upload, canon_records listed per asset.
6. Generations — filterable history table (provider, model, shot, status, date).

GENERATION PACKAGE (key feature, no external API calls): a dialog on any shot that compiles scene brief, shot description + dialogue, camera spec, each character with state + canon aspects, location with state + canon, elements + canon, look palette hexes + prompt fragments + negative constraints, and the previous approved frame reference into a clean copyable structured text block. Creating one writes a generations row (handed_off). An "Import result" action uploads image(s) as candidate frames on that shot and marks the generation imported.

SEED DATA so the slice is reviewable immediately: project "Ashfall" → sequence "Opening Cinematic" → scene "The hero enters the ruined cathedral" with 5 beats/shots: (1) the doors open, (2) the hero enters, (3) the torches extinguish, (4) a creature moves in the darkness, (5) the hero draws her weapon. Cast: "Sera, the hooded knight". Location: "Ruined Cathedral". Elements: "Rune Sword", "Bone Censer". Look: "Painterly Dark Fantasy" with palette Moonlight Blue #4A6FA5, Oxidized Bronze #6E5B3E, Blood Red Accent #8A1C1C, Ash Gray #55575A, Warm Skin Highlight #D9A066.

DESIGN: dark cinematic production tool. Near-black charcoal surfaces, one amber accent, high-contrast type, imagery-forward storyboard cards, dense but calm. No gradients, no purple, no marketing-site styling. Frame states: candidate = neutral border, approved = accent border, canon-sourced = small marker.

SCOPE DISCIPLINE: build exactly this. No continuity automation, no video, no audio, no team features, no exports, no external provider APIs in this version.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/60f85b6a-1ec1-4d97-bcb1-9dbab113b7e2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
