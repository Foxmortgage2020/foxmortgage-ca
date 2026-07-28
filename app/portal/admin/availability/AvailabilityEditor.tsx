'use client'

// The Availability editor. Four sections behind a tab bar, each saving on its
// own so a bad Tuesday never blocks a good meeting-type change.
//
// SAVING IS EXPLICIT EVERYWHERE. Nothing here writes on a keystroke or on blur,
// which is the input-commit rule taken one step further: these are settings
// that decide when a client can reach Michael, so the write is always a button
// he pressed. Every save reports what happened in words.
//
// Admin-facing copy is professional plain language. The two fields a CLIENT
// ever reads (a meeting type's name and its description, both rendered on the
// public booking page) are gated in the editor with the client rules, because
// the person typing them is not thinking about a copy gate.

import { useMemo, useState } from 'react'
import StatusChip from '@/components/admin/ds/StatusChip'
import SummaryStrip from '@/components/admin/ds/SummaryStrip'
import {
  EVENT_TYPE_BOUNDS,
  EVENT_TYPE_FIELD_LABELS,
  WEEKDAYS,
  type EventTypeDraft,
  type EventTypeNumericField,
  type HoursWindow,
  validateEventTypeDraft,
  validateOverrideDraft,
  validateWindows,
  weeklyOpenMinutes,
  windowLabel,
} from '@/lib/booking/admin'
import { clientCopyProblems } from '@/lib/booking/copy-gate'

const FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2'
const INPUT_BASE =
  'rounded-[7px] border border-cool-300 bg-white px-3 py-2 font-ui text-[13px] text-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy'
const INPUT = `w-full ${INPUT_BASE}`
// A separate constant rather than `${INPUT} w-32`. Both are width utilities, so
// which one wins is decided by their order in the generated stylesheet and not
// by the order they appear in the class attribute. w-full won, and every time
// field rendered the full width of its card until a render proof showed it.
const TIME_INPUT = `w-32 ${INPUT_BASE}`
const LABEL = 'font-ui text-[12px] font-medium text-cool-800 block mb-1'
const BTN = `rounded-[7px] bg-ink-navy px-4 py-2 font-ui text-[13px] font-semibold text-white hover:bg-ink-navy2 disabled:opacity-50 ${FOCUS}`
const BTN_QUIET = `rounded-[7px] border border-cool-300 bg-white px-3 py-2 font-ui text-[13px] font-medium text-navy hover:border-navy disabled:opacity-50 ${FOCUS}`
const CARD = 'rounded-[9px] border border-cool-200 bg-white'

interface HoursRow {
  weekday: number
  windows: HoursWindow[]
}
interface OverrideRow {
  date: string
  closed: boolean
  windows: HoursWindow[]
  note: string | null
}
interface UpcomingRow {
  id: string
  startsAt: string
  endsAt: string
  eventTypeName: string | null
  clientName: string
  clientEmail: string
  clientPhone: string
  clientTimezone: string | null
  notes: string | null
  smsConsent: boolean
  calendarStatus: string
  source: string
}

interface Props {
  hostSlug: string
  hostName: string
  timezone: string
  initialHours: HoursRow[]
  initialOverrides: OverrideRow[]
  initialEventTypes: EventTypeDraft[]
  upcoming: UpcomingRow[]
  upcomingError: string | null
  demo: boolean
}

type Tab = 'hours' | 'overrides' | 'types' | 'upcoming'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'hours', label: 'Weekly hours' },
  { key: 'overrides', label: 'Closed days' },
  { key: 'types', label: 'Meeting types' },
  { key: 'upcoming', label: 'Upcoming' },
]

function fmtWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

