// Booking form validation. PURE — no I/O, no env, no clock beyond what is passed
// in. The route calls this before it touches the database, and the client calls
// the same rules for inline feedback, so the two can never disagree about what a
// valid booking is.
//
// PHONE IS REQUIRED, and that is the product decision, not an oversight: these
// are phone calls where the agent rings the client. A booking without a number is
// a booking nobody can keep.
//
// Every message here is client-facing copy and follows the gate: grade-6 words,
// no dashes of any kind, no semicolons, no exclamation points, contractions fine,
// and never the word "broker".

import type { EventType, IntakeQuestion } from '@/lib/booking/types'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface BookingFormInput {
  name?: unknown
  email?: unknown
  phone?: unknown
  notes?: unknown
  timezone?: unknown
  smsConsent?: unknown
  answers?: unknown
  start?: unknown
  company?: unknown // honeypot
}

export interface CleanBooking {
  name: string
  email: string
  phone: string
  phoneDisplay: string
  notes: string | null
  timezone: string | null
  smsConsent: boolean
  answers: Record<string, string>
  start: string
}

export type ValidationResult =
  | { ok: true; value: CleanBooking }
  | { ok: false; errors: Record<string, string> }

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/**
 * North American number handling. Keeps the digits, accepts an optional leading
 * country code, and refuses anything that cannot be dialled. Returns both the
 * e164 form for storage and a readable form for the confirmation.
 */
export function normalizePhone(raw: unknown): { e164: string; display: string } | null {
  const digits = (typeof raw === 'string' ? raw : '').replace(/\D+/g, '')
  if (digits.length === 0) return null
  let ten = digits
  if (ten.length === 11 && ten.startsWith('1')) ten = ten.slice(1)
  if (ten.length !== 10) return null
  // Area code and exchange code cannot start with 0 or 1 in the North American
  // plan, so this catches a mistyped number rather than accepting nonsense.
  if (/^[01]/.test(ten) || /^[01]/.test(ten.slice(3))) return null
  return {
    e164: `+1${ten}`,
    display: `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`,
  }
}

/** A plausible IANA zone name. Stored for the confirmation, never trusted for math. */
function cleanTimezone(raw: unknown): string | null {
  const tz = str(raw, 64)
  if (!tz) return null
  return /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+){0,2}$/.test(tz) ? tz : null
}

export function isHoneypotFilled(input: BookingFormInput): boolean {
  return str(input.company, 200).length > 0
}

function validateAnswers(
  questions: IntakeQuestion[],
  raw: unknown,
  errors: Record<string, string>,
): Record<string, string> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const answers: Record<string, string> = {}
  for (const q of questions) {
    const value = str(source[q.key], q.type === 'textarea' ? 2000 : 300)
    if (!value) {
      if (q.required) errors[`answers.${q.key}`] = 'Please answer this one.'
      continue
    }
    if (q.type === 'select' && q.options.length > 0 && !q.options.includes(value)) {
      errors[`answers.${q.key}`] = 'Please pick one of the choices.'
      continue
    }
    answers[q.key] = value
  }
  return answers
}

/**
 * Validate a submitted booking form against its event type.
 *
 * The honeypot is NOT checked here — the route checks it first and returns a
 * quiet success, so a bot never learns which field gave it away.
 */
export function validateBooking(input: BookingFormInput, eventType: EventType): ValidationResult {
  const errors: Record<string, string> = {}

  const name = str(input.name, 120)
  if (!name) errors.name = 'Please add your name.'
  else if (name.length < 2) errors.name = 'Please add your full name.'

  const email = str(input.email, 320)
  if (!email) errors.email = 'Please add your email.'
  else if (!EMAIL_RE.test(email)) errors.email = 'That email does not look right.'

  const phone = normalizePhone(input.phone)
  if (!str(input.phone, 50)) errors.phone = 'Please add a phone number so we can call you.'
  else if (!phone) errors.phone = 'That number does not look right. Please use 10 digits.'

  const start = str(input.start, 40)
  if (!start) errors.start = 'Please pick a time.'
  else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(start)) errors.start = 'Please pick a time.'

  const answers = validateAnswers(eventType.intakeQuestions, input.answers, errors)

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name,
      email,
      phone: (phone as { e164: string }).e164,
      phoneDisplay: (phone as { display: string }).display,
      notes: str(input.notes, 2000) || null,
      timezone: cleanTimezone(input.timezone),
      smsConsent: input.smsConsent === true,
      answers,
      start,
    },
  }
}

/**
 * Plain-words copy for every reason a confirm can fail. One sentence each, and
 * each one tells the person what to do next rather than what went wrong inside.
 */
export const REFUSAL_COPY: Record<string, string> = {
  slot_taken: 'Someone just took that time. Here are the times still open.',
  slot_not_offered: 'That time is not open any more. Here are the times still open.',
  duplicate_pending: 'You already have a booking that day. Check your email for it.',
  day_full: 'That day is full. Please pick another one.',
  host_inactive: 'Booking is turned off right now. Please call or email instead.',
  event_inactive: 'That kind of meeting is not open for booking right now.',
  bad_range: 'That time did not work. Please pick another one.',
  calendar_unreadable: 'We cannot show times right now. Please call or email and we will sort it out.',
  rate_limited: 'That is a lot of tries in a row. Please wait a minute and try again.',
  demo_mode: 'This is a demo. Nothing is booked here.',
  store_unavailable: 'We could not save that just now. Please call or email and we will book it for you.',
  not_found: 'We could not find that booking. The link may be old.',
  already_cancelled: 'That booking is already cancelled. There is nothing left to do.',
  not_active: 'That booking is not open any more. Please call or email if you need a new time.',
  too_late: 'That one is too close to now to change online. Please call and we will sort it out.',
  unknown: 'We could not book that time. Please call or email and we will sort it out.',
}

export function refusalCopy(reason: string): string {
  return REFUSAL_COPY[reason] ?? REFUSAL_COPY.unknown
}
