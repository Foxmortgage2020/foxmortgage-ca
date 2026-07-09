// Roadmap: the eight-session build plan, so anyone onboarded later can see
// where the platform is going. Static content, updated each session.

import { requirePermission } from '@/lib/authz'

export const dynamic = 'force-dynamic'

type SessionStatus = 'shipped' | 'next' | 'planned'

const SESSIONS: {
  n: number
  title: string
  status: SessionStatus
  repo: string
  items: string[]
}[] = [
  {
    n: 1,
    title: 'Command center foundation',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Repo audit (docs/portal-audit-2026-07.md)',
      'Full navigation architecture with permission gating',
      'Exception-first Home with live read-only data',
      'Status page and authority matrix groundwork',
      'Read-only workbench wiring (lib/underwriting.ts)',
    ],
  },
  {
    n: 2,
    title: 'Gates API and read-only database role',
    status: 'next',
    repo: 'fox-underwriting',
    items: [
      'Database-enforced read-only role replaces the service key posture',
      'Gates API for approval actions, enforcing the same permission keys as this portal',
      'Amended guardrail: dependency points one direction only (this portal depends on fox-underwriting, never the reverse)',
    ],
  },
  {
    n: 3,
    title: 'Deals, Approvals, Audit Log',
    status: 'planned',
    repo: 'foxmortgage-ca',
    items: [
      'Deals workspace joining Zoho stages with workbench evidence, conditions, and flags',
      'Approval decisions (statement reviews, rate sheet reviews, shadow scores) through the gates API',
      'Audit Log viewer over the workbench audit trail',
    ],
  },
  {
    n: 4,
    title: 'Rates, Intel, Knowledge',
    status: 'planned',
    repo: 'foxmortgage-ca',
    items: [
      'Current approved quotes and promo countdowns',
      'Lender intel triage',
      'Knowledge search cited back to source documents',
    ],
  },
  {
    n: 5,
    title: 'Compliance',
    status: 'planned',
    repo: 'foxmortgage-ca',
    items: ['FSRA-facing completeness and disclosure view per file'],
  },
  {
    n: 6,
    title: 'Revenue and Partners',
    status: 'planned',
    repo: 'foxmortgage-ca',
    items: [
      'Funded production history and commission tracking',
      'Partner management deepening on top of the existing directory',
    ],
  },
  {
    n: 7,
    title: 'Reserved',
    status: 'planned',
    repo: 'tbd',
    items: ['Scope is set in a later brief.'],
  },
  {
    n: 8,
    title: 'PWA and polish',
    status: 'planned',
    repo: 'foxmortgage-ca',
    items: ['PWA manifest, mobile polish, and the wrap-up pass'],
  },
]

const STATUS_CHIP: Record<SessionStatus, { label: string; cls: string }> = {
  shipped: { label: 'Shipped', cls: 'bg-lime/20 text-navy border border-lime/50' },
  next: { label: 'Next', cls: 'bg-navy text-white' },
  planned: { label: 'Planned', cls: 'bg-gray-100 text-gray-600' },
}

export default async function RoadmapPage() {
  await requirePermission('roadmap.view')

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Roadmap</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Eight sessions turn this portal into the system of engagement for the whole operation:
          Michael today, staff and recruited agents later.
        </p>
      </div>

      {/* Architecture primer */}
      <div className="bg-navy text-white rounded-xl p-5 mb-6">
        <h2 className="font-heading font-bold text-lime text-base mb-2">Three-layer architecture</h2>
        <ul className="text-sm font-body text-gray-300 space-y-1.5">
          <li>
            <span className="text-white font-semibold">Zoho CRM</span> stays the system of record
            for relationships, stages, and tasks.
          </li>
          <li>
            <span className="text-white font-semibold">fox-underwriting workbench</span> (separate
            repo and Supabase project) is the system of record for underwriting truth: evidence,
            calcs, conditions, flags, reviews, audit log.
          </li>
          <li>
            <span className="text-white font-semibold">This portal</span> reads both. Workbench
            write actions arrive in Session 3 through the gates API only. Workbench logic is never
            re-implemented here.
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        {SESSIONS.map(s => (
          <div key={s.n} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-heading text-navy font-bold">Session {s.n}</span>
              <span className="font-body text-gray-700">{s.title}</span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[s.status].cls}`}
              >
                {STATUS_CHIP[s.status].label}
              </span>
              <span className="text-[11px] text-gray-400 ml-auto">{s.repo}</span>
            </div>
            <ul className="mt-2 text-sm font-body text-gray-600 list-disc pl-5 space-y-1">
              {s.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-2">After the build</h2>
        <p className="text-sm font-body text-gray-600">
          Post-build options are tracked as they are decided and this page updates each session.
          Section names in the sidebar are stable; a rename requires a CLAUDE.md note.
        </p>
      </div>
    </div>
  )
}
