// Admin command center navigation — the information architecture decision
// for the whole eight-session build. Section names are stable; renaming one
// later requires a CLAUDE.md note.
//
// Icons are referenced by key (not imported here) so this config stays free
// of client-only imports; components/admin/AdminShell.tsx owns the mapping.

import type { Permission } from './authority'

export interface AdminNavItem {
  label: string
  href: string
  iconKey: string
  permission: Permission
  // Session number that builds the section out. Absent = live today.
  arrivesInSession?: number
  // One sentence shown on the stub page.
  description: string
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    label: 'Home',
    href: '/portal/admin',
    iconKey: 'LayoutDashboard',
    permission: 'deals.view',
    description: 'Exception-first daily command center for the practice.',
  },
  {
    label: 'Deals',
    href: '/portal/admin/deals',
    iconKey: 'FolderOpen',
    permission: 'deals.view',
    arrivesInSession: 3,
    description:
      'Every active file in one place: Zoho stage, workbench evidence, conditions, and flags side by side.',
  },
  {
    label: 'Approvals',
    href: '/portal/admin/approvals',
    iconKey: 'ClipboardList',
    permission: 'approvals.view',
    arrivesInSession: 3,
    description:
      'One queue for statement reviews, rate sheet reviews, and shadow scores, with decisions recorded through the gates API.',
  },
  {
    label: 'Rates',
    href: '/portal/admin/rates',
    iconKey: 'Percent',
    permission: 'rates.view',
    arrivesInSession: 4,
    description:
      'Current approved lender quotes, promos with countdowns, and rate sheet history from the workbench.',
  },
  {
    label: 'Intel',
    href: '/portal/admin/intel',
    iconKey: 'Radar',
    permission: 'intel.view',
    arrivesInSession: 4,
    description:
      'Lender intel items from Roam and Dialpad, triaged into knowledge and rate updates.',
  },
  {
    label: 'Knowledge',
    href: '/portal/admin/knowledge',
    iconKey: 'BookOpen',
    permission: 'knowledge.view',
    arrivesInSession: 4,
    description:
      'Lender guidelines and program knowledge, searchable and cited back to source documents.',
  },
  {
    label: 'Compliance',
    href: '/portal/admin/compliance',
    iconKey: 'Shield',
    permission: 'compliance.view',
    arrivesInSession: 5,
    description:
      'FSRA-facing view: disclosures, document completeness, and audit readiness per file.',
  },
  {
    label: 'Revenue',
    href: '/portal/admin/revenue',
    iconKey: 'DollarSign',
    permission: 'revenue.view',
    arrivesInSession: 6,
    description:
      'Funded production, commission tracking, and goal pacing history across years.',
  },
  {
    label: 'Partners',
    href: '/portal/admin/partners',
    iconKey: 'Users',
    permission: 'partners.provision',
    description:
      'Partner directory, onboarding links, documents, and view-as access to every partner portal.',
  },
  {
    label: 'Bookkeeping',
    href: '/portal/bookkeeping',
    iconKey: 'Calculator',
    permission: 'bookkeeping.view',
    description:
      'QBO categorization review queue and production contracts (existing pages, unchanged).',
  },
  {
    label: 'Audit Log',
    href: '/portal/admin/audit',
    iconKey: 'ScrollText',
    permission: 'audit.view',
    arrivesInSession: 3,
    description:
      'Every decision and system action, from the workbench audit log, in reverse chronological order.',
  },
  {
    label: 'Status',
    href: '/portal/admin/status',
    iconKey: 'Activity',
    permission: 'status.view',
    description: 'Is the machine healthy: workbench, Zoho, n8n, deploys, bookkeeping.',
  },
  {
    label: 'Settings',
    href: '/portal/admin/settings',
    iconKey: 'Settings',
    permission: 'settings.manage',
    description: 'Authority matrix and platform configuration.',
  },
  {
    label: 'Roadmap',
    href: '/portal/admin/roadmap',
    iconKey: 'Map',
    permission: 'roadmap.view',
    description: 'The eight-session build plan and where the platform is going.',
  },
]

// Quick-jump links into the partner-facing portals (admin oversight).
export const PORTAL_QUICK_LINKS: { label: string; href: string }[] = [
  { label: 'Financial Planner', href: '/portal/fp/dashboard' },
  { label: 'Realtor', href: '/portal/realtor/dashboard' },
  { label: 'Lawyer', href: '/portal/lawyer/dashboard' },
  { label: 'Mortgage Agent', href: '/portal/mortgage-agent/dashboard' },
  { label: 'Investor', href: '/portal/investor/dashboard' },
]
