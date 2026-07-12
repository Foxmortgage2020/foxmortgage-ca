// Ask Fox tests (Agent session). The Anthropic API is mocked through the
// loop's injectable client factory; tool execution is mocked through the
// injectable executor, so nothing here touches a network. What these
// prove: the caps enforce (acceptance 8), a capped conversation and an
// exhausted tool budget say so plainly, the not-captured contract holds
// on a stripped fixture (acceptance 3), the Dialpad-shaped CSV parses,
// and the tool surface contains no gate, send, or unconfirmed-write
// capability (acceptance 6).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  conversationCappedCopy,
  conversationHasRoom,
  toolBudgetExhaustedNote,
  toolBudgetHasRoom,
} from '@/lib/agent/limits'
import { MAX_MESSAGES_PER_CONVERSATION, MAX_TOOL_CALLS_PER_TURN, AGENT_MODEL_DEFAULT } from '@/config/agent'
import { parseCsv, parseTranscript } from '@/lib/agent/transcript'
import { AGENT_TOOLS, type AgentToolContext } from '@/lib/agent/tools'
import { runAgentTurn, type AgentStreamEvent } from '@/lib/agent/loop'
import { AGENT_SYSTEM_PROMPT, AGENT_PROMPT_VERSION } from '@/lib/agent/prompt'
import { CALL_RUBRIC, CALL_RUBRIC_VERSION } from '@/config/call-rubric'
import { FIND_CLIENT_NOTE, normalizeAgentDeal } from '@/lib/zoho-admin'

// ─── Caps (acceptance 8) ─────────────────────────────────────────────────────

describe('caps', () => {
  it('a conversation has room only while the next exchange fits inside the cap', () => {
    expect(conversationHasRoom(0)).toBe(true)
    expect(conversationHasRoom(MAX_MESSAGES_PER_CONVERSATION - 2)).toBe(true)
    expect(conversationHasRoom(MAX_MESSAGES_PER_CONVERSATION - 1)).toBe(false)
    expect(conversationHasRoom(MAX_MESSAGES_PER_CONVERSATION)).toBe(false)
  })

  it('the capped copy says so plainly with the number', () => {
    expect(conversationCappedCopy()).toContain(String(MAX_MESSAGES_PER_CONVERSATION))
    expect(conversationCappedCopy().toLowerCase()).toContain('new thread')
  })

  it('the tool budget runs out at exactly the cap', () => {
    expect(toolBudgetHasRoom(0)).toBe(true)
    expect(toolBudgetHasRoom(MAX_TOOL_CALLS_PER_TURN - 1)).toBe(true)
    expect(toolBudgetHasRoom(MAX_TOOL_CALLS_PER_TURN)).toBe(false)
    expect(toolBudgetExhaustedNote()).toContain(String(MAX_TOOL_CALLS_PER_TURN))
  })

  it('caps match the brief: 12 tool calls per message, 25 messages per conversation', () => {
    expect(MAX_TOOL_CALLS_PER_TURN).toBe(12)
    expect(MAX_MESSAGES_PER_CONVERSATION).toBe(25)
    expect(AGENT_MODEL_DEFAULT).toBe('claude-sonnet-4-6')
  })
})

// ─── Transcript parsing ──────────────────────────────────────────────────────

// Synthetic fixture in the Dialpad export shape (header-sniffed; the
// reference CSV lives on Michael's machine, so this covers the shape,
// not the file).
const DIALPAD_CSV = [
  'Name,Time,Type,Content',
  'Michael Fox,00:00:04,transcript,"Hey Nick, thanks for picking up."',
  'Nick Aitken,00:00:09,transcript,"No problem, Michael."',
  ',00:00:15,event,Call recording started',
  'Michael Fox,00:00:21,transcript,"Your mortgage matures this fall, so I wanted to walk the options."',
].join('\n')

