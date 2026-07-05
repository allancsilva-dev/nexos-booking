# PR-WEB-WORKING-HOURS-LUNCH-01 Design

## Objective

Improve the existing professional working-hours screen so a user can configure lunch or pauses as multiple `working_hours` blocks on the same day, using only frontend/UI changes on the existing route:

- `/professionals/:id/hours`

This PR must not introduce backend, schema, contract, or routing changes.

## Product Rule

Lunch or pause is not a special entity and is not a buffer. It is represented only as absence of working hours between two blocks on the same day.

Example:

- Monday `08:00-12:00`
- Monday `13:00-18:00`

The interval `12:00-13:00` is unavailable because there is no working-hours block covering it.

## Confirmed Constraints

- Keep current route `/professionals/:id/hours`
- Use existing `GET /working-hours` and `PUT /working-hours`
- Do not infer a weekly pattern automatically from saved data
- `GET /working-hours` must always load the real saved state
- If saved shifts differ by day, show exactly those saved blocks
- Only apply a weekly pattern when the user explicitly chooses it
- Persist only `WorkingHoursInput { shifts: [...] }`
- Do not persist visual concepts such as `lunch`, `pattern`, or `exception`
- No backend changes
- No schema or shared-contract changes
- No new route
- No new entity
- No commit
- No push

## Scope

Allowed files:

- `apps/web/app/(authenticated)/professionals/[id]/hours/page.tsx`
- `apps/web/components/professionals/working-hours-editor.tsx`
- `apps/web/hooks/use-working-hours.ts`

Out of scope:

- `apps/api/**`
- `packages/shared/**`
- `db/**`
- `appointments/**`
- `availability/**`
- `public-booking/**`
- migrations
- schema changes
- global lunch settings
- a new parallel screen

## Existing Technical Base

The backend and shared DTO already support multiple shifts per weekday.

- `GET /professionals/:professionalId/working-hours`
- `PUT /professionals/:professionalId/working-hours`
- `WorkingHoursInput = { shifts: ShiftDTO[] }`

Availability and booking already treat missing time between saved shifts as unavailable time. This PR therefore focuses only on making the frontend clearer and faster to use.

## UX Goals

The screen should make the common case easy:

- Monday to Friday
- `09:00-18:00`
- optional lunch `12:00-13:00`

But it must still faithfully show the real saved state whenever the professional already has a day-by-day configuration.

## Interaction Model

### 1. Entry

On load:

- call `GET /working-hours`
- normalize the payload only for UI presentation by day
- do not infer a weekly pattern automatically

### 2. Empty State

If the professional has no saved working hours:

- show a clean empty state
- show CTA `Criar jornada padrão`
- when clicked, prefill:
  - Monday to Friday selected
  - `09:00-18:00`
  - no lunch
- do not persist anything automatically
- only save after explicit user confirmation

### 3. Saved State

If the professional already has saved working hours:

- render exact saved blocks by day
- do not rewrite them into pattern + exceptions automatically
- show pattern actions only as explicit user actions

### 4. Screen Structure

Top section:

- day chips side by side
- standard working time in one line
- optional lunch/pause in one line

Lower section:

- day-specific adjustments
- hidden or collapsed until the user explicitly edits a day

### 5. Lunch / Pause

Lunch is only a visual shortcut.

It transforms:

- `09:00-18:00`

into:

- `09:00-12:00`
- `13:00-18:00`

When removed for a specific day, the day can return to a single block.

### 6. Day-Specific Adjustments

Per day, the UI should allow:

- add block
- remove block
- remove lunch
- mark day as no working hours
- reset day to the manually applied standard pattern, if one exists in current UI state

These controls must operate on the real day state and always resolve back to explicit `shifts[]`.

## Data Model in the Frontend

The frontend may keep a view model for editing, but it is presentation-only.

Rules:

- source of truth from API remains `shifts[]`
- visual concepts like pattern or lunch cannot be persisted
- before save, convert current UI state into `WorkingHoursInput`
- `PUT` always sends the full working-hours set

## Validation

Local validation:

- `endTime > startTime`
- lunch must stay inside the base range
- split validation must satisfy:
  - `start < lunchStart < lunchEnd < end`
- blocks on the same day cannot overlap
- no-working-day means zero blocks

Validation errors must appear inline near relevant controls.

## Error Handling

Loading states:

- `loading`: skeleton or simple loading block
- `error`: retry state
- `empty`: empty state with CTA
- `ready`: real data loaded
- `saving`: prevent duplicate save submission

API errors:

- `WORKING_HOURS_CONFLICT`: friendly message such as overlap on same day
- `VALIDATION_ERROR`: map `details[]` to fields when possible
- global error: toast plus inline message near edited section

Do not create new error codes.

## No Placeholder Rule

The final implementation must not include fake example data as if it were real state.

Allowed hardcoded values:

- weekday labels
- UI labels
- empty-state default values for `Criar jornada padrão`

Not allowed:

- fake day exception content
- fake lunch text as saved data
- placeholder schedules presented as real data

## Recommended Implementation Shape

### `use-working-hours.ts`

- normalize current API response shape into frontend `WorkingHoursInput`
- keep GET and PUT integration stable
- avoid backend changes by adapting the hook layer if the API returns list format

### `working-hours-editor.tsx`

- replace current always-expanded day editor with compact structure
- support:
  - empty state flow
  - standard pattern flow
  - day-specific override flow
- keep validation and friendly error mapping local to component

### `page.tsx`

- keep route and screen shell
- update explanatory copy only where needed
- preserve existing loading/error boundaries

## Testing and Validation

Expected validation after implementation:

- create Monday to Friday pattern `09:00-18:00`
- add lunch `12:00-13:00`
- save and reload
- confirm returned state still shows correct real shifts
- add or remove a block from a specific day
- show inline validation for invalid ranges
- show friendly conflict error for overlap
- run:
  - `pnpm --filter @nexos/web build`
  - if Turbopack is blocked by environment, use:
  - `pnpm --filter @nexos/web exec next build --webpack`

## Acceptance Criteria

- Professional can configure Monday to Friday quickly
- Lunch can be configured as a visual split into two shifts
- Existing saved day-by-day configurations are shown exactly as saved
- No automatic pattern inference occurs
- Empty state offers `Criar jornada padrão`
- Saving uses existing `PUT /working-hours`
- Reload uses existing `GET /working-hours`
- Friendly validation and conflict errors are shown
- No backend, schema, or contract changes are introduced

## Risks and Guardrails

Main risk:

- a visual pattern model accidentally hides or rewrites the real saved state

Guardrails:

- real loaded state always wins
- pattern application is explicit only
- persisted output is always explicit `shifts[]`
- scope stays inside approved web files only
