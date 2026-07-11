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
    n: '6.5',
    title: 'Ask Fox: the practice agent (Call Prep and Call Review)',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'In-portal chat over the Anthropic API with six enumerated read tools (Zoho, workbench, the approved rate book, lender knowledge); every figure sourced, gaps named, never guessed',
      'Call Prep one-tap briefs from deal rooms; Call Review grades pasted transcripts against the versioned rubric with evidence',
      'CRM changes and tasks only as confirm cards Michael taps; no gate actions, no send capability; every conversation kept as a supervision record',
      'Needs ANTHROPIC_API_KEY on Vercel to answer; renders the honest not-configured state until then',
      'v2 (planned): Dialpad-automatic Call Review, transcripts flowing in through the existing n8n call pipeline without paste',
    ],
  },
  {
    n: '7',
    title: 'Revenue and Partners',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Commission forecast by close month: stage-weighted, recorded commissions first, comp model estimates labeled everywhere else (config/comp.ts, confirm-bps placeholders for Michael)',
      'Funded trends with mix charts that render only at real field coverage; conversion funnel with its honest method caveat; goal pacing deep view with the gap in dollars and files',
      'Partners ranked for Monday attention: health tiers (config/partner-tiers.ts), referral stats, attributed revenue, portal sign-in recency read server-side; detail pages gain referred files and cadence',
      'Business-line P&L tile renders its honest not-connected state; the exact requirements to light it are listed on the page (no production QBO path exists yet)',
      'Ask Fox v2 prompt: checks open Zoho tasks before proposing a card, references covering tasks instead of duplicating; chat gained the thinking indicator',
    ],
  },
  {
    n: '8',
    title: 'Multi-user hardening',
    status: 'shipped',
    repo: 'foxmortgage-ca + fox-underwriting',
    items: [
      'Roles live and verified: ops / underwriting-reviewer / agent baselines recorded in the authority matrix, every admin page and API gates on permission keys (zero role literals), per-role surfaces proven with dev-instance test users',
      'Settings gains the effective-access view: pick a role, see every page and action it reaches — the supervision answer to "what can your staff do"',
      'View-as formalized: picker under the portals nav, structurally read-only (controls absent + server rejection, both tested), every session logged to FOXCA and listed under Audit Log',
      'Provisioning wizard at Settings → People: staff, partner (Zoho id picked never typed), agent (workbench half via POST /api/gates/agents with setup_remaining rendered honestly); who-provisioned-whom recorded',
      'Offboarding rehearsed: one two-tap action bans and revokes sessions, a persisted checklist covers grants, partner attribution, agent scope, and compliance credentials; nothing deletes',
    ],
  },
  {
    n: '9',
    title: 'The finale — PWA, notifications, search, demo mode',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'PWA: on-brand manifest + icon set (maskable), a security-first service worker that never caches an authenticated response, an offline fallback, and polite dismissible install hints on the admin and partner shells',
      'Notification center: a bell + badge backed by a FOXCA table (per-user read state, per-category toggles) producing five categories from signals the portal already computes — including off-portal CLI gate decisions, so the desk and the terminal are one world',
      'Global search: cmd-K across deals (workbench refs + Zoho names), contacts and partners (Zoho), lender knowledge, and navigation — grouped, keyboard-driven, debounced server-side, honest when a source is slow',
      'Demo mode: an admin-only, env-fenced toggle that swaps the whole command center to fictional fixtures at the fetcher boundary — zero real reads, writes disabled, a persistent banner — the recruiting instrument with no client on screen',
      'Finale sweep: legacy mock pages removed, the Daily Deal Briefing retired (the Home rail serves it live), the partner shell made responsive, and the roadmap graduated',
    ],
  },
  {
    n: '10',
    title: 'Rates v3: tabs, lender browse, logos, and the promos board',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rates restructured into four URL-addressable tabs (Scenario default, Lenders, Promos, All quotes); the scenario lender-card click fixed with a real affordance and a scroll-to-top drill-in',
      'LenderMark: a real logo from public/lenders/ or an on-brand navy-and-lime monogram fallback, everywhere a lender is named; no manifest to maintain',
      'Lenders tab: browse the approved book with honest per-class headline rates and the deepest floating discount (adjustable and variable kept apart), plus the three-state coverage map (live / awaiting approval / coverage pending)',
      'Promos tab: the offer book as its own board, soonest to expire first, each card citing its announcement; saved scenarios per user through FOXCA narrow functions',
      'A test locks the client rate PDF against ever disclosing lender compensation to a borrower',
    ],
  },
  {
    n: '11',
    title: 'The offers desk: promotional offers become approvable',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A fifth Offers queue on the Approvals desk decides pending promos through the gate (approvals.offer.decide); each card shows priced elements as identity, expandable evidence with page citations, verbatim conditions, and the window rendered loudly',
      'A null expiry is unmistakable everywhere it appears — the approval card, the Promos board, the scenario promo chips, the lender pages, and the client PDF — never a bare dash (19 of 23 pending offers had none)',
      'Offers match a scenario permissively where eligibility could not be extracted (and say so), a winning offer sorts first, and a pinned offer carries its conditions and expiry onto the client PDF with compensation scrubbed from every field',
      'Pending offers feed the Home attention rail and the notification bell; lender_offers is the 18th granted read table',
    ],
  },
]

