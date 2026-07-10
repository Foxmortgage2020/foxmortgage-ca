// Ask Fox configuration (Agent session). The model rides a constant with
// an env override so upgrades are a config change with a changelog note,
// like every behaviour change. Caps are the product contract: a turn
// spends at most MAX_TOOL_CALLS_PER_TURN tool calls, a conversation holds
// at most MAX_MESSAGES_PER_CONVERSATION messages (user plus assistant)
// before requiring a new thread; a capped conversation says so plainly.
//
// Runtime env vars (server-only, set on Vercel via dashboard or REST,
// never NEXT_PUBLIC): ANTHROPIC_API_KEY (required for the feature to
// answer; absent renders the honest not-configured state) and optional
// AGENT_MODEL. The standing guardrail stands: build sessions never set
// ANTHROPIC_API_KEY in subprocesses; this is a runtime product
// credential, server-side only, never client-exposed.

export const AGENT_MODEL_DEFAULT = 'claude-sonnet-4-6'

export function agentModel(): string {
  return process.env.AGENT_MODEL || AGENT_MODEL_DEFAULT
}

export const MAX_TOOL_CALLS_PER_TURN = 12
export const MAX_MESSAGES_PER_CONVERSATION = 25

// Output ceiling per turn (streaming, so no HTTP timeout concern) and a
// bound on what one user message may carry (a pasted transcript fits
// comfortably; a runaway paste does not).
export const AGENT_MAX_OUTPUT_TOKENS = 16000
export const AGENT_MAX_INPUT_CHARS = 120_000

// History replayed to the model per turn: the newest N stored messages as
// plain text. Older turns stay in FOXCA (the supervision artifact), they
// just stop riding the prompt.
export const AGENT_HISTORY_MESSAGES = 20
