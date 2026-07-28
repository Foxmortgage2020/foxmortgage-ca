'use client'

// The booking flow: pick a day, pick a time, give us your details, done.
//
// TIMES ARE ALWAYS SHOWN IN THE VISITOR'S OWN TIMEZONE. The server sends UTC
// instants and nothing else; this component reads the browser's zone and formats
// every one of them locally, and groups them by the VISITOR's calendar day, not
// the host's. Someone in Vancouver sees "Tuesday, 6:00 AM" for a nine o'clock
// Toronto slot, under Tuesday, which is what they mean by Tuesday.
//
// Copy on this page follows the client gate: grade-6 words, no dashes of any kind,
// no semicolons, no exclamation points, contractions are fine, and never the word
// "broker".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IntakeQuestion, Slot } from '@/lib/booking/types'
import BookingNotice from '@/components/booking/BookingNotice'

// CONTRAST (session three a11y pass). placeholder-gray-400 was 2.8 to 1 on
// white and failed at any size; gray-500 is 4.8 to 1 and passes. The focus ring
// is navy rather than lime because lime on white is 1.8 to 1 and a focus
// indicator nobody can see is not a focus indicator.
const INPUT =
  'w-full px-4 py-3 rounded-xl border border-gray-300 font-body text-navy placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:border-navy bg-white'
const INPUT_BAD = INPUT.replace('border-gray-300', 'border-red-600')
const SELECT = INPUT
const LABEL = 'font-body text-sm font-medium text-navy block mb-2'
const OPTIONAL = 'text-gray-600 font-normal'
const ERROR = 'font-body text-sm text-red-700 mt-1'

// focus-visible only, so a mouse click does not paint a ring but a keyboard
// user is never lost.
const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2'

// Ask for four weeks, not the event type's whole advance window. A 60 day window
// returns well over a thousand slots, which is a six figure JSON payload to ship
// and hold for a page where nobody scrolls past next month. The endpoint still
// accepts any window, so widening this later is a one number change.
const WINDOW_DAYS = 28

interface Props {
  host: string
  event: string
  hostName: string
  hostTimezone: string
  eventName: string
  durationMinutes: number
  intakeQuestions: IntakeQuestion[]
  prefillToken: string | null
  // Resolved SERVER-SIDE from the token's record ids. Never parsed from a URL,
  // never carried inside the token itself.
  prefillName: string | null
  prefillEmail: string | null
  prefillPhone: string | null
  fallbackPhone: string
  fallbackPhoneHref: string
  fallbackEmail: string
  fallbackEmailHref: string
}

type Phase = 'loading' | 'unavailable' | 'picking' | 'details' | 'done'

function visitorTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto'
  } catch {
    return 'America/Toronto'
  }
}

// en-US for anything a person reads, so a time renders "10:15 AM" the way the
// rest of the app writes it rather than en-CA's "10:15 a.m.".
function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

function fmtDayLong(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))
}

