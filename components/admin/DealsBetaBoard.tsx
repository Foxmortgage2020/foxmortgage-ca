// The Deals (Beta) four-phase board.
//
// A SERVER COMPONENT ON PURPOSE. Phase selection rides searchParams through
// plain links, so this page ships no client JavaScript at all. There is no
// handler, no fetch, no form and no drag target anywhere in the tree — the
// page's read-only promise is a property of its shape rather than a rule
// someone has to remember.
//
// The phase bar never changes: four cards, always in model order. Contact-level
// phases (Intake, Monitor) are DASHED and count people. Deal-level phases
// (Advise, Fund) are SOLID and count files with a dollar total. That difference
// is the whole reason the bar is safe to look at — it is what stops the four
// counts reading as one pipeline. The two units are never added together, and
// lib/four-phase.ts deliberately exposes no function that could.

import Link from 'next/link'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  PHASES,
  PHASE_ORDER,
  PHASE_PLACEHOLDER,
  blockedByChip,
  borrowersFor,
  columnTotals,
  columnsForPhase,
  daysInStage,
  dealsInStage,
  fmtAmount,
  fmtTotal,
  isActionableChip,
  phaseTotals,
  type DealClientLike,
  type DealLike,
  type PhaseKey,
  type StageEventLike,
  type StageLike,
} from '@/lib/four-phase'

interface Props {
  stages: StageLike[]
  deals: DealLike[]
  events: StageEventLike[]
  clients: DealClientLike[]
  consentRows: number | null
  phase: PhaseKey
  nowISO: string
}

export default function DealsBetaBoard({
  stages,
  deals,
  events,
  clients,
  consentRows,
  phase,
  nowISO,
}: Props) {
  return (
    <div className="mt-5">
      <PhaseBar stages={stages} deals={deals} active={phase} />
      <ReturnRail />
      <PhaseBody
        stages={stages}
        deals={deals}
        events={events}
        clients={clients}
        consentRows={consentRows}
        phase={phase}
        nowISO={nowISO}
      />
    </div>
  )
}

// ─── The persistent four-card bar ───────────────────────────────────────────

function PhaseBar({
  stages,
  deals,
  active,
}: {
  stages: StageLike[]
  deals: DealLike[]
  active: PhaseKey
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {PHASE_ORDER.map(key => {
        const meta = PHASES[key]
        const isActive = key === active
        const dealLevel = meta.unit === 'deal'
        const totals = dealLevel ? phaseTotals(stages, deals, key) : null
        return (
          <Link
            key={key}
            href={`/portal/admin/deals-beta?phase=${key}`}
            aria-current={isActive ? 'page' : undefined}
            className={`block rounded-[9px] bg-white p-4 motion-safe:transition-shadow hover:shadow-card ${
              // Dashed = contact-level (people). Solid = deal-level (files).
              dealLevel ? 'border' : 'border-2 border-dashed'
            } ${isActive ? 'border-navy ring-1 ring-navy' : 'border-cool-300'}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isActive ? 'bg-navy' : 'bg-cool-400'
                }`}
                aria-hidden="true"
              />
              <span className="font-heading text-[11px] font-bold uppercase tracking-[1.4px] text-navy">
                {meta.label}
              </span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-cool-500">
                {dealLevel ? 'files' : 'people'}
              </span>
            </div>

            {dealLevel && totals ? (
              <>
                <p className="mt-2 font-heading text-3xl leading-none text-navy tabular-nums">
                  {totals.count}
                </p>
                <p className="mt-2 border-t border-cool-100 pt-2 text-sm text-cool-700 tabular-nums">
                  {fmtTotal(totals.amount)}
                  {totals.partial && (
                    <span className="ml-1 text-xs text-cool-500">(some files carry no amount)</span>
                  )}
                </p>
              </>
            ) : (
              <>
                {/* Never invent a number. There is no source for a people count
                    on either contact-level phase yet, so the card says that
                    instead of printing a figure that would look measured. */}
                <p className="mt-2 font-heading text-base leading-tight text-cool-500">
                  not counted yet
                </p>
                <p className="mt-2 border-t border-cool-100 pt-2 text-xs text-cool-500">
                  {key === 'intake' ? 'Waiting on capture and consent' : 'Lives in Opportunities'}
                </p>
              </>
            )}
          </Link>
        )
      })}
    </div>
  )
}

// ─── The return rail ────────────────────────────────────────────────────────
// A renewing client re-enters at the strategy session, not at the top. Per the
// ratified JG-1 scope decision they take the 45 minute session with no
// application on file. Drawn rather than written down because this is how a new
// agent learns the loop without being told — and without it, a renewal
// eventually gets modelled as a fresh lead and someone runs a discovery call on
// a client of six years.

function ReturnRail() {
  return (
    <div className="relative mt-3 mb-5" aria-hidden="true">
      <div className="border-t-2 border-dashed border-cool-300" />
      <p className="absolute inset-x-0 -top-2 text-center">
        <span className="bg-fog px-3 font-heading text-[10px] font-bold uppercase tracking-[1.4px] text-cool-600">
          ← Renewals re-enter at Advise
        </span>
      </p>
    </div>
  )
}

// ─── The body: a board, or an honest placeholder ────────────────────────────

