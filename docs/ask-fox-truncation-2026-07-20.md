# Ask Fox truncation handling and honest errors (portal lane)

Date: 2026-07-20 (Toronto). Base: `c566159`. Committed, not pushed.

## Findings first (and a loud deviation)

The production log was:
`[agent] turn failed: Unterminated string in JSON at position 6000` (2026-07-20T15:52:22Z).

State of `/api/portal/admin/agent/chat` → `lib/agent/loop.ts`:
- **max_tokens:** `AGENT_MAX_OUTPUT_TOKENS = 16000` — generous, not tight.
- **Streaming:** yes. `client.messages.stream(...)`, text via `.on('text')`, then `await stream.finalMessage()`.
- **stop_reason:** already checked — `refusal` (line 108), `max_tokens` (114, honest cut-off copy), `tool_use` (123).
- **JSON parse of the reply:** none. The SDK parses the SSE stream; the loop never `JSON.parse`s the model reply.

**The actual mechanism is not a model truncation.** The only `JSON.parse` that can throw at position 6000 is in a TOOL: `lib/agent/tools.ts` `knowledge_lookup` capped the lender profile with

```
JSON.parse(JSON.stringify(d.profile, null, 0).slice(0, 6000))
```

`.slice(0, 6000)` cuts the JSON string mid-token, then `JSON.parse` throws *"Unterminated string in JSON at position 6000"* for any profile whose compact JSON exceeds 6000 chars. The `knowledge_lookup` handler has no try/catch, so the throw propagated to the loop's catch (line 179), which logged `[agent] turn failed:` **and emitted the misleading "could not reach the model" copy** — the model was reached fine; a tool crashed.

So the brief's framing (a model `max_tokens` / stop_reason truncation) rests on a wrong assumption. The fix is at the tool, plus the honest-error and never-partial handling the brief asks for. `max_tokens` is not tight, so it is not raised.

## The change

1. **The source bug — `cappedProfile` (tools.ts).** A new pure helper caps a value's size WITHOUT slicing-then-reparsing JSON: a small profile passes through as the structured object (intent preserved); an oversized one becomes a valid object `{ truncated: true, note, text }` carrying the first N characters as text. It never throws. `knowledge_lookup` now uses it.

2. **A tool throw never crashes the turn (loop.ts).** The tool dispatch is wrapped: a thrown tool becomes a failed `tool_result` (`is_error`) the model can respond to, and the turn continues. Belt-and-braces beyond fix 1 — no single tool bug can take down a whole turn again.

3. **Three honest error cases, plain words, no semicolons (loop.ts catch).**
   - *could not reach the model* — network / API / auth / rate-limit.
   - *the answer was cut off* — the existing `max_tokens` branch (valid, readable content kept with an honest cut-off note).
   - *the reply could not be read* — a NEW branch: a JSON / syntax failure (`isUnreadableReplyError`) is distinguished from "could not reach the model" so the copy is honest about what failed.
   Every catch message now says "Nothing was written," and the pre-existing semicolons in the catch copy and the iteration-ceiling copy are removed.

4. **A truncated/unreadable reply is never partially rendered or written.** On any caught error the loop now returns `text: ''`, so a failed turn never persists a partial as the reply — the store records the honest error, and "nothing was written" is true. (Interpretation, stated: this applies to UNREADABLE/failed replies. A genuine `max_tokens` cutoff is VALID model text and is kept with a cut-off note — the brief's own "fail with honest copy about the answer being cut off" — rather than discarding a large, useful, mostly-complete answer.)

## Proofs

- Suite **921 → 926 tests** (+5). `tsc` clean, `next build` green, shell lime audit green (backend-only, no UI change).
- **Unit tests reproduce the exact production failure and the fix** (`tests/agent.test.ts`):
  - the OLD `JSON.parse(JSON.stringify(big).slice(0, 6000))` throws `/Unterminated string|position/`; `cappedProfile` returns a valid, readable, truncation-marked value that round-trips as JSON.
  - a mock whose `finalMessage()` throws `new SyntaxError('Unterminated string in JSON at position 6000')` (the exact production shape) hits the honest READ path: `result.error` contains "could not read" and NOT "could not reach", `result.text === ''` (nothing written), the copy says "Nothing was written" and carries no semicolon, and the user is told in-stream.
  - a tool that throws does not crash the turn — the turn completes with the model's reply and the tool logs `ok: false`.
  - `isUnreadableReplyError` classifies JSON/syntax failures as unreadable and a transport error as not.
- **Demo render** (ephemeral dev-Clerk TEST admin created and DELETED in-session): Ask Fox in demo answered a long question with the canned `[Demo]` reply (the chat route short-circuits before any model / workbench / Zoho call, so zero real reads), no error copy, zero horizontal overflow. The page's "not configured yet: add ANTHROPIC_API_KEY" banner is visible.

### Deferred, loud: the live model turn
"One long question completes end to end" against the real model cannot run in this build session: `ANTHROPIC_API_KEY` does not exist locally by design and the standing guardrail forbids setting it in a build session, and `knowledge_lookup` needs a browser-minted `gates` token the dev Clerk instance cannot mint. The fix is proven by the unit tests (which reproduce the exact failure and the honest path) and the demo render; the live model turn is Michael's step, the documented Agent-session precedent. Michael's acceptance: with the key set, a knowledge_lookup on a large-profile lender no longer fails the turn, and a forced read error shows "Ask Fox got a reply it could not read. Nothing was written, retry in a moment."

## Closing ritual
CLAUDE.md header note + ledger entry, `config/changelog.ts` entry, roadmap item, and this report. Committed, not pushed.
