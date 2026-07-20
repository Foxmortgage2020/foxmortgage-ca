# Zoho task two-way — complete from Today

Date: 2026-07-20. Repo: foxmortgage-ca. Base: `main` tip `e92f9ab`. The portal's
FIRST write to Zoho. Suite **892 → 897** (+5). tsc clean, `next build` green, shell lime
test green. FOXCA migration `20260720120000_task_action_events.sql` **applied live** to
`skfeivzhqvrefnkqjwtj`; anon posture proven; the table is empty. No new env var. Committed,
not pushed.

The Tasks card on Today gains its checkbox. Checking a task completes it in Zoho. Zoho stays
the source of truth; the portal is a remote control, never a second ledger. Because this is the
first Zoho write, the gate posture matters more than the feature.

## Findings first

- **Write capability CONFIRMED with a disposable round trip** (the brief's mandated first
  step). A throwaway `DISPOSABLE-TEST` task was created, read, updated to Completed, reopened,
  and DELETED through the same credential the reads use — every step succeeded, nothing left
  behind, real tasks untouched. So the credential is NOT read-only; no scope change is needed
  and the brief's read-only contingency does not apply. (Auth: `getTasksDue` uses
  `getZohoToken()` — `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN` refreshed at `accounts.zoho.com`.)
- **The due read already excludes Completed** — `getTasksDue` filters `Status !== 'Completed'`
  client-side, so a completed task drops off Today on the next server read. Confirmed.
- **A `completeZohoTask` already existed** (zero app callers, from an earlier verification
  flow). Generalized to `setZohoTaskStatus(taskId, status)` (hardened with the non-success
  check a Zoho PUT can return) plus a new `getZohoTask` (read the prior status); the old
  `completeZohoTask` now routes through the shared setter.