// The forward list once the original nine-session map is complete: the
// side-quests and follow-ups decided along the way. Kept honest and current.
const BACKLOG: { title: string; note: string }[] = [
  { title: 'Parser history backfill', note: 'Backfill the rate-quote parser over the full sheet history so superseded books read complete.' },
  { title: 'Five compliance workbench fields + penalty methodology', note: 'fox-underwriting to add suitability, exit-strategy, identity-verification, disclosure-delivered, and package-state fields, plus a penalty-methodology field on machine profiles (the compare tray lights up when it lands).' },
  { title: 'Fox Grade', note: 'A single practice-health grade rolling up pacing, pipeline, compliance posture, and partner health.' },
  { title: 'Dialpad-automatic Call Review', note: "Ask Fox's v2: transcripts flowing in through the existing n8n call pipeline, no paste." },
  { title: 'RLS-per-user before direct credentials', note: 'Per-user row-level security on the FOXCA stores before any partner gets a direct (non-service) key.' },
  { title: 'Pipeline agent scoping', note: 'Scope the ingest/intel CLI paths off agent 1 before a second agent’s deals flow (from the gates setup_remaining contract).' },
  { title: 'Identity-linkage columns', note: 'A holder id on compliance credentials and a Clerk id on the workbench agents row, so offboarding matches exactly instead of by name/email.' },
  { title: 'MFA second factor', note: 'A second-factor step on the custom sign-in form for when production turns MFA on.' },
  { title: 'Reinstate path', note: 'A decision + UI for un-disabling an offboarded person (today one-way; reinstate is a Clerk-dashboard action).' },
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

      <div className="mt-8 bg-lime/10 border border-lime/40 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lime font-bold text-lg">&#10003;</span>
          <h2 className="font-heading text-navy font-bold text-base">The original map is complete.</h2>
        </div>
        <p className="text-sm font-body text-gray-600">
          Nine sessions (plus the hotfix and the workbench micro-sessions) took the command center
          from an audit to an installable, multi-user, demo-ready operations platform. What follows
          is the living forward list — the side-quests and follow-ups decided along the way.
        </p>
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Forward backlog</h2>
        <ul className="space-y-3">
          {BACKLOG.map(b => (
            <li key={b.title} className="text-sm font-body">
              <span className="text-navy font-semibold">{b.title}</span>
              <span className="text-gray-500"> — {b.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
          Tracked as decided; this page updates each session. Section names in the sidebar are
          stable; a rename requires a CLAUDE.md note.
        </p>
      </div>
    </div>
  )
}
