// Admin command centre navigation — the information architecture for the
// shell. Section names are stable; renaming one later requires a CLAUDE.md
// note. B3 (2026-07-17): the menu takes the lifecycle's shape — eleven
// working destinations became eight across two honest groups. THE BOOK is
// the files (Deals, Approvals, Beyond funding — the lifecycle's last phase
// as a page); THE PRACTICE is the business around them (Lenders, Revenue,
// Partners, Compliance). The three Market pages merged into Lenders
// (?tab=rates|intel|knowledge), Renewals + Opportunities merged into
// Beyond funding (?tab=renewals|opportunities), Bookkeeping folded into
// Revenue (?tab=bookkeeping), and Directory joined System per the B3 IA.
// Every old path redirects permanently (next.config.js). System is
// otherwise untouched. Renames recorded in the CLAUDE.md ledger.
//
// Icons are referenced by key (not imported here) so this config stays free
// of client-only imports; components/admin/AdminShell.tsx owns the mapping.

import type { Permission } from './authority'

export type AdminNavGroupKey = 'today' | 'book' | 'practice' | 'system'

export const NAV_GROUP_LABELS: Record<Exclude<AdminNavGroupKey, 'today'>, string> = {
  book: 'The book',
  practice: 'The practice',
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
  // ── The book ──────────────────────────────────────────────────────────
  {
    label: 'Deals',
    href: '/portal/admin/underwriting',
    iconKey: 'FolderOpen',
    permission: 'deals.view',
    group: 'book',
    description:
      'Every live file by lifecycle phase, with the next action on each row, as a list or a board.',
  },
  {
    label: 'Approvals',
    href: '/portal/admin/approvals',
    iconKey: 'ClipboardList',
    permission: 'approvals.view',
    group: 'book',
    description:
      'One queue for statement reviews, rate sheet reviews, and shadow scores, with decisions recorded through the gates API.',
  },
  {
    // The lifecycle's last phase as a page: the Renewal Radar and the
    // Strategic Mortgage Monitoring opportunity board, one destination.
    // Permission mirrors the renewals surface; the page resolves per-tab
    // exactly as the two standalone pages gated before.
    label: 'Beyond funding',
    href: '/portal/admin/beyond',
    iconKey: 'RefreshCw',
    permission: 'renewals.view',
    group: 'book',
    description:
      'Funded clients on the radar: renewals by maturity window and the monitoring opportunity board, in one place.',
  },
  // ── The practice ──────────────────────────────────────────────────────
  {
    // Rates + Lender intel + Knowledge, one lender destination. Keyed on
    // knowledge.view (the widest of the three merged permissions) so every
    // role that could reach Knowledge still can; the page lands each user
    // on the first tab their permissions cover.
    label: 'Lenders',
    href: '/portal/admin/lenders',
    iconKey: 'Percent',
    permission: 'knowledge.view',
    group: 'practice',
    description:
      'The lender book in one place: approved rates and scenarios, the intel feed, and the knowledge base.',
  },
  {
    label: 'Revenue',
    href: '/portal/admin/revenue',
    iconKey: 'DollarSign',
    permission: 'revenue.view',
    group: 'practice',
    description:
      'Commission forecast, funded trends and mix, the conversion funnel, the business-line P&L, and bookkeeping.',
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
  // ── System ────────────────────────────────────────────────────────────
  {
    label: 'Directory',
    href: '/portal/admin/directory',
    iconKey: 'BookUser',
    permission: 'deals.view',
    group: 'system',
    description: 'Staff with licence numbers; lender contacts once the workbench grant lands.',
  },
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
// whose internal roles are agent-only sees Today, The book, and The practice
// (their can() filter narrows those to what they hold — today that is Deals
// plus Lenders-for-knowledge); System items leave THEIR nav (the routes
// still answer exactly as server authz dictates on a direct URL).
const AGENT_VISIBLE_GROUPS: AdminNavGroupKey[] = ['today', 'book', 'practice']

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