function fmtHoursTotal(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export default function AvailabilityEditor(props: Props) {
  const [tab, setTab] = useState<Tab>('hours')
  const [hours, setHours] = useState<HoursRow[]>(props.initialHours)
  const [overrides, setOverrides] = useState<OverrideRow[]>(props.initialOverrides)
  const [types, setTypes] = useState<EventTypeDraft[]>(props.initialEventTypes)
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>(props.upcoming)
  const [flash, setFlash] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const openMinutes = useMemo(() => weeklyOpenMinutes(hours), [hours])
  const activeTypes = types.filter(t => t.active).length

  function say(tone: 'ok' | 'bad', text: string) {
    setFlash({ tone, text })
  }

  async function send(url: string, init: RequestInit, key: string): Promise<any | null> {
    if (props.demo) {
      say('bad', 'Demo mode is read only. Nothing was saved.')
      return null
    }
    setBusy(key)
    setFlash(null)
    try {
      const res = await fetch(url, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        say('bad', data?.message ?? 'That did not save.')
        return null
      }
      return data
    } catch {
      say('bad', 'Could not reach the server. Nothing was saved.')
      return null
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <SummaryStrip
        tiles={[
          { key: 'host', label: 'Host', value: props.hostName || props.hostSlug, sub: props.timezone },
          { key: 'open', label: 'Open each week', value: fmtHoursTotal(openMinutes) },
          { key: 'types', label: 'Meeting types live', value: `${activeTypes} of ${types.length}` },
          { key: 'next', label: 'Booked ahead', value: String(upcoming.length) },
        ]}
      />

      {props.demo && (
        <div className="mt-4 rounded-[7px] border border-caution bg-caution-bg px-4 py-3" role="status">
          <p className="font-ui text-[13px] text-navy">
            Demo mode. Hours and meeting types show real settings because they are practice
            reference data. The upcoming list is empty on purpose so no client appears. Nothing
            here can be saved.
          </p>
        </div>
      )}

      {flash && (
        <div
          className={`mt-4 rounded-[7px] border px-4 py-3 ${
            flash.tone === 'ok'
              ? 'border-green-300 bg-green-50'
              : 'border-caution bg-caution-bg'
          }`}
          role="alert"
        >
          <p className="font-ui text-[13px] text-navy">{flash.text}</p>
        </div>
      )}

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-cool-200" role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key)
              setFlash(null)
            }}
            className={`shrink-0 border-b-2 px-4 py-2 font-ui text-[13px] font-medium transition-colors ${FOCUS} ${
              tab === t.key
                ? 'border-navy text-navy'
                : 'border-transparent text-muted hover:text-navy'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'hours' && (
          <WeeklyHours
            hours={hours}
            timezone={props.timezone}
            busy={busy}
            disabled={props.demo}
            onSave={async (weekday, windows) => {
              const data = await send(
                '/api/portal/admin/booking/hours',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ weekday, windows }),
                },
                `hours-${weekday}`,
              )
              if (!data) return
              setHours(prev => {
                const rest = prev.filter(h => h.weekday !== weekday)
                return windows.length === 0
                  ? rest
                  : [...rest, { weekday, windows: data.windows }].sort((a, b) => a.weekday - b.weekday)
              })
              const day = WEEKDAYS[weekday].label
              say('ok', windows.length === 0 ? `${day} is now closed.` : `${day} saved.`)
            }}
          />
        )}

        {tab === 'overrides' && (
          <Overrides
            overrides={overrides}
            busy={busy}
            disabled={props.demo}
            onAdd={async draft => {
              const data = await send(
                '/api/portal/admin/booking/overrides',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(draft),
                },
                'override-add',
              )
              if (!data) return false
              setOverrides(prev =>
                [...prev.filter(o => o.date !== data.override.date), data.override].sort((a, b) =>
                  a.date < b.date ? -1 : 1,
                ),
              )
              say('ok', `${data.override.date} saved.`)
              return true
            }}
            onRemove={async date => {
              const data = await send(
                `/api/portal/admin/booking/overrides?date=${encodeURIComponent(date)}`,
                { method: 'DELETE' },
                `override-${date}`,
              )
              if (!data) return
              setOverrides(prev => prev.filter(o => o.date !== date))
              say('ok', `${date} removed. That day follows the usual weekly hours again.`)
            }}
          />
        )}

        {tab === 'types' && (
          <MeetingTypes
            types={types}
            hostSlug={props.hostSlug}
            busy={busy}
            disabled={props.demo}
            onSave={async draft => {
              const data = await send(
                '/api/portal/admin/booking/event-types',
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(draft),
                },
                `type-${draft.slug}`,
              )
              if (!data) return
              setTypes(prev => prev.map(t => (t.slug === draft.slug ? data.eventType : t)))
              say('ok', `${draft.name} saved.`)
            }}
          />
        )}

        {tab === 'upcoming' && (
          <Upcoming
            rows={upcoming}
            timezone={props.timezone}
            error={props.upcomingError}
            busy={busy}
            disabled={props.demo}
            onCancel={async (id, reason) => {
              const data = await send(
                `/api/portal/admin/booking/bookings/${id}/cancel`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reason }),
                },
                `cancel-${id}`,
              )
              if (!data) return
              setUpcoming(prev => prev.filter(r => r.id !== id))
              say('ok', 'Cancelled. The client has been emailed and the calendar entry is removed.')
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Weekly hours ────────────────────────────────────────────────────────────

function WeeklyHours({
  hours,
  timezone,
  busy,
  disabled,
  onSave,
}: {
  hours: HoursRow[]
  timezone: string
  busy: string | null
  disabled: boolean
  onSave: (weekday: number, windows: HoursWindow[]) => Promise<void>
}) {
  return (
    <div>
      <p className="font-ui mb-4 text-[13px] text-muted">
        Times are in {timezone}, the host timezone. A day with no windows is closed. Each day saves
        on its own.
      </p>
      <div className="space-y-3">
        {WEEKDAYS.map(day => (
          <DayRow
            key={day.index}
            day={day}
            windows={hours.find(h => h.weekday === day.index)?.windows ?? []}
            busy={busy === `hours-${day.index}`}
            disabled={disabled}
            onSave={w => onSave(day.index, w)}
          />
        ))}
      </div>
    </div>
  )
}

function DayRow({
  day,
  windows,
  busy,
  disabled,
  onSave,
}: {
  day: { index: number; label: string }
  windows: HoursWindow[]
  busy: boolean
  disabled: boolean
  onSave: (windows: HoursWindow[]) => Promise<void>
}) {
  const [draft, setDraft] = useState<HoursWindow[]>(windows)
  const [errors, setErrors] = useState<string[]>([])
  const dirty = JSON.stringify(draft) !== JSON.stringify(windows)

  function set(i: number, field: 'start' | 'end', value: string) {
    setDraft(prev => prev.map((w, j) => (j === i ? { ...w, [field]: value } : w)))
  }

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-ui w-24 text-[13px] font-semibold text-navy">{day.label}</span>
          {draft.length === 0 && <StatusChip tone="gray">Closed</StatusChip>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={BTN_QUIET}
            disabled={disabled || busy}
            onClick={() => setDraft(prev => [...prev, { start: '09:00', end: '17:00' }])}
          >
            Add window
          </button>
          <button
            type="button"
            className={BTN}
            disabled={disabled || busy || !dirty}
            onClick={async () => {
              const v = validateWindows(draft)
              if (!v.ok) {
                setErrors(v.errors)
                return
              }
              setErrors([])
              await onSave(v.value)
            }}
          >
            {busy ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>

      {draft.length > 0 && (
        <div className="mt-3 space-y-2">
          {draft.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`d${day.index}-s${i}`}>
                {day.label} window {i + 1} start
              </label>
              <input
                id={`d${day.index}-s${i}`}
                type="time"
                className={TIME_INPUT}
                value={w.start}
                disabled={disabled}
                onChange={e => set(i, 'start', e.target.value)}
              />
              <span className="font-ui text-[13px] text-muted">to</span>
              <label className="sr-only" htmlFor={`d${day.index}-e${i}`}>
                {day.label} window {i + 1} end
              </label>
              <input
                id={`d${day.index}-e${i}`}
                type="time"
                className={TIME_INPUT}
                value={w.end}
                disabled={disabled}
                onChange={e => set(i, 'end', e.target.value)}
              />
              <button
                type="button"
                className={`font-ui text-[12px] text-danger underline ${FOCUS} rounded`}
                disabled={disabled}
                onClick={() => setDraft(prev => prev.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="mt-3 space-y-1" role="alert">
          {errors.map(e => (
            <li key={e} className="font-ui text-[12px] text-danger">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Overrides ───────────────────────────────────────────────────────────────

function Overrides({
  overrides,
  busy,
  disabled,
  onAdd,
  onRemove,
}: {
  overrides: OverrideRow[]
  busy: string | null
  disabled: boolean
  onAdd: (draft: unknown) => Promise<boolean>
  onRemove: (date: string) => Promise<void>
}) {
  const [date, setDate] = useState('')
  const [closed, setClosed] = useState(true)
  const [windows, setWindows] = useState<HoursWindow[]>([{ start: '09:00', end: '12:00' }])
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  return (
    <div className="space-y-6">
      <div className={`${CARD} p-4`}>
        <h2 className="font-heading mb-1 text-base font-bold text-navy">Add a day</h2>
        <p className="font-ui mb-4 text-[13px] text-muted">
          A closed day offers nothing. A day with custom hours replaces that weekday entirely
          rather than adding to it.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="ov-date">
              Date
            </label>
            <input
              id="ov-date"
              type="date"
              className={INPUT}
              value={date}
              disabled={disabled}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="ov-note">
              Note, for your own reference
            </label>
            <input
              id="ov-note"
              className={INPUT}
              value={note}
              maxLength={200}
              disabled={disabled}
              onChange={e => setNote(e.target.value)}
              placeholder="Statutory holiday"
            />
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className={LABEL}>What happens that day</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="ov-kind"
                checked={closed}
                disabled={disabled}
                onChange={() => setClosed(true)}
                className={FOCUS}
              />
              <span className="font-ui text-[13px] text-navy">Closed all day</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="ov-kind"
                checked={!closed}
                disabled={disabled}
                onChange={() => setClosed(false)}
                className={FOCUS}
              />
              <span className="font-ui text-[13px] text-navy">Open, but different hours</span>
            </label>
          </div>
        </fieldset>

        {!closed && (
          <div className="mt-4 space-y-2">
            {windows.map((w, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`ov-s${i}`}>
                  Window {i + 1} start
                </label>
                <input
                  id={`ov-s${i}`}
                  type="time"
                  className={TIME_INPUT}
                  value={w.start}
                  disabled={disabled}
                  onChange={e =>
                    setWindows(prev => prev.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                  }
                />
                <span className="font-ui text-[13px] text-muted">to</span>
                <label className="sr-only" htmlFor={`ov-e${i}`}>
                  Window {i + 1} end
                </label>
                <input
                  id={`ov-e${i}`}
                  type="time"
                  className={TIME_INPUT}
                  value={w.end}
                  disabled={disabled}
                  onChange={e =>
                    setWindows(prev => prev.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                  }
                />
                {windows.length > 1 && (
                  <button
                    type="button"
                    className={`font-ui text-[12px] text-danger underline rounded ${FOCUS}`}
                    disabled={disabled}
                    onClick={() => setWindows(prev => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className={BTN_QUIET}
              disabled={disabled}
              onClick={() => setWindows(prev => [...prev, { start: '13:00', end: '17:00' }])}
            >
              Add window
            </button>
          </div>
        )}

        {errors.length > 0 && (
          <ul className="mt-3 space-y-1" role="alert">
            {errors.map(e => (
              <li key={e} className="font-ui text-[12px] text-danger">
                {e}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className={`${BTN} mt-4`}
          disabled={disabled || busy === 'override-add'}
          onClick={async () => {
            const draft = { date, closed, windows: closed ? [] : windows, note }
            const v = validateOverrideDraft(draft)
            if (!v.ok) {
              setErrors(v.errors)
              return
            }
            setErrors([])
            const saved = await onAdd(v.value)
            if (saved) {
              setDate('')
              setNote('')
            }
          }}
        >
          {busy === 'override-add' ? 'Saving' : 'Save this day'}
        </button>
      </div>

      <div className={CARD}>
        <div className="border-b border-cool-200 px-4 py-3">
          <h2 className="font-heading text-base font-bold text-navy">
            Upcoming exceptions ({overrides.length})
          </h2>
        </div>
        {overrides.length === 0 ? (
          <p className="font-ui px-4 py-6 text-center text-[13px] text-muted">
            No exceptions ahead. Every day follows the weekly hours.
          </p>
        ) : (
          <ul>
            {overrides.map(o => (
              <li
                key={o.date}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-cool-100 px-4 py-3 first:border-t-0"
              >
                <div>
                  <p className="font-ui text-[13px] font-semibold tabular-nums text-navy">{o.date}</p>
                  <p className="font-ui text-[12px] text-muted">
                    {o.closed
                      ? 'Closed all day'
                      : o.windows.map(w => windowLabel(w)).join(', ') || 'Open'}
                    {o.note ? ` · ${o.note}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className={BTN_QUIET}
                  disabled={disabled || busy === `override-${o.date}`}
                  onClick={() => onRemove(o.date)}
                >
                  {busy === `override-${o.date}` ? 'Removing' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Meeting types ───────────────────────────────────────────────────────────

function MeetingTypes({
  types,
  hostSlug,
  busy,
  disabled,
  onSave,
}: {
  types: EventTypeDraft[]
  hostSlug: string
  busy: string | null
  disabled: boolean
  onSave: (draft: EventTypeDraft) => Promise<void>
}) {
  return (
    <div className="space-y-4">
      <p className="font-ui text-[13px] text-muted">
        Editing only. Creating a new meeting type mints a public URL, so it waits for a real second
        agent. The web address of a type cannot change, because links already sent would break.
      </p>
      {types.map(t => (
        <MeetingType
          key={t.slug}
          type={t}
          hostSlug={hostSlug}
          busy={busy === `type-${t.slug}`}
          disabled={disabled}
          onSave={onSave}
        />
      ))}
    </div>
  )
}

function MeetingType({
  type,
  hostSlug,
  busy,
  disabled,
  onSave,
}: {
  type: EventTypeDraft
  hostSlug: string
  busy: boolean
  disabled: boolean
  onSave: (draft: EventTypeDraft) => Promise<void>
}) {
  const [draft, setDraft] = useState<EventTypeDraft>(type)
  const [errors, setErrors] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(type)

  // The two fields a CLIENT reads. Warned inline rather than refused, because
  // Michael may have a reason and this is his desk, not a form for strangers.
  const clientCopyWarnings = useMemo(
    () => [
      ...clientCopyProblems(draft.name).map(p => `Name ${p}`),
      ...clientCopyProblems(draft.description ?? '').map(p => `Description ${p}`),
    ],
    [draft.name, draft.description],
  )

  function num(field: EventTypeNumericField, value: string) {
    setDraft(prev => ({ ...prev, [field]: value === '' ? NaN : Number(value) }))
  }

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cool-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-base font-bold text-navy">{type.name}</h3>
            {type.active ? (
              <StatusChip tone="green">Live</StatusChip>
            ) : (
              <StatusChip tone="gray">Off</StatusChip>
            )}
          </div>
          <p className="font-ui mt-0.5 text-[11.5px] text-cool-500">
            /book/{hostSlug}/{type.slug} · {type.durationMinutes} min
          </p>
        </div>
        <button
          type="button"
          className={BTN_QUIET}
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      {open && (
        <div className="px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor={`t-${type.slug}-name`}>
                Name, shown to clients
              </label>
              <input
                id={`t-${type.slug}-name`}
                className={INPUT}
                value={draft.name}
                disabled={disabled}
                onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.active}
                  disabled={disabled}
                  className={FOCUS}
                  onChange={e => setDraft(p => ({ ...p, active: e.target.checked }))}
                />
                <span className="font-ui text-[13px] text-navy">
                  Accepting bookings
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4">
            <label className={LABEL} htmlFor={`t-${type.slug}-desc`}>
              Description, shown to clients
            </label>
            <textarea
              id={`t-${type.slug}-desc`}
              className={`${INPUT} resize-none`}
              rows={2}
              value={draft.description ?? ''}
              disabled={disabled}
              onChange={e => setDraft(p => ({ ...p, description: e.target.value || null }))}
            />
          </div>

          {clientCopyWarnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {clientCopyWarnings.map(w => (
                <li key={w} className="font-ui text-[12px] text-caution">
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(EVENT_TYPE_BOUNDS) as EventTypeNumericField[]).map(field => (
              <div key={field}>
                <label className={LABEL} htmlFor={`t-${type.slug}-${field}`}>
                  {EVENT_TYPE_FIELD_LABELS[field]}
                </label>
                <input
                  id={`t-${type.slug}-${field}`}
                  type="number"
                  className={INPUT}
                  value={Number.isFinite(draft[field]) ? String(draft[field]) : ''}
                  min={EVENT_TYPE_BOUNDS[field].min}
                  max={EVENT_TYPE_BOUNDS[field].max}
                  disabled={disabled}
                  onChange={e => num(field, e.target.value)}
                />
                <p className="font-ui mt-0.5 text-[11px] text-cool-500">
                  {EVENT_TYPE_BOUNDS[field].min} to {EVENT_TYPE_BOUNDS[field].max}
                </p>
              </div>
            ))}
          </div>

          {draft.intakeQuestions.length > 0 && (
            <div className="mt-4">
              <p className={LABEL}>Questions asked at booking</p>
              <ul className="space-y-1">
                {draft.intakeQuestions.map(q => (
                  <li key={q.key} className="font-ui text-[12.5px] text-cool-800">
                    {q.label}{' '}
                    <span className="text-cool-500">
                      ({q.type}
                      {q.required ? ', required' : ', optional'})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="font-ui mt-1 text-[11.5px] text-cool-500">
                Question wording is edited in the database for now. Changing it here is a later
                addition.
              </p>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="mt-3 space-y-1" role="alert">
              {errors.map(e => (
                <li key={e} className="font-ui text-[12px] text-danger">
                  {e}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              className={BTN}
              disabled={disabled || busy || !dirty}
              onClick={async () => {
                const v = validateEventTypeDraft(draft)
                if (!v.ok) {
                  setErrors(v.errors)
                  return
                }
                setErrors([])
                await onSave(v.value)
              }}
            >
              {busy ? 'Saving' : 'Save'}
            </button>
            {dirty && (
              <button
                type="button"
                className={BTN_QUIET}
                disabled={disabled || busy}
                onClick={() => {
                  setDraft(type)
                  setErrors([])
                }}
              >
                Undo changes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Upcoming ────────────────────────────────────────────────────────────────

function Upcoming({
  rows,
  timezone,
  error,
  busy,
  disabled,
  onCancel,
}: {
  rows: UpcomingRow[]
  timezone: string
  error: string | null
  busy: string | null
  disabled: boolean
  onCancel: (id: string, reason: string) => Promise<void>
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  if (error) {
    return (
      <div className={`${CARD} p-6 text-center`}>
        <p className="font-ui text-[13px] text-navy">Could not read upcoming bookings.</p>
        <p className="font-ui mt-1 text-[12px] text-muted">{error}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <p className="font-heading text-base font-bold text-navy">Nothing booked ahead</p>
        <p className="font-ui mx-auto mt-2 max-w-md text-[13px] text-muted">
          Confirmed bookings from here to the end of the booking window will appear in this list.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {rows.map(r => (
        <div key={r.id} className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-ui text-[13px] font-semibold text-navy">
                {fmtWhen(r.startsAt, timezone)}
              </p>
              <p className="font-ui mt-0.5 text-[13px] text-cool-800">
                {r.eventTypeName ?? r.id} with {r.clientName}
              </p>
              <p className="font-ui mt-0.5 text-[12px] text-muted">
                {r.clientPhone} · {r.clientEmail}
                {r.clientTimezone && r.clientTimezone !== timezone ? ` · client is in ${r.clientTimezone}` : ''}
              </p>
              {r.notes && (
                <p className="font-ui mt-2 max-w-prose text-[12.5px] text-cool-800">
                  What they wrote: {r.notes}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {r.calendarStatus === 'written' ? (
                  <StatusChip tone="green">On the calendar</StatusChip>
                ) : (
                  <StatusChip tone="amber" title={r.calendarStatus}>
                    Calendar entry pending
                  </StatusChip>
                )}
                {r.smsConsent && <StatusChip tone="gray">Consented to contact</StatusChip>}
                <StatusChip tone="gray">{r.source}</StatusChip>
              </div>
            </div>

            {confirming === r.id ? null : (
              <button
                type="button"
                className={BTN_QUIET}
                disabled={disabled}
                onClick={() => {
                  setConfirming(r.id)
                  setReason('')
                }}
              >
                Cancel this
              </button>
            )}
          </div>

          {confirming === r.id && (
            <div className="mt-4 rounded-[7px] border border-caution bg-caution-bg p-3">
              <p className="font-ui text-[13px] font-semibold text-navy">
                Cancel this booking?
              </p>
              <p className="font-ui mt-1 text-[12.5px] text-cool-800">
                The client is emailed and the calendar entry is removed. This is the same action
                their own cancel link performs.
              </p>
              <label className={`${LABEL} mt-3`} htmlFor={`c-${r.id}`}>
                Reason, kept on the record
              </label>
              <input
                id={`c-${r.id}`}
                className={INPUT}
                value={reason}
                maxLength={500}
                onChange={e => setReason(e.target.value)}
                placeholder="Double booked"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className={BTN}
                  disabled={busy === `cancel-${r.id}`}
                  onClick={async () => {
                    await onCancel(r.id, reason)
                    setConfirming(null)
                  }}
                >
                  {busy === `cancel-${r.id}` ? 'Cancelling' : 'Yes, cancel it'}
                </button>
                <button type="button" className={BTN_QUIET} onClick={() => setConfirming(null)}>
                  Keep it
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
