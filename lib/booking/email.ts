// Booking email. SERVER-ONLY. Resend, plain text, with the appointment attached
// as an ics so a client can add it to their calendar in one tap.
//
// NEVER THROWS TO A CALLER. A booking is real once the row is committed, so a
// mail failure must never fail a confirm, a reschedule, or a cancel. Every
// function here returns a result and logs; the caller carries on.
//
// The client mail is sent FROM Michael with reply-to Michael, matching the
// investor onboarding precedent, because a client replying to a confirmation
// should reach a person and not a noreply box.

import { Resend } from 'resend'
import {
  BOOKING_HOST_INBOX,
  BOOKING_MAIL_FROM,
  BOOKING_MAIL_REPLY_TO,
  BOOKING_SITE_ORIGIN,
} from '@/config/booking'
import { CONTACT } from '@/lib/contact'
import {
  buildCalendarDescription,
  buildClientMail,
  buildHostMail,
  readerZone,
  whenLine,
  zoneWords,
  type BookingMailFacts,
  type BookingMailKind,
} from '@/lib/booking/email-copy'
import { ICS_FILENAME, buildIcs, icsToBase64 } from '@/lib/booking/ics'

export interface BookingMailInput {
  kind: BookingMailKind
  bookingId: string
  facts: BookingMailFacts
  notes: string | null
  answers: Record<string, string>
  smsConsent: boolean
  /** Rises with each change so a calendar client accepts the update. */
  sequence: number
  /** Raw token. Present only when we hold it, which is at mint time. */
  rescheduleToken?: string | null
  calendarWritten?: boolean
  now?: Date
}

export function manageUrlFor(token: string | null | undefined): string | null {
  if (!token) return null
  return `${BOOKING_SITE_ORIGIN}/book/manage/${token}`
}

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('[booking-mail] RESEND_API_KEY is not set, no mail sent')
    return null
  }
  return new Resend(key)
}

export interface MailOutcome {
  clientSent: boolean
  hostSent: boolean
  clientMessageId: string | null
}

/**
 * Send the client confirmation (with the ics) and the note to Michael.
 * Both are best effort and independent: Michael still hears about a booking
 * even if the client's mail bounces.
 */
export async function sendBookingMail(input: BookingMailInput): Promise<MailOutcome> {
  const out: MailOutcome = { clientSent: false, hostSent: false, clientMessageId: null }
  const resend = resendClient()
  if (!resend) return out

  const now = input.now ?? new Date()
  const facts: BookingMailFacts = {
    ...input.facts,
    manageUrl: input.facts.manageUrl ?? manageUrlFor(input.rescheduleToken),
  }

  // ── The client ──
  try {
    const mail = buildClientMail(input.kind, facts)
    const tz = readerZone(facts)
    const ics = buildIcs({
      uid: `booking-${input.bookingId}@foxmortgage.ca`,
      method: input.kind === 'cancelled' ? 'CANCEL' : 'REQUEST',
      sequence: input.sequence,
      startUtc: facts.startUtc,
      endUtc: facts.endUtc,
      stampUtc: now.toISOString(),
      summary: `${facts.eventName} with ${facts.hostName}`,
      description: [
        `${facts.hostName} will call you at ${facts.clientPhoneDisplay}.`,
        `This is ${whenLine(facts.startUtc, tz)} in ${zoneWords(tz)}.`,
        facts.manageUrl ? `Change or cancel: ${facts.manageUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      location: `Phone call to ${facts.clientPhoneDisplay}`,
      organizerName: facts.hostName,
      organizerEmail: BOOKING_MAIL_REPLY_TO,
      attendeeName: facts.clientName,
      attendeeEmail: facts.clientEmail,
    })

    const { data, error } = await resend.emails.send({
      from: BOOKING_MAIL_FROM,
      to: facts.clientEmail,
      replyTo: BOOKING_MAIL_REPLY_TO,
      subject: mail.subject,
      text: mail.text,
      attachments: [{ filename: ICS_FILENAME, content: icsToBase64(ics) }],
    })
    if (error) {
      console.error(`[booking-mail] client ${input.kind} failed`, error)
    } else {
      out.clientSent = true
      out.clientMessageId = data?.id ?? null
    }
  } catch (err) {
    console.error(`[booking-mail] client ${input.kind} threw`, err)
  }

  // ── Michael ──
  try {
    const mail = buildHostMail(input.kind, facts, {
      notes: input.notes,
      answers: input.answers,
      smsConsent: input.smsConsent,
      calendarWritten: input.calendarWritten ?? false,
    })
    const { error } = await resend.emails.send({
      from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
      to: BOOKING_HOST_INBOX,
      replyTo: facts.clientEmail,
      subject: mail.subject,
      text: mail.text,
    })
    if (error) console.error(`[booking-mail] host ${input.kind} failed`, error)
    else out.hostSent = true
  } catch (err) {
    console.error(`[booking-mail] host ${input.kind} threw`, err)
  }

  return out
}

/** The reminder goes to the client only. Michael does not need a nudge about
 *  his own day, he has the calendar. */
export async function sendReminderMail(input: {
  bookingId: string
  facts: BookingMailFacts
}): Promise<boolean> {
  const resend = resendClient()
  if (!resend) return false
  try {
    const mail = buildClientMail('reminder', input.facts)
    const { error } = await resend.emails.send({
      from: BOOKING_MAIL_FROM,
      to: input.facts.clientEmail,
      replyTo: BOOKING_MAIL_REPLY_TO,
      subject: mail.subject,
      text: mail.text,
    })
    if (error) {
      console.error('[booking-mail] reminder failed', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[booking-mail] reminder threw', err)
    return false
  }
}

/** Shared fact-builder so the mail, the ics, and the calendar body cannot drift. */
export function factsFrom(input: {
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
  manageUrl?: string | null
  previousStartUtc?: string | null
}): BookingMailFacts {
  return {
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientPhoneDisplay: input.clientPhoneDisplay,
    clientTimezone: input.clientTimezone,
    hostName: input.hostName,
    hostTimezone: input.hostTimezone,
    eventName: input.eventName,
    durationMinutes: input.durationMinutes,
    startUtc: input.startUtc,
    endUtc: input.endUtc,
    manageUrl: input.manageUrl ?? null,
    hostPhoneDisplay: CONTACT.phone.display,
    hostEmail: CONTACT.email.address,
    previousStartUtc: input.previousStartUtc ?? null,
  }
}

export { buildCalendarDescription }
