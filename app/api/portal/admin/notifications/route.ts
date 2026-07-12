// Notification center API (Session 9, Part 2). GET rebuilds the current
// notification set from live signals for the categories the caller can see,
// upserts them (deduped), then returns the caller's list with per-user read
// state and prefs. POST mutates read state / prefs. Every external fetch is
// wrapped so one slow or failing source degrades to fewer notifications and
// never 500s or hangs the bell.

import { NextResponse } from 'next/server'
import { apiPermission, can } from '@/lib/authz'
import { torontoTodayYMD } from '@/lib/dates'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import {
  CATEGORIES,
  DECISION_ACTIONS,
  NOTIFICATION_CATEGORIES,
  credentialExpiryNotifications,
  externalGateDecisionNotifications,
  formIntakeNotifications,
  pendingOfferNotifications,
  renewalCrossingNotifications,
  renewalLapsedNotifications,
  sheetReviewNotifications,
  syncFreshnessNotifications,
  type NotificationCategory,
  type NotificationInput,
} from '@/lib/notifications'
import { getRenewalDeals } from '@/lib/zoho-admin'
import {
  getPrefs,
  listNotificationsForUser,
  markAllRead,
  markRead,
  notificationsStoreConfigured,
  setPref,
  upsertNotification,
} from '@/lib/notifications-store'
import { listCredentials } from '@/lib/compliance'
import { getFormIntakeFailures, getFormIntakeStatus, getN8nStatus } from '@/lib/status'
import { getAgentIdByEmail, getAuditEntries, getOfferQueue, getRateSheetQueue } from '@/lib/underwriting'
import { isDemoMode } from '@/lib/demo'

export const dynamic = 'force-dynamic'

function denial(status: 401 | 403, message: string) {
  return NextResponse.json({ ok: false, message }, { status })
}

