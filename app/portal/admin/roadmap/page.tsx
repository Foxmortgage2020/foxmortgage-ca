// Roadmap: the command center build plan and its real history, so anyone
// onboarded later can see where the platform is going and what already
// shipped. Updated every session as part of the CLAUDE.md closing ritual
// (session ledger, config/changelog.ts entry, this page). Staleness here
// is a bug.

import { requirePermission } from '@/lib/authz'

export const dynamic = 'force-dynamic'

type SessionStatus = 'shipped' | 'current' | 'next' | 'planned'

const SESSIONS: {
  n: string
  title: string
  status: SessionStatus
  repo: string
  items: string[]
}[] = [
  {
    n: '1',
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
    n: '1.5',
    title: 'Hotfix: public forms were dropping submissions',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Persist-first form intake pipeline (Supabase capture, then Zoho, then Resend, then an honest response)',
      'Honeypot and validation on the public pair; attribution on the referral endpoint',
    ],
  },
  {
    n: '2',
    title: 'Gates API and read-only database role',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'Database-enforced portal_readonly role replaced the service key posture (service key deleted)',
      'Gates API for approval decisions, enforcing the same permission keys as this portal',
      'Amended guardrail: dependency points one direction only (this portal depends on fox-underwriting, never the reverse)',
    ],
  },
  {
    n: '3',
    title: 'Deals, Approvals, Audit Log',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Approvals desk live over the four gate queues with two-tap confirms and 409 reconciliation',
      'Deals list and deal room joining Zoho stages with workbench evidence, conditions, and flags',
      'Audit viewer with filters, server pagination, and capped CSV export',
      'Browser-minted gates token contract verified live and documented',
    ],
  },
  {
    n: '3.5',
    title: 'Workbench micro-sessions 1 and 2',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'Micro-session 1: shadow empty-calcs 422, token-mint contract correction, deal room grants (16-table surface), decided_by convention',
      'Micro-session 2: knowledge read endpoints, conditions decision gate, zoho_potential_id backfill for the deal rooms',
    ],
  },
  {
    n: '4',
    title: 'Rates, Intel, Knowledge, Changelog, Directory',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rates browser over the approved quote set with digest strip and promo countdowns',
      'Knowledge base pages with as-of discipline, draft and withheld-profile handling',
      'Intel feed with review outcomes; changelog; staff directory',
      'Conditions decisions in the deal room; terminal-deal filtering; form intake acknowledged path',
    ],
  },
  {
    n: '5',
    title: 'Rates v2: scenario-driven decision tool',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Describe the deal, see which lenders win it, best rate first, from Michael-approved sheets',
      'Three levels: lender results, lender drill-in, product detail with approval provenance',
      'Pin up to three products, compare side by side, export the client-ready PDF (download only)',
      'Deal room prefill: find rates for this deal, read-only',
    ],
  },
  {
    n: '5.5',
    title: 'Workbench: variable rates and parser coverage',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'rate_type, signed prime_variance, cashback_pct, program_notes on rate_quotes (migration 0029); rate nullable behind the priced check',
      'Prime reference and floating mechanism notes served on /api/knowledge/rates-reference; quote_slugs aliases published on the knowledge index',
      'Parser book 5 to 21 lenders; number_links granted as the 17th read-only table; addendum decisions on the sheet gate',
      'Left Michael a 25-sheet, 719-quote review queue',
    ],
  },
  {
    n: '6',
    title: 'Floating rates on screen, and Compliance',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rate type as identity everywhere: fixed plain, adjustable and variable badged distinctly, discount-first with effective rates computed against served prime and labeled with its as-of',
      'Cash back tiers as first-class rows with verbatim program conditions; promo offers as badged scenario results (the Scotia 60-day special)',
      'Approvals sheet cards print floating ranges and cash back tier counts for the 719-quote sitting; Directory renders the learned numbers',
      'Compliance module: credential register feeding the attention rail (60 and 14 day thresholds), complaint and incident register, versioned policy library with acknowledgments, per-file compliance cards with an honest posture rule',
    ],
  },
  {
    n: '7',
    title: 'Revenue and Partners',
    status: 'next',
    repo: 'foxmortgage-ca',
    items: [
      'Funded production history and commission tracking',
      'Partner management deepening on top of the existing directory',
    ],
  },
  {
    n: '8',
    title: 'Multi-user hardening',
    status: 'planned',
    repo: 'foxmortgage-ca + fox-underwriting',
    items: [
      'Per-agent tenancy end to end for the first non-Michael users',
      'Role review against the authority matrix before any second human decides anything',
    ],
  },
  {
    n: '9',
    title: 'PWA and polish',
    status: 'planned',
    repo: 'foxmortgage-ca',
    items: ['PWA manifest, mobile polish, and the wrap-up pass'],
  },
]

const STATUS_CHIP: Record<SessionStatus, { label: string; cls: string }> = {
  shipped: { label: 'Shipped', cls: 'bg-lime/20 text-navy border border-lime/50' },
  current: { label: 'In progress', cls: 'bg-navy text-white' },
  next: { label: 'Next', cls: 'bg-navy/80 text-white' },
  planned: { label: 'Planned', cls: 'bg-gray-100 text-gray-600' },
}

export default async function RoadmapPage() {
  await requirePermission('roadmap.view')

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Roadmap</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          The command center build: what shipped, what is in progress, and what follows. This page
          updates every session alongside the ledger and the changelog; the interstitial rows are
          hotfixes and workbench micro-sessions, kept so the history reads true.
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
            <span className="text-white font-semibold">This portal</span> reads both through a
            database-enforced read-only role. Every decision write flows through the gates API;
            workbench logic is never re-implemented here.
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
