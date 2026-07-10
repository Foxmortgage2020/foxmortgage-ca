// Pure cap logic for Ask Fox (unit-tested in tests/agent.test.ts). The
// caps are a product contract: a capped conversation says so plainly and
// requires a new thread; a turn that reaches its tool-call cap finishes
// with what it has and says so. Nothing here talks to the API.

import { MAX_MESSAGES_PER_CONVERSATION, MAX_TOOL_CALLS_PER_TURN } from '@/config/agent'

/** A conversation at or beyond the cap takes no further messages. The
 * check runs BEFORE appending the next user message, counting the two
 * rows the turn would add (user plus assistant). */
export function conversationHasRoom(messageCount: number): boolean {
  return messageCount + 2 <= MAX_MESSAGES_PER_CONVERSATION
}

export function conversationCappedCopy(): string {
  return `This thread has reached its ${MAX_MESSAGES_PER_CONVERSATION} message limit. Start a new thread to keep going; this one stays in the history.`
}

/** True when the loop may run one more tool call this turn. */
export function toolBudgetHasRoom(toolCallsThisTurn: number): boolean {
  return toolCallsThisTurn < MAX_TOOL_CALLS_PER_TURN
}

export function toolBudgetExhaustedNote(): string {
  return `Tool budget for this message is spent (${MAX_TOOL_CALLS_PER_TURN} calls). Answer with what you have, name what you could not check, and suggest a follow-up message for the rest.`
}
