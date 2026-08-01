// The Tasks page (A2, 2026-08-01) — the native task list that replaces Zoho
// Tasks as Michael's daily operating surface.
//
// SERVER COMPONENT DOES NOT READ. The Today view needs a gates token, and a
// gates token can only be minted in the browser (a backend-minted template
// token carries no azp claim and is refused 401 by design). So this file gates
// and hands off; TasksToday does the reading.
//
// Gated on tasks.view (admin, ops, underwriting-reviewer, agent) — a read for
// every internal role. tasks.manage (admin only) is resolved here and passed
// down, so a non-admin sees the list with no action controls at all rather
// than controls that fail at the server. The server is still the enforcement:
// every write route runs apiPermission('tasks.manage') regardless.
//
// This page is NOT the legacy Zoho Tasks card on /portal/admin. Both are live
// on purpose — Zoho Tasks remain the operating list until Michael declares the
// flip (block A3). Nothing on this page writes to Zoho.

import { can, getSessionUser, requirePermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import TasksToday from '@/components/admin/TasksToday'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  await requirePermission('tasks.view')
  const user = await getSessionUser()
  // Decision controls are hidden in demo mode, matching the approvals desk and
  // the deal room (Session 9 posture).
  const canManage = can(user, 'tasks.manage') && !isDemoMode()

  return (
    <main className="p-4 sm:p-6">
      <h1 className="font-heading text-navy text-xl">Tasks</h1>
      <p className="mt-1 max-w-2xl text-sm text-cool-600">
        Everything open, by when it is due. Native store — nothing here writes to Zoho.
      </p>
      <TasksToday canManage={canManage} />
    </main>
  )
}
