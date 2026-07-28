// Every word a booking sends a client, swept against the copy gate, plus the
// timezone rules that decide whether the time in the email is the time the
// person will actually be sitting by the phone.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildCalendarDescription,
  buildClientMail,
  buildHostMail,
  fmtMailDay,
  fmtMailTime,
  greetingName,
  readerZone,
  whenLine,
  zoneWords,
  type BookingMailFacts,
  type BookingMailKind,
} from '@/lib/booking/email-copy'
import { CONSENT_LANGUAGE } from '@/lib/booking/engine'

const KINDS: BookingMailKind[] = ['booked', 'rescheduled', 'cancelled', 'reminder']

function facts(partial: Partial<BookingMailFacts> = {}): BookingMailFacts {
  return {
    clientName: 'Sofia Ricci',
    clientEmail: 'sofia@example.com',
    clientPhoneDisplay: '(647) 555-0142',
    clientTimezone: 'America/Toronto',
    hostName: 'Michael Fox',
    hostTimezone: 'America/Toronto',
    eventName: 'Discovery call',
    durationMinutes: 15,
    startUtc: '2026-07-28T18:00:00Z',
    endUtc: '2026-07-28T18:15:00Z',
    manageUrl: 'https://foxmortgage.ca/book/manage/abc',
    hostPhoneDisplay: '226-770-8880',
    hostEmail: 'mfox@foxmortgage.ca',
    previousStartUtc: '2026-07-27T18:00:00Z',
    ...partial,
  }
}

// ─── The copy gate ───────────────────────────────────────────────────────────

const BANNED: Array<[string, RegExp]> = [
  ['em dash', /—/],
  ['en dash', /–/],
  ['semicolon', /;/],
  ['exclamation point', /!/],
]

function offenders(text: string): string[] {
  const out: string[] = []
  for (const [label, re] of BANNED) if (re.test(text)) out.push(label)
  if (/\bbrokers?\b/i.test(text)) out.push('the word broker')
  return out
}

describe('client mail passes the copy gate', () => {
  it('every kind, subject and body', () => {
    const bad: string[] = []
    for (const kind of KINDS) {
      const mail = buildClientMail(kind, facts())
      for (const o of offenders(mail.subject)) bad.push(`${kind} subject: ${o}`)
      for (const o of offenders(mail.text)) bad.push(`${kind} body: ${o}`)
    }
    expect(bad).toEqual([])
  })

  it('holds up with no manage link and a cross timezone client', () => {
    const bad: string[] = []
    for (const kind of KINDS) {
      const mail = buildClientMail(kind, facts({ manageUrl: null, clientTimezone: 'America/Vancouver' }))
      for (const o of offenders(mail.subject)) bad.push(`${kind} subject: ${o}`)
      for (const o of offenders(mail.text)) bad.push(`${kind} body: ${o}`)
    }
    expect(bad).toEqual([])
  })

  it('the note to Michael and the calendar body are clean too', () => {
    const extra = { notes: 'Looking at a renewal', answers: { 'What are you working on?': 'Renewing my mortgage' }, smsConsent: true }
    const bad: string[] = []
    for (const kind of KINDS) {
      const mail = buildHostMail(kind, facts(), { ...extra, calendarWritten: true })
      for (const o of offenders(mail.subject)) bad.push(`host ${kind} subject: ${o}`)
      for (const o of offenders(mail.text)) bad.push(`host ${kind} body: ${o}`)
    }
    for (const o of offenders(buildCalendarDescription(facts(), extra))) bad.push(`calendar: ${o}`)
    expect(bad).toEqual([])
  })

  it('is not vacuous, it really is reading the copy', () => {
    const mail = buildClientMail('booked', facts())
    expect(mail.text).toContain('Mike Fox')
    expect(mail.text).toContain('Mortgage Agent, Level 2')
    expect(mail.text).toContain('(647) 555-0142')
  })
})

// ─── What the mail actually says ─────────────────────────────────────────────

