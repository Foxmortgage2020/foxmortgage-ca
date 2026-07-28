'use client'

// Look at your appointment, move it, or cancel it.
//
// Times render in the visitor's OWN timezone, the same rule the booking page
// follows, because the person reading this is the person who has to be on the
// call.
//
// Copy gate: grade-6 words, no dashes of any kind, no semicolons, no exclamation
// points, contractions fine, never the word "broker".

import { useCallback, useMemo, useState } from 'react'
import type { Slot } from '@/lib/booking/types'
import BookingNotice from '@/components/booking/BookingNotice'

const LABEL = 'font-body text-sm font-medium text-navy block mb-2'
const INPUT =
  'w-full px-4 py-3 rounded-xl border border-gray-300 font-body text-navy placeholder-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:border-navy bg-white'
const OPTIONAL = 'text-gray-600 font-normal'
const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2'
const BTN_PRIMARY = `bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-colors ${FOCUS}`
const BTN_SECONDARY = `border-2 border-navy text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-navy hover:text-white transition-colors ${FOCUS}`

interface Props {
  token: string
  status: 'booked' | 'cancelled' | 'rescheduled' | 'no_show'
  startsAt: string
  endsAt: string
  eventName: string
  hostName: string
  hostTimezone: string
  clientTimezone: string | null
  clientName: string
  durationMinutes: number
  /** Inside the self-serve cutoff. The appointment still shows, the controls do
   *  not, because a call ninety minutes away is the worst thing to hide. */
  tooLate: boolean
  fallbackPhone: string
  fallbackPhoneHref: string
  fallbackEmail: string
  fallbackEmailHref: string
}

type Mode = 'idle' | 'picking' | 'confirmCancel' | 'working' | 'moved' | 'cancelled'

function visitorTimezone(fallback: string): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback
  } catch {
    return fallback
  }
}

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

