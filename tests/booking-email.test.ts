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
import {
  APPLICATION_SENTENCE,
  APPLICATION_URL,
  WEBSITE_URL,
  signatureTextLines,
} from '@/lib/booking/signature'
import { CONTACT } from '@/lib/contact'

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
    expect(mail.text).toContain('MICHAEL FOX')
    expect(mail.text).toContain('Mortgage Agent, Level 2')
    expect(mail.text).toContain('(647) 555-0142')
  })

  it('gates the HTML part too, which the text sweep above cannot see', () => {
    const bad: string[] = []
    for (const kind of KINDS) {
      const html = buildClientMail(kind, facts()).html ?? ''
      // Strip tags and hrefs first: a URL is not prose, and the application
      // link legitimately carries brokerName and brokerId as query parameters.
      const visible = html.replace(/<[^>]*>/g, ' ')
      for (const o of offenders(visible)) bad.push(`${kind} html: ${o}`)
    }
    expect(bad).toEqual([])
  })
})

// ─── The signature ───────────────────────────────────────────────────────────

describe("Michael's signature is on every client email, from one source", () => {
  it('all four kinds carry every signature line', () => {
    for (const kind of KINDS) {
      const mail = buildClientMail(kind, facts())
      for (const line of signatureTextLines().filter(Boolean)) {
        expect(mail.text, `${kind} is missing: ${line}`).toContain(line)
      }
    }
  })

  it('the title and the name are exactly as supplied', () => {
    const text = buildClientMail('booked', facts()).text
    expect(text).toContain('MICHAEL FOX')
    expect(text).toContain('Mortgage Agent, Level 2')
    expect(text).toContain('License M21000367')
    // Never the old sign-off, in any kind.
    for (const kind of KINDS) {
      expect(buildClientMail(kind, facts()).text).not.toContain('Mike Fox\nMortgage Agent')
    }
  })

  it('the application sentence ends in a period, never an exclamation point', () => {
    expect(APPLICATION_SENTENCE).toBe('Click HERE to start your online application.')
    expect(APPLICATION_SENTENCE).not.toContain('!')
  })

  it('HERE is a real link in the html, and the address is spelled out in the text', () => {
    const mail = buildClientMail('booked', facts())
    expect(mail.html).toContain(`href="${APPLICATION_URL}"`.replace(/&/g, '&amp;'))
    expect(mail.html).toContain('>HERE</a>')
    // Plain-text readers cannot click a word, so they get the address itself.
    expect(mail.text).toContain(APPLICATION_URL)
  })

  it('the website line links out', () => {
    const html = buildClientMail('booked', facts()).html ?? ''
    expect(html).toContain(`href="${WEBSITE_URL}"`)
    expect(html).toContain('www.foxmortgage.ca')
  })

  it('THE PHONE IS NOT WRITTEN INTO THE SIGNATURE, it comes from lib/contact.ts', () => {
    // tests/contact-number.test.ts forbids the literal anywhere but contact.ts.
    // This asserts the consequence: the signature renders the CONTACT value.
    const src = readFileSync('lib/booking/signature.ts', 'utf8')
    expect(src).toContain('CONTACT.phone.display')
    expect(src).not.toMatch(/\d{3}-\d{3}-\d{4}/)
    expect(signatureTextLines().join('\n')).toContain(CONTACT.phone.display)
  })

  it('the body and the html say the same things', () => {
    // The html is DERIVED from the text body, so a sentence cannot exist in one
    // and not the other. Spot-check the load-bearing one.
    const mail = buildClientMail('rescheduled', facts())
    expect(mail.text).toContain('The updated appointment is attached')
    expect(mail.html).toContain('The updated appointment is attached')
  })

  it('the manage link is clickable in the html', () => {
    const mail = buildClientMail('booked', facts())
    expect(mail.html).toContain('href="https://foxmortgage.ca/book/manage/abc"')
  })

  it('the note to Michael stays plain text, it is internal', () => {
    const host = buildHostMail('booked', facts(), {
      notes: null,
      answers: {},
      smsConsent: false,
      calendarWritten: true,
    })
    expect(host.html).toBeUndefined()
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
