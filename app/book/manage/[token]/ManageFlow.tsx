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

const LABEL = 'font-body text-sm font-medium text-navy block mb-2'
const INPUT =
  'w-full px-4 py-3 rounded-xl border border-gray-200 font-body text-navy placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-lime focus:border-transparent bg-white'

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
  fallbackPhone: string
  fallbackPhoneHref: string
  fallbackEmail: string
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
      <div className="border border-gray-200 rounded-2xl p-10 text-center">
        <h1 className="font-heading font-bold text-navy text-2xl mb-3">That is cancelled</h1>
        <p className="font-body text-gray-600 text-sm mb-6">
          Nothing else to do. If you want a new time, give {props.hostName} a call or send an email
          and we will get you back in.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={props.fallbackPhoneHref}
            className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-all text-center"
          >
            Call {props.fallbackPhone}
          </a>
        </div>
      </div>
    )
  }

  // ── Moved ───────────────────────────────────────────────────────────────
  if (mode === 'moved') {
    return (
      <div className="bg-lime/10 border border-lime/30 rounded-2xl p-10 text-center">
        <h1 className="font-heading font-bold text-navy text-2xl mb-3">All moved</h1>
        <p className="font-body text-navy text-lg mb-1">{fmtDayLong(current.startsAt, tz)}</p>
        <p className="font-body text-navy text-lg mb-6">{fmtTime(current.startsAt, tz)}</p>
        <p className="font-body text-gray-600 text-sm">
          {props.hostName} will call you then. We sent you a new confirmation.
        </p>
      </div>
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
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="font-body text-sm text-navy">{notice}</p>
        </div>
      )}

      <div className="border border-gray-200 rounded-2xl p-6 mb-8">
        <p className="font-body text-gray-500 text-xs uppercase tracking-wider mb-2">Booked in</p>
        <p className="font-heading font-bold text-navy text-xl mb-1">{props.eventName}</p>
        <p className="font-body text-navy">{fmtDayLong(current.startsAt, tz)}</p>
        <p className="font-body text-navy mb-3">{fmtTime(current.startsAt, tz)}</p>
        <p className="font-body text-gray-600 text-sm">
          {props.hostName} will call you. It should take about {props.durationMinutes} minutes.
        </p>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            type="button"
            onClick={loadSlots}
            className="bg-lime text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-lime-dark transition-all"
          >
            Pick a new time
          </button>
          <button
            type="button"
            onClick={() => setMode('confirmCancel')}
            className="border-2 border-navy text-navy font-heading font-bold px-8 py-4 rounded-xl hover:bg-navy hover:text-white transition-all"
          >
            Cancel it
          </button>
        </div>
      )}

      {mode === 'working' && (
        <p className="font-body text-gray-600 text-sm">One moment...</p>
      )}

      {mode === 'confirmCancel' && (
        <div className="border border-gray-200 rounded-2xl p-6">
          <h2 className="font-heading font-bold text-navy text-lg mb-2">Cancel this appointment?</h2>
          <p className="font-body text-gray-600 text-sm mb-4">
            You can book again any time. If you just want a different time, picking a new one is
            easier.
          </p>
          <label className={LABEL} htmlFor="mg-reason">
            Anything you want us to know? <span className="text-gray-400 font-normal">(optional)</span>
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
              className="bg-navy text-white font-heading font-bold px-6 py-3 rounded-xl hover:bg-navy-light transition-colors"
            >
              Yes, cancel it
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="border-2 border-navy text-navy font-heading font-bold px-6 py-3 rounded-xl hover:bg-navy hover:text-white transition-colors"
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
              There are no open times right now. Please call {props.fallbackPhone} and we will find
              one.
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {daySlots.map(s => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => pickTime(s)}
                    className="px-3 py-3 rounded-xl border border-gray-200 bg-white text-navy font-body text-sm tabular-nums hover:border-navy transition-colors"
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
            className="mt-6 font-body text-sm text-navy underline"
          >
            Never mind, keep the time I have
          </button>
        </div>
      )}
    </div>
  )
}