function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export default function ManageFlow(props: Props) {
  const tz = useMemo(() => visitorTimezone(props.hostTimezone), [props.hostTimezone])
  const [mode, setMode] = useState<Mode>(props.status === 'cancelled' ? 'cancelled' : 'idle')
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [current, setCurrent] = useState({ startsAt: props.startsAt })
  const [cancelReason, setCancelReason] = useState('')

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots) {
      const key = dayKey(s.start, tz)
      const list = map.get(key)
      if (list) list.push(s)
      else map.set(key, [s])
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, list]) => ({ key, slots: list }))
  }, [slots, tz])

  const loadSlots = useCallback(async () => {
    setMode('working')
    setNotice(null)
    try {
      const res = await fetch('/api/book/manage/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setNotice(data?.message ?? 'We cannot show times right now.')
        setMode('idle')
        return
      }
      const list: Slot[] = Array.isArray(data.slots) ? data.slots : []
      setSlots(list)
      setSelectedDay(list.length > 0 ? dayKey(list[0].start, tz) : null)
      setMode('picking')
    } catch {
      setNotice('We cannot show times right now.')
      setMode('idle')
    }
  }, [props.token, tz])

  async function pickTime(slot: Slot) {
    setMode('working')
    setNotice(null)
    try {
      const res = await fetch('/api/book/manage/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token, start: slot.start }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        setCurrent({ startsAt: data.startsAt ?? slot.start })
        setMode('moved')
        return
      }
      setNotice(data?.message ?? 'We could not move it.')
      if (Array.isArray(data?.slots)) setSlots(data.slots)
      setMode('picking')
    } catch {
      setNotice('We could not reach us just now. Please try again.')
      setMode('picking')
    }
  }

  async function doCancel() {
    setMode('working')
    setNotice(null)
    try {
      const res = await fetch('/api/book/manage/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token, reason: cancelReason }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        setMode('cancelled')
        return
      }
      setNotice(data?.message ?? 'We could not cancel it.')
      setMode('idle')
    } catch {
      setNotice('We could not reach us just now. Please try again.')
      setMode('idle')
    }
  }

  // ── Cancelled ───────────────────────────────────────────────────────────
  if (mode === 'cancelled') {
    return (
      <BookingNotice
        as="h1"
        title="That is cancelled"
        live
        callHref={props.fallbackPhoneHref}
        callLabel={`Call ${props.fallbackPhone}`}
        emailHref={props.fallbackEmailHref}
        emailLabel="Email us"
      >
        <p>
          Nothing else to do. If you want a new time, call or email {props.hostName} and we will get
          you back in.
        </p>
      </BookingNotice>
    )
  }

  // ── Moved ───────────────────────────────────────────────────────────────
  if (mode === 'moved') {
    return (
      <BookingNotice as="h1" title="All moved" tone="good" live>
        <p className="text-navy text-lg">{fmtDayLong(current.startsAt, tz)}</p>
        <p className="text-navy text-lg mb-4">{fmtTime(current.startsAt, tz)}</p>
        <p>{props.hostName} will call you then. We sent you a new confirmation.</p>
      </BookingNotice>
    )
  }

  const daySlots = days.find(d => d.key === selectedDay)?.slots ?? []

  return (
    <div>
      <h1 className="font-heading font-bold text-navy text-3xl mb-2">Your appointment</h1>
      <p className="font-body text-gray-600 text-sm mb-8">
        Times are shown in your timezone ({tz}).
      </p>

      {notice && (
        <div className="mb-6 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3" role="alert">
          <p className="font-body text-sm text-navy">{notice}</p>
        </div>
      )}

      <div className="border border-gray-300 rounded-2xl p-6 mb-8">
        <p className="font-body text-gray-600 text-xs uppercase tracking-wider mb-2">Booked in</p>
        <p className="font-heading font-bold text-navy text-xl mb-1">{props.eventName}</p>
        <p className="font-body text-navy">{fmtDayLong(current.startsAt, tz)}</p>
        <p className="font-body text-navy mb-3">{fmtTime(current.startsAt, tz)}</p>
        <p className="font-body text-gray-600 text-sm">
          {props.hostName} will call you. It should take about {props.durationMinutes} minutes.
        </p>
      </div>

      {/* INSIDE THE CUTOFF. The appointment above still shows. Only the controls
          go, because a change this close needs a person on the phone and a
          button that would refuse is worse than no button. */}
      {props.tooLate && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 px-4 py-4">
          <p className="font-body text-sm text-navy">
            This one is too close to now to change on here. Call {props.fallbackPhone} and we will
            sort it out with you.
          </p>
        </div>
      )}

      {!props.tooLate && mode === 'idle' && (
        <div className="flex flex-col sm:flex-row gap-4">
          <button type="button" onClick={loadSlots} className={BTN_PRIMARY}>
            Pick a new time
          </button>
          <button
            type="button"
            onClick={() => setMode('confirmCancel')}
            className={BTN_SECONDARY}
          >
            Cancel it
          </button>
        </div>
      )}

      {mode === 'working' && (
        <p className="font-body text-gray-600 text-sm" role="status">
          One moment...
        </p>
      )}

      {mode === 'confirmCancel' && (
        <div className="border border-gray-300 rounded-2xl p-6">
          <h2 className="font-heading font-bold text-navy text-lg mb-2">Cancel this appointment?</h2>
          <p className="font-body text-gray-600 text-sm mb-4">
            You can book again any time. If you just want a different time, picking a new one is
            easier.
          </p>
          <label className={LABEL} htmlFor="mg-reason">
            Anything you want us to know? <span className={OPTIONAL}>(optional)</span>
          </label>
          <textarea
            id="mg-reason"
            className={`${INPUT} resize-none`}
            rows={2}
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
          />
          <div className="flex flex-col sm:flex-row gap-3 mt-5">
            <button
              type="button"
              onClick={doCancel}
              className={`bg-navy text-white font-heading font-bold px-6 py-3 rounded-xl hover:bg-navy-light transition-colors ${FOCUS}`}
            >
              Yes, cancel it
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className={`border-2 border-navy text-navy font-heading font-bold px-6 py-3 rounded-xl hover:bg-navy hover:text-white transition-colors ${FOCUS}`}
            >
              Keep it
            </button>
          </div>
        </div>
      )}

      {mode === 'picking' && (
        <div>
          <h2 className="font-heading font-bold text-navy text-xl mb-4">Pick a new time</h2>
          {days.length === 0 ? (
            <p className="font-body text-gray-600 text-sm">
              There are no open times right now. Call {props.fallbackPhone} or email{' '}
              {props.fallbackEmail} and we will find one.
            </p>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2 mb-6" role="group" aria-label="Pick a day">
                {days.map(d => {
                  const active = d.key === selectedDay
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setSelectedDay(d.key)}
                      aria-pressed={active}
                      className={`shrink-0 px-4 py-3 rounded-xl border font-body text-sm transition-colors ${FOCUS} ${
                        active
                          ? 'bg-navy text-white border-navy'
                          : 'bg-white text-navy border-gray-300 hover:border-navy'
                      }`}
                    >
                      <span className="block font-medium">{fmtDayShort(d.slots[0].start, tz)}</span>
                      <span className={`block text-xs ${active ? 'text-gray-200' : 'text-gray-600'}`}>
                        {d.slots.length} open
                      </span>
                    </button>
                  )
                })}
              </div>
              <div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
                role="group"
                aria-label="Pick a time"
              >
                {daySlots.map(s => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => pickTime(s)}
                    className={`px-3 py-3 rounded-xl border border-gray-300 bg-white text-navy font-body text-sm tabular-nums hover:border-navy transition-colors ${FOCUS}`}
                  >
                    {fmtTime(s.start, tz)}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setMode('idle')}
            className={`mt-6 font-body text-sm text-navy underline rounded ${FOCUS}`}
          >
            Never mind, keep the time I have
          </button>
        </div>
      )}
    </div>
  )
}
