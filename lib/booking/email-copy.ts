// Every word a booking sends a client. PURE — no I/O, no ambient clock, no
// Resend import — so the copy gate can sweep it and the tests can read it.
//
// THE VOICE is Michael's own, first person, the way the investor onboarding mail
// already speaks: warm, short sentences, no jargon, signed off as Mortgage Agent
// Level 2. The gate on every string here: grade-6 words, no dashes of any kind,
// no semicolons, no exclamation points, contractions are fine, and never the
// word "broker".
//
// TIMES ARE RENDERED IN THE CLIENT'S OWN TIMEZONE, always, with the zone named
// in words. A client in Vancouver who booked a nine o'clock Toronto slot reads
// "6:00 AM" and the reason why, rather than a time that looks wrong.

export interface BookingMailFacts {
  clientName: string
  clientEmail: string
  clientPhoneDisplay: string
  clientTimezone: string | null
  hostName: string
  hostTimezone: string
  eventName: string
  durationMinutes: number
  startUtc: string
  endUtc: string
  manageUrl: string | null
  hostPhoneDisplay: string
  hostEmail: string
  /** Only set on a reschedule, so the mail can name what moved. */
  previousStartUtc?: string | null
}

export type BookingMailKind = 'booked' | 'rescheduled' | 'cancelled' | 'reminder'

// ─── Time rendering ──────────────────────────────────────────────────────────

/** The timezone the client reads in. Falls back to the host's. */
export function readerZone(facts: Pick<BookingMailFacts, 'clientTimezone' | 'hostTimezone'>): string {
  return facts.clientTimezone || facts.hostTimezone
}

export function fmtMailDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

export function fmtMailTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

/** "Tuesday, July 28, 2026 at 2:00 PM" plus a plain-words zone line. */
export function whenLine(iso: string, tz: string): string {
  return `${fmtMailDay(iso, tz)} at ${fmtMailTime(iso, tz)}`
}

/** "America/Toronto" reads as "Toronto time" to a person. */
export function zoneWords(tz: string): string {
  const city = tz.split('/').pop() ?? tz
  return `${city.replace(/_/g, ' ')} time`
}

// ─── First name ──────────────────────────────────────────────────────────────

/** The greeting name. Falls back to the whole string, then to a plain hello. */
export function greetingName(fullName: string): string {
  const first = String(fullName || '').trim().split(/\s+/)[0]
  return first || 'there'
}

// ─── The client emails ───────────────────────────────────────────────────────

export interface BuiltMail {
  subject: string
  text: string
}

function signOff(facts: BookingMailFacts): string[] {
  return [
    '',
    'Mike Fox',
    'Mortgage Agent, Level 2',
    'Fox Mortgage',
    `${facts.hostPhoneDisplay}`,
  ]
}

function changeLines(facts: BookingMailFacts): string[] {
  if (!facts.manageUrl) {
    return [
      '',
      `Need to change it or cancel? Just reply to this email or call me at ${facts.hostPhoneDisplay}.`,
    ]
  }
  return [
    '',
    'Need to change it or cancel? Use this link and pick whatever works better:',
    facts.manageUrl,
  ]
}

