// Your day — today's Microsoft calendar (read-only) beside the live Zoho task
// list. Two cards side by side at desktop, stacked at phone. The task rows are
// interactive (TaskList): completing a task writes to Zoho through the gated
// route, Zoho stays the source of truth. The calendar is fail-soft: an outage
// or missing env renders a quiet line or the connect state, never breaking the
// page (see lib/ms-calendar.ts). No lime here (the shell audit walks this file).

import { Band, EmptyBand } from '@/components/admin/today/ui'
import TaskList from '@/components/admin/today/TaskList'
import type { PrioritizedTasks } from '@/lib/today'
import type { CalendarResult, CalendarEvent } from '@/lib/ms-calendar'

const ZOHO_TASKS_TAB = 'https://crm.zoho.com/crm/org906105026/tab/Tasks'

// The teaching connect state, shown when the Microsoft calendar is not wired up
// (env absent). No fake events ever render here.
function CalendarConnectState() {
  return (
    <Band title="Your calendar">
      <p className="font-ui text-sm text-muted leading-relaxed">
        Your Microsoft calendar events for today will show here once it is connected, so your
        meetings and your files sit in one place.
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          disabled
          className="inline-flex items-center rounded-[8px] border border-hairline px-3.5 py-2 font-ui text-[13px] font-semibold text-muted-2 cursor-not-allowed"
        >
          Connect your Microsoft calendar
        </button>
        <span className="font-ui text-[11px] text-muted-2">Ask your admin to set it up</span>
      </div>
    </Band>
  )
}

// One event row. Past events read muted; an in-progress event reads as now (an
// ink-navy left accent and a small "now" marker); all-day and upcoming read
// plainly. Never lime — status urgency is not a queued decision.
function EventRow({ e }: { e: CalendarEvent }) {
  const past = e.status === 'past'
  const now = e.status === 'now'
  const accent = now ? 'border-ink-navy' : 'border-hairline'
  const timeColor = past ? 'text-muted-2' : now ? 'text-ink-navy' : 'text-ink'
  const subjColor = past ? 'text-muted-2' : 'text-ink'
  const sub = [e.location, e.isOnline ? 'Online' : null].filter(Boolean).join(' · ')
  return (
    <li className={`flex gap-3 border-l-2 pl-2.5 ${accent}`}>
      <span
        className={`w-[4.25rem] shrink-0 font-ui text-[12px] font-semibold tabular-nums leading-snug ${timeColor}`}
        title={e.rangeLabel}
      >
        {e.timeLabel}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className={`font-ui text-sm leading-snug ${subjColor} ${past ? '' : 'font-medium'}`}>
            {e.subject}
          </span>
          {now ? (
            <span className="shrink-0 font-ui text-[10px] font-bold uppercase tracking-wide text-ink-navy">
              now
            </span>
          ) : null}
        </span>
        {sub ? <span className="mt-0.5 block font-ui text-[11px] text-muted truncate">{sub}</span> : null}
      </span>
    </li>
  )
}

function CalendarCard({ calendar }: { calendar: CalendarResult }) {
  // Absent env: the teaching connect state.
  if (!calendar.configured) return <CalendarConnectState />
  // Runtime failure: one quiet line, and the rest of the page is unaffected.
  if (!calendar.ok) {
    return (
      <Band title="Your calendar">
        <EmptyBand>Calendar is not available right now.</EmptyBand>
      </Band>
    )
  }
  // Connected but nothing booked: a teaching empty state.
  if (calendar.events.length === 0) {
    return (
      <Band title="Your calendar">
        <EmptyBand>Nothing on your calendar today. New meetings show here as they are booked.</EmptyBand>
      </Band>
    )
  }
  return (
    <Band
      title="Your calendar"
      action={
        <span className="font-ui text-[11px] text-muted tabular-nums">
          {calendar.events.length} today
        </span>
      }
    >
      <ul className="space-y-2">
        {calendar.events.map(e => (
          <EventRow key={e.key} e={e} />
        ))}
      </ul>
    </Band>
  )
}

function TasksCard({ tasks, todayYMD }: { tasks: PrioritizedTasks; todayYMD: string }) {
  const action =
    tasks.total > 0 ? (
      <span className="font-ui text-[11px] text-muted tabular-nums">
        {tasks.overdueCount} overdue
      </span>
    ) : null

  return (
    <Band title="Tasks" action={action}>
      {tasks.total === 0 ? (
        <p className="font-ui text-sm text-muted leading-relaxed">
          Nothing is due today. New tasks show here as they come due. Add one in Zoho when you need
          to remember something.
        </p>
      ) : (
        <>
          <TaskList tasks={tasks.top} todayYMD={todayYMD} />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline pt-2.5">
            {tasks.overflow > 0 ? (
              <a
                href={ZOHO_TASKS_TAB}
                target="_blank"
                rel="noreferrer"
                className="font-ui text-[12px] font-semibold text-ink hover:text-ink-navy underline decoration-hairline underline-offset-4"
              >
                {tasks.overflow} more in Zoho
              </a>
            ) : null}
            {tasks.overdueCount > 0 ? (
              <a
                href={ZOHO_TASKS_TAB}
                target="_blank"
                rel="noreferrer"
                className="font-ui text-[12px] font-semibold text-ink hover:text-ink-navy underline decoration-hairline underline-offset-4"
              >
                Catch-up sweep
              </a>
            ) : null}
          </div>
        </>
      )}
    </Band>
  )
}

export default function YourDay({
  tasks,
  calendar,
  todayYMD,
}: {
  tasks: PrioritizedTasks | null
  calendar: CalendarResult
  todayYMD: string
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CalendarCard calendar={calendar} />
      {tasks === null ? (
        <Band title="Tasks">
          <p className="font-ui text-sm text-muted leading-relaxed">
            Zoho tasks are unavailable right now. Check Status.
          </p>
        </Band>
      ) : (
        <TasksCard tasks={tasks} todayYMD={todayYMD} />
      )}
    </div>
  )
}