function PhaseBody({
  stages,
  deals,
  events,
  clients,
  consentRows,
  phase,
  nowISO,
}: {
  stages: StageLike[]
  deals: DealLike[]
  events: StageEventLike[]
  clients: DealClientLike[]
  consentRows: number | null
  phase: PhaseKey
  nowISO: string
}) {
  const meta = PHASES[phase]

  if (!meta.rendersBoard) {
    const key = phase as 'intake' | 'monitor'
    return (
      <section className="rounded-[9px] border border-cool-200 bg-white p-5">
        <h2 className="font-heading text-navy">{meta.label}</h2>
        <p className="mt-1 text-sm text-cool-600">{meta.blurb}</p>
        <p className="mt-4 max-w-3xl border-l-2 border-cool-300 pl-3 text-sm text-cool-700">
          {PHASE_PLACEHOLDER[key]}
        </p>
        {key === 'intake' && consentRows !== null && (
          <p className="mt-3 text-xs text-cool-500 tabular-nums">
            rec.consents currently holds {consentRows} rows.
          </p>
        )}
      </section>
    )
  }

  const columns = columnsForPhase(stages, phase)
  if (columns.length === 0) {
    return (
      <section className="rounded-[9px] border border-cool-200 bg-white p-5">
        <p className="text-sm text-cool-700">
          No stages are configured for {meta.label} yet, so this phase has no columns. Stages are
          configuration: adding one to rec.deal_stages adds a column here.
        </p>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <h2 className="font-heading text-navy">{meta.label}</h2>
        <p className="text-sm text-cool-600">{meta.blurb}</p>
      </div>

      {/* One row of columns, sized so the WHOLE phase fits one screen without
          sideways scrolling — a structural claim from the handoff, and the
          reason a board beats a list here. Fund's six columns are the binding
          case: at a 1440 viewport with the sidebar open there are 1080px of
          board, so the minimum is 168px (6 x 168 + 5 x 8 = 1048). Narrower
          viewports scroll rather than crushing a card past readability. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(168px, 1fr))` }}
        >
          {columns.map(col => {
            const inCol = dealsInStage(deals, col.code)
            const totals = columnTotals(inCol)
            return (
              <div key={col.code} className="rounded-[9px] border border-cool-200 bg-cool-50">
                <div className="border-b border-cool-200 p-3">
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-heading text-[11px] font-bold uppercase tracking-[1.2px] text-navy">
                      {col.label}
                    </h3>
                    <span className="ml-auto font-heading text-sm text-navy tabular-nums">
                      {totals.count}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-cool-700 tabular-nums">
                    {fmtTotal(totals.amount)}
                    {totals.partial && <span className="ml-1 text-cool-500">(partial)</span>}
                  </p>
                  {/* The description line. This is how a new agent learns the
                      process by reading the board, which is the one thing worth
                      copying outright from Broki. */}
                  {col.description && (
                    <p className="mt-1.5 text-[11px] leading-snug text-cool-600">{col.description}</p>
                  )}
                </div>

                <div className="space-y-2 p-2">
                  {inCol.length === 0 ? (
                    // Calm, not an error and not a warning. An empty column is
                    // a fact about the week, not a failure.
                    <p className="px-1 py-3 text-xs text-cool-500">No files in this stage.</p>
                  ) : (
                    inCol.map(d => (
                      <DealCard
                        key={d.id}
                        deal={d}
                        events={events}
                        clients={clients}
                        nowISO={nowISO}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── One card ───────────────────────────────────────────────────────────────

function DealCard({
  deal,
  events,
  clients,
  nowISO,
}: {
  deal: DealLike
  events: StageEventLike[]
  clients: DealClientLike[]
  nowISO: string
}) {
  const borrowers = borrowersFor(deal, clients)
  const days = daysInStage(deal, events, nowISO)
  const chip = blockedByChip(deal.blocked_by)
  const amount = fmtAmount(deal.mortgage_amount)
  const purpose = deal.deal_type
    ? deal.deal_type.charAt(0).toUpperCase() + deal.deal_type.slice(1)
    : null

  return (
    <article
      className="rounded-[7px] border border-cool-200 bg-white p-2.5"
      data-testid={`beta-deal-${deal.file_ref ?? deal.id}`}
    >
      <div className="flex items-start gap-2">
        <span className="font-heading text-[11px] tabular-nums text-cool-600">
          {deal.file_ref ?? 'no file ref'}
        </span>
        {purpose && (
          <span className="ml-auto shrink-0 rounded-full bg-cool-100 px-2 py-0.5 text-[10px] text-cool-700">
            {purpose}
          </span>
        )}
      </div>

      {borrowers.length > 0 ? (
        <div className="mt-1">
          {borrowers.map(b => (
            <p key={`${b.name}-${b.role}`} className="text-sm leading-tight text-navy">
              {b.name}
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cool-500">
                {b.role}
              </span>
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-cool-500">no borrower recorded</p>
      )}

      {amount && <p className="mt-1 text-sm text-cool-700 tabular-nums">{amount}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Only You earns the attention colour — it is the chip that answers
            what to do today. The other three are information and sit quiet.
            Nothing renders at all when blocked_by is null; the chip is never
            guessed. */}
        {chip && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isActionableChip(chip)
                ? 'bg-decision text-decision-ink'
                : 'bg-cool-100 text-cool-700'
            }`}
          >
            {BLOCKED_BY_LABELS[chip]}
          </span>
        )}
        {/* Days in stage, or words saying why there is no figure. Never a 0 and
            never a dash: a deal that has not moved since March must not read as
            0 days, and a dash reads as zero. */}
        {days.known ? (
          <span className="ml-auto text-[10px] tabular-nums text-cool-600" title={`Entered this stage on ${days.since}`}>
            {days.days}d in stage
          </span>
        ) : (
          <span className="ml-auto text-[10px] italic text-cool-500">
            {DAYS_UNKNOWN_COPY[days.reason]}
          </span>
        )}
      </div>
    </article>
  )
}