describe('client mail content', () => {
  it('tells them Michael will call, on every kind that is still happening', () => {
    for (const kind of ['booked', 'rescheduled', 'reminder'] as BookingMailKind[]) {
      expect(buildClientMail(kind, facts()).text).toContain("I'll call you at (647) 555-0142")
    }
  })

  it('renders the time in the CLIENT timezone, not the host one', () => {
    // 18:00Z is 2:00 PM in Toronto and 11:00 AM in Vancouver.
    const toronto = buildClientMail('booked', facts({ clientTimezone: 'America/Toronto' }))
    const vancouver = buildClientMail('booked', facts({ clientTimezone: 'America/Vancouver' }))
    expect(toronto.text).toContain('2:00 PM')
    expect(vancouver.text).toContain('11:00 AM')
    expect(vancouver.text).toContain('Vancouver time')
  })

  it('falls back to the host timezone when the client did not give one', () => {
    expect(readerZone({ clientTimezone: null, hostTimezone: 'America/Toronto' })).toBe('America/Toronto')
    const mail = buildClientMail('booked', facts({ clientTimezone: null }))
    expect(mail.text).toContain('2:00 PM')
  })

  it('names what moved on a reschedule', () => {
    const mail = buildClientMail('rescheduled', facts())
    expect(mail.text).toContain('We moved it from')
    expect(mail.text).toContain('July 27')
  })

  it('does not promise a call on a cancellation', () => {
    const mail = buildClientMail('cancelled', facts())
    expect(mail.text).toContain('cancelled')
    expect(mail.text).not.toContain("I'll call you at")
  })

  it('offers the manage link when there is one and the phone when there is not', () => {
    expect(buildClientMail('booked', facts()).text).toContain('https://foxmortgage.ca/book/manage/abc')
    const noLink = buildClientMail('booked', facts({ manageUrl: null }))
    expect(noLink.text).toContain('226-770-8880')
    expect(noLink.text).not.toContain('/book/manage/')
  })
})

describe('the note to Michael', () => {
  it('carries the number to ring and what they wrote', () => {
    const mail = buildHostMail('booked', facts(), {
      notes: 'Renewing in October',
      answers: { 'What are you working on?': 'Renewing my mortgage' },
      smsConsent: false,
      calendarWritten: false,
    })
    expect(mail.text).toContain('Call them at: (647) 555-0142')
    expect(mail.text).toContain('Renewing in October')
    expect(mail.text).toContain('They did not opt in')
    expect(mail.text).toContain('did not land yet')
  })

  it('shows both timezones only when they differ', () => {
    const same = buildHostMail('booked', facts(), { notes: null, answers: {}, smsConsent: true, calendarWritten: true })
    expect(same.text).not.toContain('Their time:')
    const diff = buildHostMail('booked', facts({ clientTimezone: 'America/Vancouver' }), {
      notes: null,
      answers: {},
      smsConsent: true,
      calendarWritten: true,
    })
    expect(diff.text).toContain('Their time:')
  })
})

describe('time helpers', () => {
  it('formats a day and a time', () => {
    expect(fmtMailDay('2026-07-28T18:00:00Z', 'America/Toronto')).toBe('Tuesday, July 28, 2026')
    expect(fmtMailTime('2026-07-28T18:00:00Z', 'America/Toronto')).toBe('2:00 PM')
    expect(whenLine('2026-07-28T18:00:00Z', 'America/Toronto')).toBe('Tuesday, July 28, 2026 at 2:00 PM')
  })

  it('turns a zone id into words a person reads', () => {
    expect(zoneWords('America/Toronto')).toBe('Toronto time')
    expect(zoneWords('America/New_York')).toBe('New York time')
  })

  it('greets by first name and never with an empty space', () => {
    expect(greetingName('Sofia Ricci')).toBe('Sofia')
    expect(greetingName('Sofia')).toBe('Sofia')
    expect(greetingName('   ')).toBe('there')
    expect(greetingName('')).toBe('there')
  })
})

// ─── Consent wording ─────────────────────────────────────────────────────────

describe('the consent record matches what was on screen', () => {
  it('CONSENT_LANGUAGE is exactly the checkbox label the client ticked', () => {
    // What gets stored on the Contact as the consent record has to be the
    // sentence that was actually shown, not a paraphrase of it. If someone edits
    // the checkbox copy without editing the constant, this fails.
    const src = readFileSync('app/book/[host]/[eventType]/BookingFlow.tsx', 'utf8')
    const collapsed = src.replace(/\s+/g, ' ')
    const expected = CONSENT_LANGUAGE.replace(/\s+/g, ' ')
    expect(collapsed).toContain(expected)
  })

  it('the consent sentence itself passes the copy gate', () => {
    expect(offenders(CONSENT_LANGUAGE)).toEqual([])
  })
})