export function buildClientMail(kind: BookingMailKind, facts: BookingMailFacts): BuiltMail {
  const tz = readerZone(facts)
  const when = whenLine(facts.startUtc, tz)
  const zone = zoneWords(tz)
  const hi = `Hi ${greetingName(facts.clientName)},`

  if (kind === 'cancelled') {
    return {
      subject: `Cancelled: your ${facts.eventName.toLowerCase()} with Mike Fox`,
      text: [
        hi,
        '',
        `Your ${facts.eventName.toLowerCase()} on ${when} is cancelled. You do not need to do anything.`,
        '',
        'If that was a mistake, or you want to pick a new time, just reply to this email or give me a call.',
        `You can reach me at ${facts.hostPhoneDisplay} or ${facts.hostEmail}.`,
        ...signOff(facts),
      ].join('\n'),
    }
  }

  if (kind === 'rescheduled') {
    const moved = facts.previousStartUtc
      ? `We moved it from ${whenLine(facts.previousStartUtc, tz)}.`
      : 'We moved it to a new time.'
    return {
      subject: `Moved: your ${facts.eventName.toLowerCase()} is now ${fmtMailDay(facts.startUtc, tz)}`,
      text: [
        hi,
        '',
        `Your ${facts.eventName.toLowerCase()} is now on ${when}, ${zone}. ${moved}`,
        '',
        `I'll call you at ${facts.clientPhoneDisplay}. It should take about ${facts.durationMinutes} minutes.`,
        '',
        'The updated appointment is attached, so you can add it to your calendar.',
        ...changeLines(facts),
        ...signOff(facts),
      ].join('\n'),
    }
  }

  if (kind === 'reminder') {
    return {
      subject: `Tomorrow: your ${facts.eventName.toLowerCase()} with Mike Fox`,
      text: [
        hi,
        '',
        `This is a quick reminder about your ${facts.eventName.toLowerCase()} tomorrow, ${when}, ${zone}.`,
        '',
        `I'll call you at ${facts.clientPhoneDisplay}. It should take about ${facts.durationMinutes} minutes.`,
        '',
        'If you think of anything you want to cover, just reply here and I will have it ready.',
        ...changeLines(facts),
        ...signOff(facts),
      ].join('\n'),
    }
  }

  return {
    subject: `You're booked: ${facts.eventName.toLowerCase()} on ${fmtMailDay(facts.startUtc, tz)}`,
    text: [
      hi,
      '',
      `You're booked in for a ${facts.eventName.toLowerCase()} on ${when}, ${zone}.`,
      '',
      `I'll call you at ${facts.clientPhoneDisplay}. It should take about ${facts.durationMinutes} minutes, and there is nothing you need to set up.`,
      '',
      'The appointment is attached, so you can add it to your calendar in one tap.',
      ...changeLines(facts),
      '',
      'Looking forward to it.',
      ...signOff(facts),
    ].join('\n'),
  }
}

// ─── The note to Michael ─────────────────────────────────────────────────────
// Internal, so it carries the operational detail a client email would not: the
// number to ring, what they wrote, and whether they opted in.

export function buildHostMail(
  kind: BookingMailKind,
  facts: BookingMailFacts,
  extra: { notes: string | null; answers: Record<string, string>; smsConsent: boolean; calendarWritten: boolean },
): BuiltMail {
  const hostWhen = whenLine(facts.startUtc, facts.hostTimezone)
  const clientTz = readerZone(facts)
  const verb = kind === 'cancelled' ? 'Cancelled' : kind === 'rescheduled' ? 'Moved' : 'New booking'
  const lines = [
    `${verb}: ${facts.eventName} with ${facts.clientName}`,
    '',
    `When: ${hostWhen} (${zoneWords(facts.hostTimezone)})`,
  ]
  if (clientTz !== facts.hostTimezone) {
    lines.push(`Their time: ${whenLine(facts.startUtc, clientTz)} (${zoneWords(clientTz)})`)
  }
  lines.push(
    `Call them at: ${facts.clientPhoneDisplay}`,
    `Email: ${facts.clientEmail}`,
    `Length: ${facts.durationMinutes} minutes`,
  )
  for (const [key, value] of Object.entries(extra.answers)) {
    if (value) lines.push(`${key}: ${value}`)
  }
  if (extra.notes) lines.push('', 'What they wrote:', extra.notes)
  lines.push(
    '',
    extra.smsConsent
      ? 'They opted in to texts and emails.'
      : 'They did not opt in to texts and emails.',
    extra.calendarWritten
      ? 'The event is on your calendar.'
      : 'The calendar entry did not land yet. It is queued for retry.',
  )
  return {
    subject: `[booking] ${verb.toLowerCase()}: ${facts.clientName}, ${fmtMailDay(facts.startUtc, facts.hostTimezone)}`,
    text: lines.join('\n'),
  }
}

// ─── The calendar entry body ─────────────────────────────────────────────────
// What Michael sees when he opens the event. The phone number is the point.

export function buildCalendarDescription(
  facts: BookingMailFacts,
  extra: { notes: string | null; answers: Record<string, string>; smsConsent: boolean },
): string {
  const lines = [
    `${facts.eventName} with ${facts.clientName}`,
    '',
    `Call them at ${facts.clientPhoneDisplay}`,
    `Email ${facts.clientEmail}`,
  ]
  const clientTz = readerZone(facts)
  if (clientTz !== facts.hostTimezone) {
    lines.push(`Their time ${whenLine(facts.startUtc, clientTz)} (${zoneWords(clientTz)})`)
  }
  for (const [key, value] of Object.entries(extra.answers)) {
    if (value) lines.push(`${key}: ${value}`)
  }
  if (extra.notes) lines.push('', 'What they wrote:', extra.notes)
  lines.push(
    '',
    extra.smsConsent ? 'They said yes to updates by text and email.' : 'They did not opt in to updates.',
    'Booked on foxmortgage.ca',
  )
  return lines.join('\n')
}
