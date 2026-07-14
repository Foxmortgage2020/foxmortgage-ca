// Admin command centre navigation — the information architecture for the
// shell. Section names are stable; renaming one later requires a CLAUDE.md
// note. 2026-07-14 redesign: sixteen flat items became five groups plus a
// persistent Ask Fox footer button. Renames recorded in CLAUDE.md: Home →
// Today, Intel → Lender intel, Audit Log → Audit log, Settings → Users &
// settings (named by what the person does, not how it is built). Ask Fox
// left the mid-list nav for the sidebar footer. Nothing else renamed;
// no route removed (tests/shell.test.ts proves router coverage).
//
// Icons are referenced by key (not imported here) so this config stays free
// of client-only imports; components/admin/AdminShell.tsx owns the mapping.

import type { Permission } from './authority'

export type AdminNavGroupKey = 'today' | 'pipeline' | 'market' | 'practice' | 'system'

export const NAV_GROUP_LABELS: Record<Exclude<AdminNavGroupKey, 'today'>, string> = {
  pipeline: 'Pipeline',
  market: 'Market',
  practice: 'Practice',
  system: 'System',
}

export interface AdminNavItem {
  label: string
  href: string
  iconKey: string
  permission: Permission
  group: AdminNavGroupKey
  // One sentence shown on the stub page.
  description: string
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    label: 'Today',
    href: '/portal/admin',
    iconKey: 'LayoutDashboard',
    permission: 'deals.view',
    group: 'today',
    description: 'Exception-first daily command centre for the practice.',
  },
  // ── Pipeline ──────────────────────────────────────────────────────────
  {
    label: 'Deals',
    href: '/portal/admin/deals',
    iconKey: 'FolderOpen',
    permission: 'deals.view',
    group: 'pipeline',
    description:
      'Every active file in one place: Zoho stage, workbench evidence, conditions, and flags side by side.',
  },
  {
    label: 'Approvals',
    href: '/portal/admin/approvals',
    iconKey: 'ClipboardList',
    permission: 'approvals.view',
    group: 'pipeline',
    description:
      'One queue for statement reviews, rate sheet reviews, and shadow scores, with decisions recorded through the gates API.',
  },
  {
    label: 'Renewals',
    href: '/portal/admin/renewals',
    iconKey: 'RefreshCw',
    permission: 'renewals.view',
    group: 'pipeline',
    description:
      'Every funded deal by maturity window, with the payment-shock preview and the lapsed alarm, so no renewal slips again.',
  },
  {
    label: 'Opportunities',
    href: '/portal/admin/opportunities',
    iconKey: 'TrendingUp',
    permission: 'opportunities.view',
    group: 'pipeline',
    description:
      'The Strategic Mortgage Monitoring export as a pipeline: who to call by dollars, Fox’s analysis beside the service’s figure, with scenario prefill, backfill, and a savings report.',
  },
  // ── Market ────────────────────────────────────────────────────────────
  {
    label: 'Rates',
    href: '/portal/admin/rates',
    iconKey: 'Percent',
    permission: 'rates.view',
    group: 'market',
    description:
      'Current approved lender quotes, promos with countdowns, and rate sheet history from the workbench.',
  },
  {
    label: 'Lender intel',
    href: '/portal/admin/intel',
    iconKey: 'Radar',
    permission: 'intel.view',
    group: 'market',
    description:
      'Lender intel items from Roam and Dialpad, triaged into knowledge and rate updates.',
  },
  {
    label: 'Knowledge',
    href: '/portal/admin/knowledge',
    iconKey: 'BookOpen',
    permission: 'knowledge.view',
    group: 'market',
    description:
      'Lender profiles and notes with as-of dates, served from the git-versioned workbench knowledge base.',
  },
  // ── Practice ──────────────────────────────────────────────────────────
  {
    label: 'Revenue',
    href: '/portal/admin/revenue',
    iconKey: 'DollarSign',
    permission: 'revenue.view',
    group: 'practice',
    description:
      'Commission forecast, funded trends and mix, the conversion funnel, and the business-line P&L.',
  },
  {
    label: 'Partners',
    href: '/portal/admin/partners',
    iconKey: 'Users',
    permission: 'partners.provision',
    group: 'practice',
    description:
      'Partner directory, onboarding links, documents, and view-as access to every partner portal.',
  },
  {
    label: 'Compliance',
    href: '/portal/admin/compliance',
    iconKey: 'Shield',
    permission: 'compliance.view',
    group: 'practice',
    description:
      'FSRA-conscious view: credentials, the complaint register, policies with acknowledgments, and per-file compliance cards.',
  },
  {
    label: 'Bookkeeping',
    href: '/portal/bookkeeping',
    iconKey: 'Calculator',
    permission: 'bookkeeping.view',
    group: 'practice',
    description:
      'QBO categorization review queue and production contracts (existing pages, unchanged).',
  },
  {
    label: 'Directory',
    href: '/portal/admin/directory',
    iconKey: 'BookUser',
    permission: 'deals.view',
    group: 'practice',
    description: 'Staff with licence numbers; lender contacts once the workbench grant lands.',
  },
  // ── System ────────────────────────────────────────────────────────────
  {
    label: 'Audit log',
    href: '/portal/admin/audit',
    iconKey: 'ScrollText',
    permission: 'audit.view',
    group: 'system',
    description:
      'Every decision and system action, from the workbench audit log, in reverse chronological order.',
  },
  {
    label: 'Changelog',
    href: '/portal/admin/changelog',
    iconKey: 'History',
    permission: 'knowledge.view',
    group: 'system',
    description:
      'What changed: sheets in force, intel arrivals, and platform releases, grouped by week.',
  },
  {
    label: 'Status',
    href: '/portal/admin/status',
    iconKey: 'Activity',
    permission: 'status.view',
    group: 'system',
    description: 'Is the machine healthy: workbench, Zoho, n8n, deploys, bookkeeping.',
  },
  {
    label: 'Users & settings',
    href: '/portal/admin/settings',
    iconKey: 'Settings',
    permission: 'settings.manage',
    group: 'system',
    description: 'Authority matrix, people, and platform configuration.',
  },
  {
    label: 'Roadmap',
    href: '/portal/admin/roadmap',
    iconKey: 'Map',
    permission: 'roadmap.view',
    group: 'system',
    description: 'The build history and where the platform is going.',
  },
]

