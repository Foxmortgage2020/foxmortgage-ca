// The client copy gate, as code rather than as a rule written in three places.
//
// Every booking session has restated the same list in prose and then re-encoded
// it in a test: no em dash, no en dash, no semicolon, no exclamation point, and
// never the word "broker" (Michael is a Mortgage Agent, Level 2, and the word
// is a licensing distinction rather than a style preference).
//
// It lives here because session four gave Michael a text box. A meeting type's
// name and description are typed on the Availability page and rendered on the
// PUBLIC booking page, so they are client copy written by someone who is not
// thinking about a copy gate. The editor warns with these exact rules.
//
// PURE. No I/O, no imports. The tests sweep source files with it and the editor
// runs it on a keystroke, so the two can never disagree about what the gate is.

export interface CopyRule {
  label: string
  test: (text: string) => boolean
  /** What to say when it trips. Written for whoever is reading the warning. */
  problem: string
}

export const COPY_RULES: CopyRule[] = [
  { label: 'em dash', test: t => t.includes('—'), problem: 'contains an em dash.' },
  { label: 'en dash', test: t => t.includes('–'), problem: 'contains an en dash.' },
  { label: 'semicolon', test: t => t.includes(';'), problem: 'contains a semicolon.' },
  {
    label: 'exclamation point',
    test: t => t.includes('!'),
    problem: 'contains an exclamation point.',
  },
  {
    label: 'the word broker',
    test: t => /\bbrokers?\b/i.test(t),
    problem: 'uses the word broker. The title is Mortgage Agent, Level 2.',
  },
]

/** Which rules a piece of client copy trips. Empty means it passes. */
export function copyGateOffenders(text: string): string[] {
  if (!text) return []
  return COPY_RULES.filter(r => r.test(text)).map(r => r.label)
}

/** The same check, phrased for a person about to publish the words. */
export function clientCopyProblems(text: string): string[] {
  if (!text) return []
  return COPY_RULES.filter(r => r.test(text)).map(r => r.problem)
}

export function passesCopyGate(text: string): boolean {
  return copyGateOffenders(text).length === 0
}
