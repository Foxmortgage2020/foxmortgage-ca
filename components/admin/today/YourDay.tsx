// Your day — the calendar (teaching empty state until the Microsoft build
// lands) beside the live Zoho task list. Two cards side by side at desktop,
// stacked at phone. The task rows are interactive (TaskList): completing a
// task writes to Zoho through the gated route, Zoho stays the source of truth.

import { Band } from '@/components/admin/today/ui'
import TaskList from '@/components/admin/today/TaskList'
import type { PrioritizedTasks } from '@/lib/today'

const ZOHO_TASKS_TAB = 'https://crm.zoho.com/crm/org906105026/tab/Tasks'

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