describe('transcript parsing', () => {
  it('parses quoted CSV fields with commas', () => {
    const rows = parseCsv('a,"b, c",d\n1,"2 ""x""",3')
    expect(rows).toEqual([
      ['a', 'b, c', 'd'],
      ['1', '2 "x"', '3'],
    ])
  })

  it('parses the Dialpad-shaped CSV into speaker-labeled lines and drops event rows', () => {
    const parsed = parseTranscript(DIALPAD_CSV)
    expect(parsed.kind).toBe('csv')
    expect(parsed.lines).toHaveLength(3)
    expect(parsed.lines[0]).toEqual({
      speaker: 'Michael Fox',
      time: '00:00:04',
      text: 'Hey Nick, thanks for picking up.',
    })
    expect(parsed.normalized).toContain('Nick Aitken: No problem, Michael. [00:00:09]')
    expect(parsed.normalized).not.toContain('recording started')
  })

  it('falls back to plain text for a paste without a CSV header', () => {
    const parsed = parseTranscript('Michael: hello there\nNick: hi')
    expect(parsed.kind).toBe('text')
    expect(parsed.lines).toHaveLength(2)
    expect(parsed.normalized).toContain('Michael: hello there')
  })
})

// ─── The tool surface (acceptance 6) ─────────────────────────────────────────

describe('tool surface', () => {
  it('is exactly the seven enumerated tools', () => {
    expect(AGENT_TOOLS.map(t => t.name).sort()).toEqual([
      'find_client',
      'get_deal_file',
      'get_open_tasks',
      'knowledge_lookup',
      'propose_task',
      'propose_zoho_update',
      'search_rates',
    ])
  })

  it('contains no gate decision, send, or unconfirmed write capability', () => {
    const banned = /send|email|sms|message_client|approve|reject|disposition|score|decide|satisf|waive/i
    for (const t of AGENT_TOOLS) {
      expect(t.name).not.toMatch(banned)
    }
    const writeTools = AGENT_TOOLS.filter(t => t.name.startsWith('propose_'))
    for (const t of writeTools) {
      expect(String(t.description)).toMatch(/confirm/i)
      expect(String(t.description)).toMatch(/NOTHING is (written|created)/)
    }
  })
})

// ─── The not-captured contract (acceptance 3) ────────────────────────────────

describe('not captured, never a guess', () => {
  it('a stripped Zoho fixture keeps its nulls; nothing fills a missing value', () => {
    // The live Aitken shape on 2026-07-10: maturity, payment, LTV, and
    // term all uncaptured.
    const stripped = normalizeAgentDeal({
      id: '7112178000001410334',
      Deal_Name: 'IFMS-F001515',
      Stage: 'Mortgage Funded',
      Mortgage_Rate: 1.99,
      Amount: 408500,
      Maturity_Date: null,
      Payment_Amount: null,
      LTV: null,
      Term_Type: null,
      Contact_Name: { name: 'Nicholas Aitken', id: '7112178000001403205' },
    })
    expect(stripped.fields.Maturity_Date).toBeNull()
    expect(stripped.fields.Payment_Amount).toBeNull()
    expect(stripped.fields.LTV).toBeNull()
    expect(stripped.fields.Term_Type).toBeNull()
    // Absent keys resolve to null too, never undefined or invented.
    expect(stripped.fields.Renewal_In_Progress).toBeNull()
    expect(stripped.fields.Amount).toBe(408500)
  })

  it('the balance question is answered by the data shape: no balance field exists', () => {
    expect(FIND_CLIENT_NOTE).toContain('no balance field')
    expect(FIND_CLIENT_NOTE).toContain('not captured')
  })

  it('the system prompt mandates grounded-or-silent and forbids the balance guess', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('GROUNDED OR SILENT')
    expect(AGENT_SYSTEM_PROMPT).toContain('not captured')
    expect(AGENT_SYSTEM_PROMPT).toContain('Never estimate a client\'s balance')
    expect(AGENT_SYSTEM_PROMPT).toContain('APPROVED MEANS APPROVED')
    expect(AGENT_SYSTEM_PROMPT).toContain('THE DESK DECIDES')
    expect(AGENT_PROMPT_VERSION).toBe(3)
  })

  it('the system prompt forbids quoting an ineligible or unconfirmed-province lender to a client (v3)', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('ELIGIBLE ONLY')
    expect(AGENT_SYSTEM_PROMPT).toContain('province_confirmed')
    expect(AGENT_SYSTEM_PROMPT).toContain('BC credit unions')
  })

  it('the system prompt mandates the open-task check before any card (v2)', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('CHECK OPEN TASKS FIRST')
    expect(AGENT_SYSTEM_PROMPT).toContain('get_open_tasks')
    expect(AGENT_SYSTEM_PROMPT).toContain('instead of proposing a duplicate')
  })
})

