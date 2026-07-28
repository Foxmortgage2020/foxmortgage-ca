// iCalendar (RFC 5545) generation for booking confirmations. PURE: every input
// including the clock is an argument, so the whole thing is node-testable.
//
// WHY HAND-ROLLED: this repo vendors no calendar library and deliberately keeps
// its dependency list short. A VEVENT is a small, well-specified text format and
// the two things that actually break it are line folding and text escaping, both
// of which are handled here and tested.
//
// THE SHAPE, and each choice is deliberate:
//
//   * METHOD:REQUEST with an ORGANIZER and an ATTENDEE, not METHOD:PUBLISH.
//     REQUEST is what makes a mail client show the event inline with a real
//     calendar card, and it is what lets a later METHOD:CANCEL actually REMOVE
//     the event from the client's calendar rather than leaving a ghost.
//   * A STABLE UID derived from the booking id. The same booking always emits
//     the same UID, so a reschedule UPDATES the client's calendar entry instead
//     of adding a second one beside it.
//   * SEQUENCE rises with every change. A calendar client ignores an update
//     whose SEQUENCE is not higher than the copy it already holds, so a
//     reschedule that forgot to bump this would silently do nothing.
//   * NO conferencing of any kind. These are phone calls where the agent rings
//     the client, so the number goes in the LOCATION and the DESCRIPTION, and
//     there is no join link because there is nothing to join.
//   * Times are UTC (the trailing Z). The client's own timezone is rendered as
//     words in the DESCRIPTION, because a timezone name is information a person
//     reads, not something a calendar needs in order to place an event.

export type IcsMethod = 'REQUEST' | 'CANCEL'

export interface IcsEvent {
  /** Stable per booking. The booking id. */
  uid: string
  method: IcsMethod
  sequence: number
  /** ISO-8601 UTC instants. */
  startUtc: string
  endUtc: string
  stampUtc: string
  summary: string
  description: string
  location: string
  organizerName: string
  organizerEmail: string
  attendeeName: string
  attendeeEmail: string
  /** Reverse-DNS-ish product id. */
  prodId?: string
}

const DEFAULT_PRODID = '-//Fox Mortgage//Booking//EN'

/**
 * RFC 5545 TEXT escaping. Order matters: the backslash must be escaped first or
 * the escapes added afterwards get double-escaped.
 */
export function escapeIcsText(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * Content lines are folded to 75 OCTETS, not characters. A naive character fold
 * splits a multi-byte character across lines and corrupts it, which is exactly
 * the sort of thing that works in testing and breaks on the first name with an
 * accent in it. This measures in bytes and never splits inside a code point.
 */
export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const out: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Walk back off a continuation byte so a code point is never split.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    out.push(bytes.slice(start, end).toString('utf8'))
    start = end
    // Continuation lines begin with one space, which counts toward the 75.
    limit = 74
  }
  return out.join('\r\n ')
}

/** ISO-8601 UTC to the compact iCalendar form: 20260728T180000Z. */
export function toIcsStamp(iso: string): string {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) throw new Error(`ics: unparseable instant ${iso}`)
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

export function buildIcs(event: IcsEvent): string {
  const status = event.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${event.prodId ?? DEFAULT_PRODID}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${event.method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsStamp(event.stampUtc)}`,
    `DTSTART:${toIcsStamp(event.startUtc)}`,
    `DTEND:${toIcsStamp(event.endUtc)}`,
    `SEQUENCE:${Math.max(0, Math.floor(event.sequence))}`,
    `STATUS:${status}`,
    'TRANSP:OPAQUE',
    `SUMMARY:${escapeIcsText(event.summary)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
    `ORGANIZER;CN=${escapeIcsText(event.organizerName)}:mailto:${event.organizerEmail}`,
    // RSVP is false on purpose: they already chose the time on the booking page,
    // so asking them to accept an invitation would be asking twice.
    `ATTENDEE;CN=${escapeIcsText(event.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${event.attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  // CRLF is mandatory, and a trailing CRLF closes the final line properly.
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}

/** The attachment filename a mail client shows. */
export const ICS_FILENAME = 'appointment.ics'

/** Base64 for the Resend attachment field. */
export function icsToBase64(ics: string): string {
  return Buffer.from(ics, 'utf8').toString('base64')
}
