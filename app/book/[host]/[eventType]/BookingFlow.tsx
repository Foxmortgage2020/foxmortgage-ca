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

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { IntakeQuestion, Slot } from '@/lib/booking/types'

const INPUT =
  'w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime focus:border-transparent bg-white'
const SELECT = INPUT
const LABEL = 'font-body text-sm font-medium text-navy block mb-2'

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

  const daySlots = days.find(d => d.key === selectedDay)?.slots ?? []

  const update = (field: 'name' | 'email' | 'phone' | 'notes' | 'company') => (
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
      <div className="bg-lime/10 border border-lime/30 rounded-2xl p-10 text-center">
        <h2 className="font-heading font-bold text-navy text-2xl mb-3">You are booked</h2>
        <p className="font-body text-navy text-lg mb-2">{fmtDayLong(confirmed.startsAt, tz)}</p>
        <p className="font-body text-navy text-lg mb-6">{fmtTime(confirmed.startsAt, tz)}</p>
        <p className="font-body text-gray-600 text-sm mb-2">
          {props.hostName} will call you at the number you gave us.
        </p>
        <p className="font-body text-gray-600 text-sm">
          Need to change it? Call {props.fallbackPhone} or email {props.fallbackEmail}.
        </p>
      </div>
    )
  }

  // ── Cannot show times ───────────────────────────────────────────────────
  if (phase === 'unavailable') {
    return (
      <div className="border border-gray-200 rounded-2xl p-10 text-center">
        <h2 className="font-heading font-bold text-navy text-xl mb-3">We cannot show times right now</h2>
        <p className="font-body text-gray-600 text-sm mb-6">
          {notice ?? 'Something on our side is not answering.'} You can still reach {props.hostName}{' '}
          the usual way and he will book you in.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={props.fallbackPhoneHref}
            className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-all text-center"
          >
            Call {props.fallbackPhone}
          </a>
          <a
            href={props.fallbackEmailHref}
            className="border-2 border-navy text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-navy hover:text-white transition-all text-center"
          >
            Email us
          </a>
        </div>
      </div>
    )
  }

  // ── Loading ─────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="border border-gray-200 rounded-2xl p-10 text-center">
        <p className="font-body text-gray-600 text-sm">Finding open times...</p>
      </div>
    )
  }

  // ── No times at all ─────────────────────────────────────────────────────
  if (days.length === 0) {
    return (
      <div className="border border-gray-200 rounded-2xl p-10 text-center">
        <h2 className="font-heading font-bold text-navy text-xl mb-3">No open times right now</h2>
        <p className="font-body text-gray-600 text-sm mb-6">
          The calendar is full for now. Give {props.hostName} a call and he will find you a spot.
        </p>
        <a
          href={props.fallbackPhoneHref}
          className="inline-block bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-all"
        >
          Call {props.fallbackPhone}
        </a>
      </div>
    )
  }

  return (
    <div>
      {notice && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-body text-sm text-navy">{notice}</p>
        </div>
      )}

      {/* Step 1: the day */}
      <h2 className="font-heading font-bold text-navy text-xl mb-1">Pick a day</h2>
      <p className="font-body text-gray-500 text-xs mb-4">Times are shown in your timezone ({tz}).</p>

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
              className={`shrink-0 px-4 py-3 rounded-xl border font-body text-sm transition-colors ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-navy border-gray-200 hover:border-navy'
              }`}
            >
              <span className="block font-medium">{fmtDayShort(d.slots[0].start, tz)}</span>
              <span className={`block text-xs ${active ? 'text-gray-300' : 'text-gray-500'}`}>
                {d.slots.length} open
              </span>
            </button>
          )
        })}
      </div>

      {/* Step 2: the time */}
      <h2 className="font-heading font-bold text-navy text-xl mb-4">Pick a time</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-10">
        {daySlots.map(s => {
          const active = selectedSlot?.start === s.start
          return (
            <button
              key={s.start}
              type="button"
              onClick={() => {
                setSelectedSlot(s)
                setPhase('details')
              }}
              aria-pressed={active}
              className={`px-3 py-3 rounded-xl border font-body text-sm tabular-nums transition-colors ${
                active
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-navy border-gray-200 hover:border-navy'
              }`}
            >
              {fmtTime(s.start, tz)}
            </button>
          )
        })}
      </div>

      {/* Step 3: details */}
      {selectedSlot && (
        <form onSubmit={submit} className="border-t border-gray-200 pt-8">
          <h2 className="font-heading font-bold text-navy text-xl mb-2">Your details</h2>
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
            <div>
              <label className={LABEL} htmlFor="bk-name">
                Your name
              </label>
              <input
                id="bk-name"
                className={INPUT}
                value={form.name}
                onChange={update('name')}
                autoComplete="name"
                required
              />
              {errors.name && <p className="font-body text-sm text-red-600 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className={LABEL} htmlFor="bk-phone">
                Phone number
              </label>
              <input
                id="bk-phone"
                className={INPUT}
                value={form.phone}
                onChange={update('phone')}
                autoComplete="tel"
                inputMode="tel"
                placeholder="(555) 555-5555"
                required
              />
              <p className="font-body text-xs text-gray-500 mt-1">This is the number we call.</p>
              {errors.phone && <p className="font-body text-sm text-red-600 mt-1">{errors.phone}</p>}
            </div>
          </div>

          <div className="mt-5">
            <label className={LABEL} htmlFor="bk-email">
              Email
            </label>
            <input
              id="bk-email"
              className={INPUT}
              type="email"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
            />
            {errors.email && <p className="font-body text-sm text-red-600 mt-1">{errors.email}</p>}
          </div>

          {props.intakeQuestions.map(q => (
            <div className="mt-5" key={q.key}>
              <label className={LABEL} htmlFor={`bk-q-${q.key}`}>
                {q.label}
                {!q.required && <span className="text-gray-400 font-normal"> (optional)</span>}
              </label>
              {q.type === 'select' ? (
                <select
                  id={`bk-q-${q.key}`}
                  className={SELECT}
                  value={form.answers[q.key] ?? ''}
                  onChange={updateAnswer(q.key)}
                  required={q.required}
                >
                  <option value="">Please pick one</option>
                  {q.options.map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : q.type === 'textarea' ? (
                <textarea
                  id={`bk-q-${q.key}`}
                  className={`${INPUT} resize-none`}
                  rows={3}
                  value={form.answers[q.key] ?? ''}
                  onChange={updateAnswer(q.key)}
                  required={q.required}
                />
              ) : (
                <input
                  id={`bk-q-${q.key}`}
                  className={INPUT}
                  value={form.answers[q.key] ?? ''}
                  onChange={updateAnswer(q.key)}
                  required={q.required}
                />
              )}
              {errors[`answers.${q.key}`] && (
                <p className="font-body text-sm text-red-600 mt-1">{errors[`answers.${q.key}`]}</p>
              )}
            </div>
          ))}

          <div className="mt-5">
            <label className={LABEL} htmlFor="bk-notes">
              Anything we should know? <span className="text-gray-400 font-normal">(optional)</span>
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
          <div className="mt-6 rounded-xl border border-gray-200 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-lime"
                checked={form.smsConsent}
                onChange={e => setForm(f => ({ ...f, smsConsent: e.target.checked }))}
              />
              <span className="font-body text-sm text-navy">
                Yes, Fox Mortgage can text and email me about my mortgage and about rate changes that
                could save me money. I can say stop any time.
              </span>
            </label>
            <p className="font-body text-xs text-gray-500 mt-2 ml-7">
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

          {errors.start && <p className="font-body text-sm text-red-600 mt-4">{errors.start}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-8 w-full bg-lime text-navy font-heading font-bold py-4 rounded-xl hover:bg-lime-dark transition-colors disabled:opacity-60"
          >
            {submitting ? 'Booking...' : 'Book this time'}
          </button>

          <p className="font-body text-xs text-gray-500 mt-4 text-center">
            {props.hostName} is a Mortgage Agent, Level 2 with BRX Mortgage, FSRA 13463.
          </p>
        </form>
      )}
    </div>
  )
}