export async function GET() {
  // deals.view is the broadest internal read; every internal role holds it.
  const gate = await apiPermission('deals.view')
  if (!gate.ok) return denial(gate.status, gate.message)

  const visible = CATEGORIES.filter(c => can(gate.user, c.permission))
  const visibleKeys = new Set<NotificationCategory>(visible.map(c => c.key))
  // In demo mode the workbench + compliance producers below already run
  // over fixtures (their fetchers are demo-guarded); the form-intake and
  // sync-freshness producers read the REAL FOXCA/n8n status, so they are
  // skipped entirely in demo (guarded here, before the read).
  const demo = isDemoMode()

  const inputs: NotificationInput[] = []

  // Workbench-backed categories share one agent-id lookup.
  let agentId: string | null = null
  if (
    visibleKeys.has('sheet_review') ||
    visibleKeys.has('pending_offers') ||
    visibleKeys.has('gate_decision_external')
  ) {
    try {
      const a = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
      if (a.configured && a.ok) agentId = a.data
    } catch {
      agentId = null
    }
  }

  if (agentId && visibleKeys.has('sheet_review')) {
    try {
      const q = await getRateSheetQueue(agentId)
      if (q.configured && q.ok) inputs.push(...sheetReviewNotifications(q.data))
    } catch {
      /* degrade */
    }
  }

  if (agentId && visibleKeys.has('pending_offers')) {
    try {
      const q = await getOfferQueue(agentId)
      if (q.configured && q.ok) inputs.push(...pendingOfferNotifications(q.data))
    } catch {
      /* degrade */
    }
  }

  if (agentId && visibleKeys.has('gate_decision_external')) {
    try {
      const a = await getAuditEntries(agentId, {}, 50, 0)
      if (a.configured && a.ok) {
        inputs.push(...externalGateDecisionNotifications(a.data.rows, DECISION_ACTIONS))
      }
    } catch {
      /* degrade */
    }
  }

  if (visibleKeys.has('credential_expiry')) {
    try {
      const c = await listCredentials()
      if (c.configured && c.ok) {
        inputs.push(...credentialExpiryNotifications(c.data, torontoTodayYMD()))
      }
    } catch {
      /* degrade */
    }
  }

  if (!demo && visibleKeys.has('form_intake')) {
    try {
      const s = await getFormIntakeStatus()
      if (s.zohoFailed && s.zohoFailed > 0) {
        const failures = await getFormIntakeFailures()
        inputs.push(...formIntakeNotifications(s, failures))
      }
    } catch {
      /* degrade */
    }
  }

  if (!demo && visibleKeys.has('sync_freshness')) {
    try {
      const n = await getN8nStatus()
      if (n.configured) inputs.push(...syncFreshnessNotifications(n.rows))
    } catch {
      /* degrade */
    }
  }

  // Renewals: getRenewalDeals is demo-guarded (fictional in demo), so this
  // producer runs in demo mode too, over fixtures.
  if (visibleKeys.has('renewal_crossing') || visibleKeys.has('renewal_lapsed')) {
    try {
      const r = await getRenewalDeals()
      const today = torontoTodayYMD()
      if (visibleKeys.has('renewal_crossing')) {
        inputs.push(...renewalCrossingNotifications(r.withMaturity, today))
      }
      if (visibleKeys.has('renewal_lapsed')) {
        inputs.push(...renewalLapsedNotifications(r.withMaturity, today))
      }
    } catch {
      /* degrade */
    }
  }

  // Demo mode: the producers above already ran over fictional fixtures
  // (the fetchers are demo-guarded), so `inputs` is entirely synthetic.
  // Return it directly — never upsert to or list from the real FOXCA store,
  // so the bell shows demo notifications and never a persisted real one.
  if (demo) {
    const demoItems = inputs.map((inp, i) => ({
      id: `demo-${i}`,
      dedupKey: inp.dedupKey,
      category: inp.category,
      title: inp.title,
      body: inp.body,
      href: inp.href,
      createdAt: inp.createdAt,
      read: false,
    }))
    return NextResponse.json({
      ok: true,
      configured: true,
      unread: demoItems.length,
      items: demoItems,
      prefs: [],
      categories: visible.map(c => ({ key: c.key, label: c.label, description: c.description })),
    })
  }

  // Best-effort upsert; a not-configured or failing store degrades to an
  // empty bell rather than an error.
  for (const inp of inputs) {
    try {
      await upsertNotification(inp)
    } catch {
      /* degrade */
    }
  }

  let items: {
    id: string
    dedupKey: string
    category: NotificationCategory
    title: string
    body: string
    href: string
    createdAt: string
    read: boolean
  }[] = []
  let prefs: { category: string; enabled: boolean }[] = []

  try {
    const prefsRes = await getPrefs(gate.user.userId)
    if (prefsRes.configured && prefsRes.ok) {
      prefs = prefsRes.data.map(p => ({ category: p.category, enabled: p.enabled }))
    }
  } catch {
    /* degrade */
  }
  const disabled = new Set(prefs.filter(p => p.enabled === false).map(p => p.category))

  try {
    const listRes = await listNotificationsForUser(gate.user.userId)
    if (listRes.configured && listRes.ok) {
      items = listRes.data.filter(n => visibleKeys.has(n.category) && !disabled.has(n.category))
    }
  } catch {
    /* degrade */
  }

  const unread = items.filter(n => !n.read).length

  return NextResponse.json({
    ok: true,
    configured: notificationsStoreConfigured(),
    unread,
    items,
    prefs,
    categories: visible.map(c => ({
      key: c.key,
      label: c.label,
      description: c.description,
    })),
  })
}

export async function POST(req: Request) {
  const gate = await apiPermission('deals.view')
  if (!gate.ok) return denial(gate.status, gate.message)

  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    id?: string
    category?: string
    enabled?: boolean
  }

  try {
    if (body.action === 'read' && body.id) {
      await markRead(body.id, gate.user.userId)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'read_all') {
      await markAllRead(gate.user.userId)
      return NextResponse.json({ ok: true })
    }
    if (
      body.action === 'set_pref' &&
      body.category &&
      (NOTIFICATION_CATEGORIES as readonly string[]).includes(body.category)
    ) {
      await setPref(gate.user.userId, body.category, body.enabled !== false)
      return NextResponse.json({ ok: true })
    }
  } catch {
    return NextResponse.json({ ok: false, message: 'The notification store is unavailable.' }, { status: 503 })
  }

  return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
}
