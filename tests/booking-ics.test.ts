// The ics an appointment email attaches. Pure, so every rule that decides
// whether a calendar client accepts the file is proven here rather than in an
// inbox.

import { describe, it, expect } from 'vitest'
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  icsToBase64,
  toIcsStamp,
  type IcsEvent,
} from '@/lib/booking/ics'

function event(partial: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: 'booking-abc-123@foxmortgage.ca',
    method: 'REQUEST',
    sequence: 0,
    startUtc: '2026-07-28T18:00:00Z',
    endUtc: '2026-07-28T18:15:00Z',
    stampUtc: '2026-07-27T22:00:00Z',
    summary: 'Discovery call with Michael Fox',
    description: 'Michael Fox will call you at (647) 555-0142.',
    location: 'Phone call to (647) 555-0142',
    organizerName: 'Michael Fox',
    organizerEmail: 'mfox@foxmortgage.ca',
    attendeeName: 'Sofia Ricci',
    attendeeEmail: 'sofia@example.com',
    ...partial,
  }
}

describe('escapeIcsText', () => {
  it('escapes the four characters the spec reserves', () => {
    expect(escapeIcsText('a;b,c\\d')).toBe('a\\;b\\,c\\\\d')
  })

  it('escapes the backslash first so escapes are not double escaped (regression)', () => {
    // Escaping the semicolon before the backslash would turn ';' into '\\\\;'.
    expect(escapeIcsText(';')).toBe('\\;')
    expect(escapeIcsText('\\')).toBe('\\\\')
  })

  it('turns real newlines into the literal escape', () => {
    expect(escapeIcsText('one\ntwo')).toBe('one\\ntwo')
    expect(escapeIcsText('one\r\ntwo')).toBe('one\\ntwo')
  })
})

describe('foldIcsLine', () => {
  it('leaves a short line alone', () => {
    expect(foldIcsLine('SUMMARY:hello')).toBe('SUMMARY:hello')
  })

  it('folds a long line with a leading space on continuations', () => {
    const folded = foldIcsLine('X:' + 'a'.repeat(200))
    const parts = folded.split('\r\n')
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts.slice(1)) expect(p.startsWith(' ')).toBe(true)
    // Unfolding restores the original exactly.
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe('X:' + 'a'.repeat(200))
  })

  it('keeps every fold within 75 octets', () => {
    const folded = foldIcsLine('X:' + 'b'.repeat(300))
    for (const p of folded.split('\r\n')) {
      expect(Buffer.from(p, 'utf8').length).toBeLessThanOrEqual(75)
    }
  })

  it('never splits a multi byte character (regression)', () => {
    // A naive fold measured in characters corrupts an accented name at the
    // boundary. This is the case that works in testing and breaks on a real one.
    const line = 'SUMMARY:' + 'é'.repeat(120)
    const folded = foldIcsLine(line)
    const rebuilt = folded
      .split('\r\n')
      .map((p, i) => (i === 0 ? p : p.slice(1)))
      .join('')
    expect(rebuilt).toBe(line)
    expect(rebuilt).not.toContain('�')
  })
})

describe('toIcsStamp', () => {
  it('compacts an instant to the iCalendar UTC form', () => {
    expect(toIcsStamp('2026-07-28T18:00:00Z')).toBe('20260728T180000Z')
    expect(toIcsStamp('2026-07-28T18:00:00.123Z')).toBe('20260728T180000Z')
  })

  it('throws on something unparseable rather than emitting a broken file', () => {
    expect(() => toIcsStamp('whenever')).toThrow()
  })
})

/**
 * Undo the line folding, the way a calendar client does before reading a value.
 * Assertions about CONTENT must run against this, because a real line long
 * enough to matter is exactly the line that gets folded.
 */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '')
}

describe('buildIcs', () => {
  it('produces a well formed VEVENT with CRLF endings', () => {
    const ics = buildIcs(event())
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('END:VEVENT')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).not.toContain('\n\n')
  })

  it('carries the times as UTC instants', () => {
    const ics = buildIcs(event())
    expect(ics).toContain('DTSTART:20260728T180000Z')
    expect(ics).toContain('DTEND:20260728T181500Z')
  })

  it('names Michael as the organizer and the client as the attendee', () => {
    // The ATTENDEE line is longer than 75 octets and therefore folded, so this
    // reads the unfolded form the way a calendar client would.
    const ics = unfold(buildIcs(event()))
    expect(ics).toContain('ORGANIZER;CN=Michael Fox:mailto:mfox@foxmortgage.ca')
    expect(ics).toContain('mailto:sofia@example.com')
    expect(ics).toContain('RSVP=FALSE')
  })

  it('has no conferencing of any kind', () => {
    const ics = unfold(buildIcs(event()))
    for (const banned of ['X-GOOGLE-CONFERENCE', 'teams.microsoft', 'zoom.us', 'meet.google', 'CONFERENCE']) {
      expect(ics).not.toContain(banned)
    }
  })

  it('uses the same UID for a booking whatever changes, so a move updates rather than duplicates', () => {
    const first = buildIcs(event({ sequence: 0 }))
    const moved = buildIcs(event({ sequence: 1, startUtc: '2026-07-29T18:00:00Z', endUtc: '2026-07-29T18:15:00Z' }))
    const uidOf = (s: string) => /UID:(.+)\r\n/.exec(s)?.[1]
    expect(uidOf(first)).toBe(uidOf(moved))
    expect(uidOf(first)).toBeTruthy()
  })

  it('raises SEQUENCE on a change, which is what makes a calendar accept the update', () => {
    expect(buildIcs(event({ sequence: 0 }))).toContain('SEQUENCE:0')
    expect(buildIcs(event({ sequence: 3 }))).toContain('SEQUENCE:3')
  })

  it('marks a cancellation so the event is removed rather than left behind', () => {
    const ics = buildIcs(event({ method: 'CANCEL', sequence: 2 }))
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).toContain('SEQUENCE:2')
  })

  it('escapes a description that contains reserved characters', () => {
    const ics = buildIcs(event({ description: 'Call them; ask about rates, then follow up' }))
    expect(ics).toContain('\\;')
    expect(ics).toContain('\\,')
  })

  it('survives a name with an accent and a long note', () => {
    const ics = buildIcs(
      event({
        attendeeName: 'Renée Fraîcheur',
        description: 'A very long note. '.repeat(40),
      }),
    )
    expect(ics).toContain('Ren')
    expect(ics).not.toContain('�')
    for (const line of ics.split('\r\n')) {
      expect(Buffer.from(line, 'utf8').length).toBeLessThanOrEqual(75)
    }
  })

  it('round trips through base64', () => {
    const ics = buildIcs(event())
    expect(Buffer.from(icsToBase64(ics), 'base64').toString('utf8')).toBe(ics)
  })
})
