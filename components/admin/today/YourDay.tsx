// Your day — the calendar (teaching empty state until the Microsoft build
// lands) beside the live Zoho task list. Two cards side by side at desktop,
// stacked at phone. No writes to Zoho.

import Link from 'next/link'
import { Band, RelativeChip } from '@/components/admin/today/ui'
import type { PrioritizedTasks } from '@/lib/today'

const ZOHO_TASKS_TAB = 'https://crm.zoho.com/crm/org906105026/tab/Tasks'
const zohoTaskUrl = (id: string) => `https://crm.zoho.com/crm/org906105026/tab/Tasks/${id}`

function CalendarCard() {
  // Teaching empty state. The button is the future entry point for the
  // Microsoft calendar connection; it is inert until that build lands (out of
  // scope this session). No fake events ever render here.
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
        <span className="font-ui text-[11px] text-muted-2">Coming soon</span>
      </div>
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
          <ul className="space-y-2.5">
            {tasks.top.map(t => (
              <li key={t.id} className="flex items-start justify-between gap-2.5">
                <div className="min-w-0">
                  <a
                    href={zohoTaskUrl(t.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-ui text-sm text-ink hover:text-ink-navy leading-snug"
                  >
                    {t.subject}
                  </a>
                  <div className="mt-0.5 flex items-center gap-2 font-ui text-[11px] text-muted">
                    {t.priority ? <span>{t.priority} priority</span> : null}
                    {t.roomHref && t.dealRef ? (
                      <Link
                        href={t.roomHref}
                        className="font-semibold text-ink-navy underline decoration-hairline underline-offset-2 hover:decoration-ink-navy tabular-nums"
                      >
                        {t.dealRef}
                      </Link>
                    ) : null}
                  </div>
                </div>
                {t.dueDate ? (
                  <div className="shrink-0">
                    <RelativeChip targetYMD={t.dueDate} todayYMD={todayYMD} verb="due" />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
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
  todayYMD,
}: {
  tasks: PrioritizedTasks | null
  todayYMD: string
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <CalendarCard />
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