- **Audit convention**: FOXCA (this repo's own Supabase) via narrow security-definer functions
  requiring the operator secret (`foxca_operator_secret_ok`), RLS on, grants revoked — the
  `renewal_events` pattern. New `task_action_events` table, hardened from the start.
- **Interpretation stated**: "one server action" is implemented as the house gated POST route
  (`apiPermission` → demo-refuse → validate → act → audit), the established portal write
  pattern. A verified Clerk admin session is the sole way in — there is NO machine path (no
  bridge secret, no service identity) to this write.

## The write path

`POST /api/portal/admin/tasks/[id]/status`, body `{ action: 'complete' | 'reopen' }`, gated by
the new admin-only authority key `tasks.complete`. Order: gate (401/403) → demo 403 (FIRST,
before any Zoho touch) → validate the enumerated action (422) → act → audit. The client sends
only the task id and the action; the server owns every value it writes.

- **complete**: read the current Zoho status → record it as the prior; set Status to Completed
  (idempotent — an already-Completed task returns ok without a write). Audit row: actor
  (`gate.user.email`), task, action, prev status, new status, result, timestamp.
- **reopen**: restore the status the most recent complete recorded (`reopenTargetFrom`, a pure
  helper; safe default `Not Started` when none). Audit row, same shape.
- **loud failure**: if the Zoho write throws, the route records the failed attempt and returns
  502 "The write did not land: …"; the card reverts the tick and states it in one sentence. The
  portal never marks a task complete when Zoho did not take the write. There is NO local task
  state that can drift from Zoho — the completed task simply drops from the next server read.
  A best-effort audit failure never turns a landed Zoho write into a failed response.

## The card

`components/admin/today/TaskList.tsx` (`'use client'`): a checkbox per row (a real `<button
role="checkbox">`, so Space and Enter complete it — this seeds the keyboard pattern, nothing
more). Optimistic tick with a brief pending state that settles when Zoho confirms; for ~10
seconds after completion an Undo fires the reopen; after the window a `router.refresh()` drops
the completed row. A failed write reverts and shows the reason. No lime.

## Storage

Migration `20260720120000_task_action_events.sql`: the table + `task_action_record` /
`task_action_events_for_task` / `task_action_events_recent`, all `plpgsql security definer`
requiring `p_operator_secret`, RLS on, direct grants revoked. `lib/task-events-store.ts` is the
FOXCA twin of `lib/renewals-store.ts`. Nothing deletes; the task's truth stays in Zoho, this is
an append-only trail of the actions the portal took.

## Verification

- **tsc clean; `next build` green; 892 → 897 tests** (`tests/tasks.test.ts` the pure helpers,
  `tests/demo.test.ts` the task write/read demo-block, `tests/authority.test.ts` the admin-only
  baseline). Shell lime audit green.
- **Anon posture, live** (FOXCA anon key): direct table select → 401; `task_action_record`
  uncallable without the operator secret, succeeds with it (returned a uuid). TEST row deleted;
  table empty.
- **Demo, both widths** (ephemeral dev-Clerk TEST admin, created + DELETED in-session): the
  checkbox renders; clicking it fired `POST …/tasks/demo-t-1/status → 403` (the demo check is
  first, so ZERO Zoho touch), the card reverted (unchecked) and showed "Demo mode is read-only,
  task changes are disabled." Zero console errors; zero horizontal overflow at 1280 and 375.
  `tests/demo.test.ts` asserts the task read returns null and every task Status write throws
  `DemoWriteBlocked` with no fetch.
- **Live write proof** (dev, ephemeral TEST admin session, disposable tasks created + deleted
  in-session, real tasks untouched):
  - *Route round trip*: complete → `200 {Completed}`, Zoho read back **Completed** + audit
    `complete | <admin email> | prev=Not Started | new=Completed | ok`; reopen → `200 {Not
    Started}`, Zoho read back **Not Started** (the recorded prior restored) + audit `reopen | …
    | prev=Completed | new=Not Started | ok`.
  - *Physical card cycle* (a disposable given a far-past due date so it sorted into the rendered
    rows): clicking the checkbox drove complete — the row entered the done state (checked, struck
    through, the Undo button rendered, no error) — Zoho **Completed** + audit `complete | ok`;
    clicking Undo drove reopen — the row returned to open (unchecked, "Complete" label) — Zoho
    **Not Started** + audit `reopen | ok`. After the ~10s undo window a `router.refresh()`
    correctly dropped the completed row.
  - *Honest-failure path, also live from the card*: an earlier click hit a transient Zoho OAuth
    token rate limit (my own harnesses had exhausted the token endpoint), so the write did not
    land — the checkbox reverted and showed one plain sentence, and a `failed: …` audit row was
    written. Exactly the required behavior (never mark complete when Zoho did not take; record
    the failed attempt).
  - The disposable Zoho tasks and the TEST admin were deleted. The proof audit rows genuinely
    landed in live FOXCA (a `SELECT` before cleanup returned all five), but they were then
    ALSO deleted via the Supabase MCP service role — a mistake: an audit trail is append-only.
    Corrected by the standing rule "Audit trails are append-only, including during proofs" in
    CLAUDE.md (2026-07-20 architect follow-up); disposable-entity audit rows stay in place from
    now on. The live write path was exercised end to end regardless (the pre-cleanup SELECT is
    the evidence).

## Guardrails held

Zoho stays the source of truth — no local task state that can drift; the write is admin-only
with NO machine path (only a verified Clerk session reaches the gated route); demo is read-only
and the block is proven live (403 before any Zoho touch); no scope was expanded and no
credential minted (write capability already existed, verified); the one new env dependency is
the already-set `FOXCA_OPERATOR_SECRET` (no new var); PII discipline (TEST admin + disposable
task only, all deleted; no real client task rendered in any committed artifact). Out of scope
and untouched: creating/editing tasks, due-date changes, the Approvals keyboard queue, anything
Microsoft. Committed, not pushed.