// ─── Rubric config ───────────────────────────────────────────────────────────

describe('call rubric', () => {
  it('is version 1 with the ten seeded items and stable unique ids', () => {
    expect(CALL_RUBRIC_VERSION).toBe(1)
    expect(CALL_RUBRIC).toHaveLength(10)
    expect(new Set(CALL_RUBRIC.map(r => r.id)).size).toBe(10)
  })

  it('rides the system prompt with its version', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(`rubric v${CALL_RUBRIC_VERSION}`)
    for (const item of CALL_RUBRIC) {
      expect(AGENT_SYSTEM_PROMPT).toContain(item.label)
    }
  })
})

// ─── The loop, with the API mocked ──────────────────────────────────────────

interface ScriptedResponse {
  stop_reason: string
  content: Array<Record<string, unknown>>
  textDeltas?: string[]
}

function mockClient(script: ScriptedResponse[] | (() => ScriptedResponse)) {
  let i = 0
  const next = () => (typeof script === 'function' ? script() : script[Math.min(i++, script.length - 1)])
  return {
    messages: {
      stream: () => {
        const response = next()
        const handlers: Record<string, (d: string) => void> = {}
        return {
          on(event: string, cb: (d: string) => void) {
            handlers[event] = cb
            return this
          },
          async finalMessage() {
            for (const d of response.textDeltas ?? []) handlers.text?.(d)
            return {
              stop_reason: response.stop_reason,
              content: response.content,
            }
          },
        }
      },
    },
  } as any
}

function testCtx(): AgentToolContext {
  return {
    workbenchAgentId: null,
    gatesToken: null,
    conversationId: '00000000-0000-0000-0000-000000000000',
    turnSeq: 2,
    viewerEmail: 'test@foxmortgage.ca',
    emitCard: () => {},
    memo: {},
  }
}