// Ask Fox is the persistent sidebar footer button, not a nav-list item.
export const ASK_FOX = {
  label: 'Ask Fox',
  href: '/portal/admin/agent',
  permission: 'agent.use' as Permission,
  description:
    'The practice agent: call prep briefs and call reviews grounded in Zoho, the approved rate book, and the workbench, with CRM changes as confirm cards.',
}

// Presentation scoping on top of existing permissions, never widening them:
// server-side authorization is unchanged and remains the enforcement. A user
// whose internal roles are agent-only sees Today, Pipeline, Market, and Ask
// Fox; Practice and System items leave THEIR nav (the routes still answer
// exactly as server authz dictates on a direct URL).
const AGENT_VISIBLE_GROUPS: AdminNavGroupKey[] = ['today', 'pipeline', 'market']

export function scopeNavForRoles(
  items: AdminNavItem[],
  roles: string[],
): AdminNavItem[] {
  const internal = roles.filter(r =>
    ['admin', 'ops', 'underwriting-reviewer', 'agent'].includes(r),
  )
  const agentOnly = internal.length > 0 && internal.every(r => r === 'agent')
  if (!agentOnly) return items
  return items.filter(i => AGENT_VISIBLE_GROUPS.includes(i.group))
}

// Quick-jump links into the partner-facing portals (admin oversight).
// "View as a partner" (Session 8) opens the governed picker: any partner's
// portal, read-only, logged to FOXCA. The bare portal links below open the
// admin's own (empty) view of each portal shell. This block was not in the
// redesign IA table; it stays as its own sidebar section (nothing falls off
// the map).
export const PORTAL_QUICK_LINKS: { label: string; href: string }[] = [
  { label: 'View as a partner…', href: '/portal/admin/view-as' },
  { label: 'Financial Planner', href: '/portal/fp/dashboard' },
  { label: 'Realtor', href: '/portal/realtor/dashboard' },
  { label: 'Lawyer', href: '/portal/lawyer/dashboard' },
  { label: 'Mortgage Agent', href: '/portal/mortgage-agent/dashboard' },
  { label: 'Investor', href: '/portal/investor/dashboard' },
]