function fmtDayShort(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

/** The visitor's own calendar day for an instant, as a sortable key. */
function visitorDayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export default function BookingFlow(props: Props) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [slots, setSlots] = useState<Slot[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<{ startsAt: string } | null>(null)

  // KEYBOARD ORDER. Picking a time reveals the details form BELOW the grid, so
  // a keyboard or screen reader user who just chose 10:15 would otherwise have
  // to tab through every remaining time button to reach the form they just
  // summoned. Focus moves to the form heading instead, which is also what
  // announces that a new section appeared.
  const detailsRef = useRef<HTMLHeadingElement | null>(null)
  const pendingFocus = useRef(false)

  const [form, setForm] = useState({
    name: props.prefillName ?? '',
    email: props.prefillEmail ?? '',
    phone: props.prefillPhone ?? '',
    notes: '',
    smsConsent: false,
    company: '', // honeypot
    answers: {} as Record<string, string>,
  })

  // True when we already know who this is. Consent still starts UNTICKED, because
  // knowing someone is not the same as them agreeing to be contacted.
  const knownClient = Boolean(props.prefillName || props.prefillEmail)

  const tz = useMemo(visitorTimezone, [])

  const loadSlots = useCallback(async () => {
    setPhase('loading')
    setNotice(null)
    try {
      const res = await fetch(
        `/api/book/slots?host=${encodeURIComponent(props.host)}&event=${encodeURIComponent(props.event)}&days=${WINDOW_DAYS}`,
        { cache: 'no-store' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setNotice(data?.message ?? 'We cannot show times right now.')
        setPhase('unavailable')
        return
      }
      const list: Slot[] = Array.isArray(data.slots) ? data.slots : []
      setSlots(list)
      setPhase('picking')
    } catch {
      setNotice('We cannot show times right now.')
      setPhase('unavailable')
    }
  }, [props.host, props.event])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  // Group by the VISITOR's day.
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots) {
      const key = visitorDayKey(s.start, tz)
      const list = map.get(key)
      if (list) list.push(s)
      else map.set(key, [s])
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, list]) => ({ key, slots: list }))
  }, [slots, tz])

  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay(null)
      return
    }
    if (!selectedDay || !days.some(d => d.key === selectedDay)) {
      setSelectedDay(days[0].key)
    }
  }, [days, selectedDay])

  useEffect(() => {
    if (pendingFocus.current && detailsRef.current) {
      pendingFocus.current = false
      detailsRef.current.focus()
    }
  })

  const daySlots = days.find(d => d.key === selectedDay)?.slots ?? []

  const update =(field: 'name' | 'email' | 'phone' | 'notes' | 'company') => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  const updateAnswer = (key: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm(f => ({ ...f, answers: { ...f.answers, [key]: e.target.value } }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot || submitting) return
    setSubmitting(true)
    setErrors({})
    setNotice(null)
    try {
      const res = await fetch('/api/book/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: props.host,
          event: props.event,
          start: selectedSlot.start,
          name: form.name,
          email: form.email,
          phone: form.phone,
          notes: form.notes,
          smsConsent: form.smsConsent,
          answers: form.answers,
          timezone: tz,
          company: form.company,
          ...(props.prefillToken ? { k: props.prefillToken } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        setConfirmed({ startsAt: data.startsAt ?? selectedSlot.start })
        setPhase('done')
        return
      }
      if (data?.errors) setErrors(data.errors)
      setNotice(data?.message ?? 'We could not book that time.')
      if (Array.isArray(data?.slots)) {
        setSlots(data.slots)
        setSelectedSlot(null)
        setPhase('picking')
      }
    } catch {
      setNotice('We could not reach us just now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Done ────────────────────────────────────────────────────────────────
  if (phase === 'done' && confirmed) {
    return (
      <BookingNotice
        title="You are booked"
        tone="good"
        live
        callHref={props.fallbackPhoneHref}
        callLabel={`Call ${props.fallbackPhone}`}
        emailHref={props.fallbackEmailHref}
        emailLabel="Email us"
      >
        <p className="text-navy text-lg">{fmtDayLong(confirmed.startsAt, tz)}</p>
        <p className="text-navy text-lg mb-4">{fmtTime(confirmed.startsAt, tz)}</p>
        <p className="mb-2">{props.hostName} will call you at the number you gave us.</p>
        <p>
          Check your email. The confirmation has a link that lets you change the time or cancel it.
        </p>
      </BookingNotice>
    )
  }

  // ── Provider outage, or anything else that stops us reading the calendar ─
  //
  // THE ENGINE FAILS CLOSED, so this is what a visitor sees when the calendar
  // cannot be read: no times at all, rather than times we cannot stand behind.
  // The line has to say that plainly and then hand over both ways to reach a
  // person, because the alternative is a visitor who thinks the business is
  // closed.
  if (phase === 'unavailable') {
    return (
      <BookingNotice
        title="We cannot show times right now"
        live
        callHref={props.fallbackPhoneHref}
        callLabel={`Call ${props.fallbackPhone}`}
        emailHref={props.fallbackEmailHref}
        emailLabel="Email us"
      >
        {/* The server's own refusal sentence is NOT printed here. Every reason
            that lands in this phase says some version of "we cannot show times,
            call or email", which is what the heading and the line below already
            say, so printing it produced a card that repeated itself twice
            before offering a single useful word. The specific reason belongs in
            the log, where someone can act on it. */}
        <p>
          We would rather show you nothing than show you a time we cannot keep. Call or email and{' '}
          {props.hostName} will book you in.
        </p>
      </BookingNotice>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="border border-gray-200 rounded-2xl p-10 text-center">
        <p className="font-body text-gray-600 text-sm" role="status">
          Finding open times...
        </p>
      </div>
    )
  }

  // ── No times at all ─────────────────────────────────────────────────────
  //
  // The calendar READ WORKED and came back with nothing free. That is a
  // different sentence from the outage above, and it gets both ways out too:
  // someone who cannot find a time is exactly the person who should be able to
  // send an email instead of giving up.
  if (days.length === 0) {
    return (
      <BookingNotice
        title="No open times right now"
        live
        callHref={props.fallbackPhoneHref}
        callLabel={`Call ${props.fallbackPhone}`}
        emailHref={props.fallbackEmailHref}
        emailLabel="Email us"
      >
        <p>
          The next four weeks are full. Call or email and {props.hostName} will find you a spot that
          is not on here.
        </p>
      </BookingNotice>
    )
  }

  return (
    <div>
      {/* role="alert" so a refusal is SPOKEN, not just painted. This is where
          "someone just took that time" lands, and a sighted user sees the amber
          bar while a screen reader user would otherwise get silence and a
          quietly rebuilt grid. */}
      {notice && (
        <div
          className="mb-6 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3"
          role="alert"
        >
          <p className="font-body text-sm text-navy">{notice}</p>
        </div>
      )}

      {/* Step 1: the day */}
      <h2 className="font-heading font-bold text-navy text-xl mb-1">Pick a day</h2>
      <p className="font-body text-gray-600 text-xs mb-4">Times are shown in your timezone ({tz}).</p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-8" role="group" aria-label="Pick a day">
        {days.map(d => {
          const active = d.key === selectedDay
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                setSelectedDay(d.key)
                setSelectedSlot(null)
              }}
              aria-pressed={active}
              className={`shrink-0 px-4 py-3 rounded-xl border font-body text-sm transition-colors ${FOCUS} ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-navy border-gray-300 hover:border-navy'
              }`}
            >
              <span className="block font-medium">{fmtDayShort(d.slots[0].start, tz)}</span>
              {/* gray-200 on navy, not gray-300, so the selected pill's second
                  line clears 4.5 to 1 the same way the unselected one does. */}
              <span className={`block text-xs ${active ? 'text-gray-200' : 'text-gray-600'}`}>
                {d.slots.length} open
              </span>
            </button>
          )
        })}
      </div>

      {/* Step 2: the time */}
      <h2 className="font-heading font-bold text-navy text-xl mb-4" id="bk-times">
        Pick a time
      </h2>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-10"
        role="group"
        aria-labelledby="bk-times"
      >
        {daySlots.map(s => {
          const active = selectedSlot?.start === s.start
          return (
            <button
              key={s.start}
              type="button"
              onClick={() => {
                setSelectedSlot(s)
                setPhase('details')
                pendingFocus.current = true
              }}
              aria-pressed={active}
              className={`px-3 py-3 rounded-xl border font-body text-sm tabular-nums transition-colors ${FOCUS} ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-navy border-gray-300 hover:border-navy'
              }`}
            >
              {fmtTime(s.start, tz)}
            </button>
          )
        })}
      </div>

      {/* Step 3: details */}
      {selectedSlot && (
        <form onSubmit={submit} className="border-t border-gray-200 pt-8" noValidate>
          {/* tabIndex -1 makes the heading focusable by script but keeps it out
              of the tab order, which is the standard way to move focus to a
              region that just appeared without adding a stop nobody wants. */}
          <h2
            className={`font-heading font-bold text-navy text-xl mb-2 ${FOCUS}`}
            ref={detailsRef}
            tabIndex={-1}
          >
            Your details
          </h2>
          <p className="font-body text-gray-600 text-sm mb-2">
            {props.eventName} on {fmtDayLong(selectedSlot.start, tz)} at{' '}
            {fmtTime(selectedSlot.start, tz)}, {props.durationMinutes} minutes.
          </p>
          {knownClient && (
            <p className="font-body text-gray-600 text-sm mb-6">
              We filled in what we have on file. Change anything that is out of date.
            </p>
          )}
          {!knownClient && <div className="mb-6" />}

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Every field below follows the same three-part contract:
                  aria-invalid marks it wrong, aria-describedby points at the
                  message so a screen reader reads the field AND the reason
                  together, and role="alert" on the message announces it the
                  moment the server sends errors back. */}
            <div>
              <label className={LABEL} htmlFor="bk-name">
                Your name
              </label>
              <input
                id="bk-name"
                className={errors.name ? INPUT_BAD : INPUT}
                value={form.name}
                onChange={update('name')}
                autoComplete="name"
                required
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'bk-name-err' : undefined}
              />
              {errors.name && (
                <p className={ERROR} id="bk-name-err" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="bk-phone">
                Phone number
              </label>
              <input
                id="bk-phone"
                className={errors.phone ? INPUT_BAD : INPUT}
                value={form.phone}
                onChange={update('phone')}
                autoComplete="tel"
                inputMode="tel"
                placeholder="(555) 555-5555"
                required
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? 'bk-phone-hint bk-phone-err' : 'bk-phone-hint'}
              />
              <p className="font-body text-xs text-gray-600 mt-1" id="bk-phone-hint">
                This is the number we call.
              </p>
              {errors.phone && (
                <p className={ERROR} id="bk-phone-err" role="alert">
                  {errors.phone}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5">
            <label className={LABEL} htmlFor="bk-email">
              Email
            </label>
            <input
              id="bk-email"
              className={errors.email ? INPUT_BAD : INPUT}
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'bk-email-err' : undefined}
            />
            {errors.email && (
              <p className={ERROR} id="bk-email-err" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          {props.intakeQuestions.map(q => {
            const err = errors[`answers.${q.key}`]
            const id = `bk-q-${q.key}`
            const errId = `${id}-err`
            const shared = {
              id,
              value: form.answers[q.key] ?? '',
              onChange: updateAnswer(q.key),
              required: q.required,
              'aria-invalid': err ? (true as const) : undefined,
              'aria-describedby': err ? errId : undefined,
            }
            return (
              <div className="mt-5" key={q.key}>
                <label className={LABEL} htmlFor={id}>
                  {q.label}
                  {!q.required && <span className={OPTIONAL}> (optional)</span>}
                </label>
                {q.type === 'select' ? (
                  <select {...shared} className={err ? INPUT_BAD : SELECT}>
                    <option value="">Please pick one</option>
                    {q.options.map(o => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : q.type === 'textarea' ? (
                  <textarea {...shared} className={`${err ? INPUT_BAD : INPUT} resize-none`} rows={3} />
                ) : (
                  <input {...shared} className={err ? INPUT_BAD : INPUT} />
                )}
                {err && (
                  <p className={ERROR} id={errId} role="alert">
                    {err}
                  </p>
                )}
              </div>
            )
          })}

          <div className="mt-5">
            <label className={LABEL} htmlFor="bk-notes">
              Anything we should know? <span className={OPTIONAL}>(optional)</span>
            </label>
            <textarea
              id="bk-notes"
              className={`${INPUT} resize-none`}
              rows={3}
              value={form.notes}
              onChange={update('notes')}
            />
          </div>

          {/* Express consent. Starts unchecked, never blocks the booking. */}
          <div className="mt-6 rounded-xl border border-gray-300 p-4">
            <label className="flex items-start gap-3 cursor-pointer" htmlFor="bk-consent">
              <input
                id="bk-consent"
                type="checkbox"
                className={`mt-1 h-4 w-4 accent-lime ${FOCUS}`}
                checked={form.smsConsent}
                onChange={e => setForm(f => ({ ...f, smsConsent: e.target.checked }))}
                aria-describedby="bk-consent-hint"
              />
              <span className="font-body text-sm text-navy">
                Yes, Fox Mortgage can text and email me about my mortgage and about rate changes that
                could save me money. I can say stop any time.
              </span>
            </label>
            <p className="font-body text-xs text-gray-600 mt-2 ml-7" id="bk-consent-hint">
              You do not have to tick this to book. We will still call you.
            </p>
          </div>

          {/* Honeypot: hidden from people, filled only by bots. */}
          <div className="hidden" aria-hidden="true">
            <label>
              Company
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.company}
                onChange={update('company')}
              />
            </label>
          </div>

          {errors.start && (
            <p className={`${ERROR} mt-4`} role="alert">
              {errors.start}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`mt-8 w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-60 ${FOCUS}`}
          >
            {submitting ? 'Booking...' : 'Book this time'}
          </button>

          <p className="font-body text-xs text-gray-600 mt-4 text-center">
            {props.hostName} is a Mortgage Agent, Level 2 with BRX Mortgage, FSRA 13463.
          </p>
        </form>
      )}
    </div>
  )
}