describe('agent loop (Anthropic API mocked)', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-never-used')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('streams text, executes tools through the injected executor, and finishes on end_turn', async () => {
    const events: AgentStreamEvent[] = []
    const executed: string[] = []
    const result = await runAgentTurn({
      history: [],
      userMessage: 'frame my renewal conversation with Nick Aitken',
      todayYMD: '2026-07-10',
      ctx: testCtx(),
      emit: e => events.push(e),
      clientFactory: () =>
        mockClient([
          {
            stop_reason: 'tool_use',
            textDeltas: ['Pulling the record. '],
            content: [
              { type: 'text', text: 'Pulling the record. ' },
              { type: 'tool_use', id: 'tu_1', name: 'find_client', input: { query: 'Nick Aitken' } },
            ],
          },
          {
            stop_reason: 'end_turn',
            textDeltas: ['**What we hold** rate 1.99 (Zoho Mortgage_Rate). Maturity not captured.'],
            content: [{ type: 'text', text: 'brief' }],
          },
        ]),
      executeTool: async name => {
        executed.push(name)
        return { ok: true, result: { contacts: [], deals: [], note: FIND_CLIENT_NOTE }, summary: 'mocked' }
      },
    })
    expect(executed).toEqual(['find_client'])
    expect(result.error).toBeNull()
    expect(result.text).toContain('not captured')
    expect(result.toolLog).toHaveLength(1)
    expect(result.toolLog[0]).toMatchObject({ name: 'find_client', ok: true })
    expect(events.some(e => e.type === 'tool' && e.status === 'ok')).toBe(true)
    expect(events.filter(e => e.type === 'text').length).toBeGreaterThan(0)
  })

  it('enforces the per-message tool budget and terminates a tool-hungry model (acceptance 8)', async () => {
    let executions = 0
    const result = await runAgentTurn({
      history: [],
      userMessage: 'check everything',
      todayYMD: '2026-07-10',
      ctx: testCtx(),
      emit: () => {},
      clientFactory: () =>
        mockClient(() => ({
          stop_reason: 'tool_use',
          content: [
            { type: 'tool_use', id: `tu_${Math.random()}`, name: 'find_client', input: { query: 'x' } },
          ],
        })),
      executeTool: async () => {
        executions += 1
        return { ok: true, result: {}, summary: 'mocked' }
      },
    })
    expect(executions).toBe(MAX_TOOL_CALLS_PER_TURN)
    expect(result.toolLog).toHaveLength(MAX_TOOL_CALLS_PER_TURN)
    // The turn ended with the plain ran-out message, not a crash.
    expect(result.error).toBeNull()
  })

  it('task dedup: a record with covering open tasks yields zero cards and the reference line', async () => {
    // The Part 0 acceptance fixture: the model checks get_open_tasks per
    // the v2 prompt rule, finds the follow-up already scheduled, and
    // references it instead of minting a duplicate propose_task card.
    const cardsEmitted: string[] = []
    const ctx = testCtx()
    ctx.emitCard = card => cardsEmitted.push(card.id)
    const executed: string[] = []
    const result = await runAgentTurn({
      history: [],
      userMessage: 'prep a call for Nick Aitken and set up the follow-ups',
      todayYMD: '2026-07-10',
      ctx,
      emit: () => {},
      clientFactory: () =>
        mockClient([
          {
            stop_reason: 'tool_use',
            content: [
              {
                type: 'tool_use',
                id: 'tu_tasks',
                name: 'get_open_tasks',
                input: { module: 'Potentials', record_id: '7112178000001410334' },
              },
            ],
          },
          {
            stop_reason: 'end_turn',
            textDeltas: [
              'No new card needed: your existing task covers this, due Jul 11 (Confirm maturity date with Nick).',
            ],
            content: [{ type: 'text', text: 'covered' }],
          },
        ]),
      executeTool: async name => {
        executed.push(name)
        return {
          ok: true,
          result: {
            open_tasks: [
              { subject: 'Confirm maturity date with Nick', due_date: '2026-07-11', priority: 'High', status: 'Not Started' },
            ],
            note: 'Where one of these covers an action you were about to propose, reference it with its due date instead of minting a duplicate card.',
          },
          summary: '1 open task(s) on Potentials 7112178000001410334',
        }
      },
    })
    expect(executed).toEqual(['get_open_tasks'])
    expect(cardsEmitted).toHaveLength(0)
    expect(result.error).toBeNull()
    expect(result.text).toContain('existing task covers this, due Jul 11')
  })

  it('surfaces a refusal honestly', async () => {
    const events: AgentStreamEvent[] = []
    const result = await runAgentTurn({
      history: [],
      userMessage: 'hello',
      todayYMD: '2026-07-10',
      ctx: testCtx(),
      emit: e => events.push(e),
      clientFactory: () => mockClient([{ stop_reason: 'refusal', content: [] }]),
      executeTool: async () => ({ ok: true, result: {}, summary: '' }),
    })
    expect(result.error).toContain('declined')
    expect(events.some(e => e.type === 'error')).toBe(true)
  })

  it('renders the honest not-configured state without a key', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    const events: AgentStreamEvent[] = []
    const result = await runAgentTurn({
      history: [],
      userMessage: 'hello',
      todayYMD: '2026-07-10',
      ctx: testCtx(),
      emit: e => events.push(e),
      clientFactory: () => {
        throw new Error('must not construct a client when unconfigured')
      },
      executeTool: async () => ({ ok: true, result: {}, summary: '' }),
    })
    expect(result.error).toContain('ANTHROPIC_API_KEY')
    expect(result.toolLog).toHaveLength(0)
  })
})
