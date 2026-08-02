// The Deals (Beta) phase board — five phases (2026-08-02).
//
// A SERVER COMPONENT ON PURPOSE. Phase and view selection ride searchParams
// through plain links, so this page ships no client JavaScript at all. There
// is no handler, no fetch, no form and no drag target anywhere in the tree —
// the read-only promise is a property of its shape rather than a rule someone
// has to remember.
//
// NOTHING ABOUT THE MODEL IS HARDCODED. The phase bar renders whatever
// rec.phases holds, in its order; each phase's unit, whether it carries money,
// and whether it has steps at all come from that row. Columns come from
// rec.deal_stages, gates from is_gate, the return rail from rec.phase_returns,
// and Attract's sources from rec.attract_sources. Adding a phase or a stage in
// the record layer changes this page with no code change.
//
// EVERY SUB-STAGE RENDERS, occupied or not. An empty column is information;
// a missing column is a lie about the process.
//
// THREE UNITS, NEVER ADDED. Attract counts arrivals, Intake and Monitor count
// people, Advise and Fund count files with a dollar total. lib/phase-model.ts
// phaseTotals returns null rather than zero for anything that is not
// deal-level, so a caller cannot render "0 files" for a phase that does not
// count files.

import Link from 'next/link'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  archiveRows,
  blockedByChip,
  borrowersFor,
  columnTotals,
  columnsForPhase,
  daysInStage,
  dealsInStage,
  fmtAmount,
  fmtTotal,
  hasSteps,
  isActionableChip,
  isDealLevel,
  isGate,
  orderedPhases,
  orderedReturns,
  phaseTotals,
  purposeLabel,
  returnTarget,
  terminalStages,
  type AttractSourceLike,
  type DealClientLike,
  type DealLike,
  type PhaseLike,
  type PhaseReturnLike,
  type StageEventLike,
  type StageLike,
} from '@/lib/phase-model'
import { columnSkin, phaseAccent, phaseTint, typeSkin } from '@/lib/phase-palette'

interface Props {
  phases: PhaseLike[]
  stages: StageLike[]
  deals: DealLike[]
  events: StageEventLike[]
  clients: DealClientLike[]
  returns: PhaseReturnLike[]
  sources: AttractSourceLike[]
  activePhase: string | null
  archive: boolean
  nowISO: string
}

const BASE = '/portal/admin/deals-beta'

export default function DealsBetaBoard({
  phases,
  stages,
  deals,
  events,
  clients,
  returns,
  sources,
  activePhase,
  archive,
  nowISO,
}: Props) {
  const ordered = orderedPhases(phases)
  const active = ordered.find(p => p.code === activePhase) ?? null

  return (
    <div className="mt-5">
      <PhaseBar phases={ordered} stages={stages} deals={deals} activeCode={archive ? null : active?.code ?? null} />
      <ReturnRail returns={returns} phases={ordered} stages={stages} sources={sources} />
      <ViewSwitch stages={stages} deals={deals} archive={archive} activeCode={active?.code ?? null} />
      {archive ? (
        <ArchiveView stages={stages} deals={deals} clients={clients} />
      ) : active ? (
        <PhaseBody
          phase={active}
          stages={stages}
          deals={deals}
          events={events}
          clients={clients}
          sources={sources}
          nowISO={nowISO}
        />
      ) : (
        <p className="rounded-[9px] border border-cool-200 bg-white p-5 text-sm text-cool-700">
          No phases are configured, so there is nothing to show. Phases live in rec.phases.
        </p>
      )}
    </div>
  )
}

// ─── The phase bar ──────────────────────────────────────────────────────────

function PhaseBar({
  phases,
  stages,
  deals,
  activeCode,
}: {
  phases: PhaseLike[]
  stages: StageLike[]
  deals: DealLike[]
  activeCode: string | null
}) {
  return (
    <div
      className="grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}
    >
      {phases.map(p => {
        const isActive = p.code === activeCode
        const dealLevel = isDealLevel(p)
        const totals = phaseTotals(p, stages, deals)
        const accent = phaseAccent(p.code)
        const stepCount = columnsForPhase(stages, p.code).length
        return (
          <Link
            key={p.code}
            href={`${BASE}?phase=${p.code}`}
            aria-current={isActive ? 'page' : undefined}
            className={`group block overflow-hidden rounded-[9px] bg-white motion-safe:transition-shadow hover:shadow-card ${
              // Solid = counts files. Dashed = counts people or arrivals. The
              // difference is what stops the counts reading as one pipeline.
              dealLevel ? 'border border-cool-300' : 'border-2 border-dashed border-cool-300'
            } ${isActive ? 'ring-2 ring-navy' : ''}`}
          >
            <div className="h-1" style={{ background: accent }} aria-hidden="true" />
            <div className="p-3" style={{ background: isActive ? phaseTint(p.code) : undefined }}>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-[11px] font-bold uppercase tracking-[1.3px] text-navy">
                  {p.label}
                </span>
                {/* The unit is the phase's own word, read from rec.phases. */}
                <span className="ml-auto text-[10px] uppercase tracking-wide text-cool-500">
                  {p.unit}
                </span>
              </div>

              {dealLevel && totals ? (
                <>
                  <p className="mt-1.5 font-heading text-2xl leading-none text-navy tabular-nums">
                    {totals.count}
                  </p>
                  {p.counts_dollars && (
                    <p className="mt-1.5 font-heading text-sm font-semibold text-navy tabular-nums">
                      {fmtTotal(totals.amount)}
                      {totals.partial && (
                        <span className="ml-1 font-body text-[10px] font-normal text-cool-500">
                          partial
                        </span>
                      )}
                    </p>
                  )}
                </>
              ) : (
                // Never invent a number. Nothing is placed in the contact-level
                // phases yet and no arrivals are recorded, so the card says the
                // shape of the phase instead of a figure that would look measured.
                <>
                  <p className="mt-1.5 font-heading text-sm leading-tight text-cool-500">
                    not counted yet
                  </p>
                  <p className="mt-1.5 text-[11px] text-cool-500 tabular-nums">
                    {hasSteps(p)
                      ? `${stepCount} step${stepCount === 1 ? '' : 's'}`
                      : 'sources, not steps'}
                  </p>
                </>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─── The return rail ────────────────────────────────────────────────────────
// Both returns out of Monitor's Decided gate are rows in rec.phase_returns —
// one back into Advise at the strategy session (a renewal needs the advice, not
// another application form), one feeding Attract as a source (the book brings
// its own work). Drawing only the first understates the loop, which is what
// the previous build did.

function ReturnRail({
  returns,
  phases,
  stages,
  sources,
}: {
  returns: PhaseReturnLike[]
  phases: PhaseLike[]
  stages: StageLike[]
  sources: AttractSourceLike[]
}) {
  const rows = orderedReturns(returns)
    .map(r => ({ r, target: returnTarget(r, phases, stages, sources) }))
    .filter(x => x.target !== null)

  if (rows.length === 0) return <div className="mt-4" />

  return (
    <div className="mt-3 mb-5">
      <div className="border-t-2 border-dashed border-cool-300" />
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {rows.map(({ r, target }) => {
          const fromStage = stages.find(s => s.code === r.from_stage_code)
          return (
            <p key={r.code} className="text-[11px] text-cool-600">
              <span className="font-heading font-semibold uppercase tracking-[1px] text-cool-700">
                ↩ {fromStage ? fromStage.label : r.from_phase} → {target}
              </span>
              <span className="ml-2">{r.label}</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}

// ─── Board / Archive switch ─────────────────────────────────────────────────
// The Archive is a VIEW, not a sixth phase — terminal files belong to no phase
// and putting them in the bar would say they are part of the flow.

function ViewSwitch({
  stages,
  deals,
  archive,
  activeCode,
}: {
  stages: StageLike[]
  deals: DealLike[]
  archive: boolean
  activeCode: string | null
}) {
  const count = archiveRows(stages, deals).length
  return (
    <div className="mb-4 flex items-center gap-2">
      <Link
        href={activeCode ? `${BASE}?phase=${activeCode}` : BASE}
        className={`rounded-[7px] border px-3 py-1.5 text-xs font-heading ${
          archive ? 'border-cool-300 bg-white text-cool-700' : 'border-navy bg-navy text-white'
        }`}
      >
        Board
      </Link>
      <Link
        href={`${BASE}?view=archive`}
        className={`rounded-[7px] border px-3 py-1.5 text-xs font-heading ${
          archive ? 'border-navy bg-navy text-white' : 'border-cool-300 bg-white text-cool-700'
        }`}
      >
        Archive <span className="tabular-nums">{count}</span>
      </Link>
    </div>
  )
}

// ─── The body ───────────────────────────────────────────────────────────────

function PhaseBody({
  phase,
  stages,
  deals,
  events,
  clients,
  sources,
  nowISO,
}: {
  phase: PhaseLike
  stages: StageLike[]
  deals: DealLike[]
  events: StageEventLike[]
  clients: DealClientLike[]
  sources: AttractSourceLike[]
  nowISO: string
}) {
  const columns = columnsForPhase(stages, phase.code)
  const dealLevel = isDealLevel(phase)

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-heading text-navy">{phase.label}</h2>
        {phase.description && (
          <p className="mt-0.5 max-w-4xl text-sm text-cool-600">{phase.description}</p>
        )}
      </div>

      {/* Attract has no steps at all — rec.phases says so structurally with
          is_ordered false and level 'source'. It gets sources, not a board. */}
      {!hasSteps(phase) ? (
        <SourceList phase={phase} sources={sources} />
      ) : columns.length === 0 ? (
        <p className="rounded-[9px] border border-cool-200 bg-white p-5 text-sm text-cool-700">
          No stages are configured for {phase.label}. Stages are configuration: adding one to
          rec.deal_stages adds a column here.
        </p>
      ) : (
        <>
          {/* Said once, plainly, rather than as a fake zero on every column. */}
          {!dealLevel && (
            <p className="mb-3 rounded-[9px] border border-cool-200 bg-white px-4 py-2.5 text-sm text-cool-700">
              These are the steps of {phase.label}. Nobody is placed in them yet — this phase counts{' '}
              {phase.unit}, and there is no contact-level stage data in the record layer so far.
            </p>
          )}
          {/* The one-screen constraint is withdrawn: cards get room and the
              board scrolls sideways. Six columns at a readable width beats
              eleven crammed. */}
          <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(264px, 1fr))` }}
            >
              {columns.map((col, i) => (
                <StageColumn
                  key={col.code}
                  phase={phase}
                  stage={col}
                  index={i}
                  total={columns.length}
                  deals={dealLevel ? dealsInStage(deals, col.code) : []}
                  showCounts={dealLevel}
                  events={events}
                  clients={clients}
                  nowISO={nowISO}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function StageColumn({
  phase,
  stage,
  index,
  total,
  deals,
  showCounts,
  events,
  clients,
  nowISO,
}: {
  phase: PhaseLike
  stage: StageLike
  index: number
  total: number
  deals: DealLike[]
  showCounts: boolean
  events: StageEventLike[]
  clients: DealClientLike[]
  nowISO: string
}) {
  const skin = columnSkin(phase.code, index, total)
  const totals = columnTotals(deals)
  const gate = isGate(stage)

  return (
    <div
      className="overflow-hidden rounded-[9px]"
      style={{ background: skin.surface, border: `1px solid ${skin.border}` }}
      data-testid={`beta-col-${stage.code}`}
    >
      {/* The accent deepens across the phase: hue says which phase, depth says
          how far along. A gate is dashed rather than solid — a decision point
          is not somewhere a file rests. */}
      <div
        className="h-[3px]"
        style={
          gate
            ? {
                backgroundImage: `repeating-linear-gradient(90deg, ${skin.accent} 0 6px, transparent 6px 11px)`,
              }
            : { background: skin.accent }
        }
        aria-hidden="true"
      />
      <div className="px-3 py-2.5" style={{ background: skin.header }}>
        {/* Hierarchy, deliberately ordered: the stage NAME is the loudest thing
            in the header, and the dollar total is second. The first build had
            that inverted — an 11px label under an 18px figure — so the eye
            landed on money before it knew which stage it was looking at. */}
        <div className="flex items-baseline gap-2">
          <h3 className="font-heading text-sm font-bold uppercase leading-tight tracking-[0.06em] text-navy">
            {stage.label}
          </h3>
          {gate && (
            <span className="shrink-0 rounded-sm border border-navy/25 px-1 text-[9px] uppercase tracking-wide text-navy/70">
              gate
            </span>
          )}
          {showCounts && (
            <span className="ml-auto shrink-0 font-heading text-xs text-cool-700 tabular-nums">
              {totals.count}
            </span>
          )}
        </div>
        {showCounts && (
          <p className="mt-1 font-heading text-base font-semibold leading-none text-navy tabular-nums">
            {fmtTotal(totals.amount)}
            {totals.partial && (
              <span className="ml-1 font-body text-[10px] font-normal text-cool-600">partial</span>
            )}
          </p>
        )}
        {/* The description line — how a new agent learns the process by reading
            the board. It carries to every phase, including the ones with no data. */}
        {stage.description && (
          <p className="mt-1.5 text-[11px] leading-snug text-cool-700">{stage.description}</p>
        )}
      </div>

      {/* Contact-level phases get no body at all rather than an empty tray.
          Nothing is placed in these steps yet, and an empty padded box below
          each description reads as "something should be here" — which is a
          different claim from "these are the steps", and the wrong one. The
          absence is stated once, above the row. */}
      {showCounts && (
        <div className="space-y-2 p-2">
          {deals.length === 0 ? (
            // Calm. An empty column is a fact about the week, not a failure:
            // plain grey, no icon, no amber, nothing that reads as broken.
            <p className="px-1 py-3 text-xs text-cool-500">No files in this stage.</p>
          ) : (
            deals.map(d => (
              <DealCard key={d.id} deal={d} events={events} clients={clients} nowISO={nowISO} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Attract: sources, not steps ────────────────────────────────────────────

function SourceList({ phase, sources }: { phase: PhaseLike; sources: AttractSourceLike[] }) {
  if (sources.length === 0) {
    return (
      <p className="rounded-[9px] border border-cool-200 bg-white p-5 text-sm text-cool-700">
        No sources are configured. Sources live in rec.attract_sources.
      </p>
    )
  }
  return (
    <>
      <p className="mb-3 rounded-[9px] border border-cool-200 bg-white px-4 py-2.5 text-sm text-cool-700">
        {phase.label} counts {phase.unit}, and nobody moves through a source, so these are places
        people come from rather than steps. No arrivals are recorded yet.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {sources.map((s, i) => {
          const skin = columnSkin(phase.code, i, sources.length)
          return (
            <div
              key={s.code}
              className="overflow-hidden rounded-[9px]"
              style={{ background: skin.surface, border: `1px solid ${skin.border}` }}
              data-testid={`beta-source-${s.code}`}
            >
              <div className="h-[3px]" style={{ background: skin.accent }} aria-hidden="true" />
              <div className="px-3 py-2.5" style={{ background: skin.header }}>
                <div className="flex items-baseline gap-2">
                  <h3 className="font-heading text-[11px] font-bold uppercase tracking-[1.1px] text-navy">
                    {s.label}
                  </h3>
                  {s.channel_group && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-cool-500">
                      {s.channel_group}
                    </span>
                  )}
                </div>
                {s.description && (
                  <p className="mt-1.5 text-[11px] leading-snug text-cool-700">{s.description}</p>
                )}
              </div>
              <p className="px-3 py-3 text-xs text-cool-500">No arrivals recorded yet.</p>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── The Archive ────────────────────────────────────────────────────────────

function ArchiveView({
  stages,
  deals,
  clients,
}: {
  stages: StageLike[]
  deals: DealLike[]
  clients: DealClientLike[]
}) {
  const rows = archiveRows(stages, deals)
  const outcomes = terminalStages(stages)

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-heading text-navy">Archive</h2>
        <p className="mt-0.5 max-w-4xl text-sm text-cool-600">
          Files that ended. The outcome is the point: a file lost to another broker is a remarketing
          lead and a cancelled one is not, so the two never collapse into "closed".
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[9px] border border-cool-200 bg-white p-5">
          <p className="text-sm text-cool-700">
            No files have ended yet. These are the outcomes a file can end in, all of them empty
            today:
          </p>
          <ul className="mt-3 space-y-2">
            {outcomes.map(s => (
              <li key={s.code} className="border-l-2 border-cool-300 pl-3">
                <p className="font-heading text-sm text-navy">{s.label}</p>
                {s.description && <p className="text-xs text-cool-600">{s.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[9px] border border-cool-200 bg-white">
          {rows.map(({ deal, stage }) => {
            const borrowers = borrowersFor(deal, clients)
            const amount = fmtAmount(deal.mortgage_amount)
            const type = purposeLabel(deal.deal_type)
            const t = typeSkin(deal.deal_type)
            return (
              <div
                key={deal.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-cool-100 px-4 py-3 last:border-b-0"
                data-testid={`beta-archive-${deal.file_ref ?? deal.id}`}
              >
                {/* The outcome leads the row, because it is the thing that
                    decides whether this person is worth contacting again. */}
                <span className="min-w-[13rem] font-heading text-sm font-semibold text-navy">
                  {stage.label}
                </span>
                <span className="font-heading text-[11px] tabular-nums text-cool-600">
                  {deal.file_ref ?? 'no file ref'}
                </span>
                {borrowers.length > 0 && (
                  <span className="text-sm text-navy">{borrowers.map(b => b.name).join(', ')}</span>
                )}
                {type && t && (
                  <span
                    className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ color: t.fg, borderColor: t.border, background: t.bg }}
                  >
                    {type}
                  </span>
                )}
                {amount && (
                  <span className="ml-auto font-heading text-sm text-navy tabular-nums">
                    {amount}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
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
  const type = purposeLabel(deal.deal_type)
  const t = typeSkin(deal.deal_type)

  return (
    <article
      className="rounded-[7px] border border-cool-200 bg-white p-3 shadow-[0_1px_2px_rgba(10,27,46,.05)]"
      data-testid={`beta-deal-${deal.file_ref ?? deal.id}`}
    >
      <div className="flex items-start gap-2">
        <span className="font-heading text-[11px] tabular-nums text-cool-600">
          {deal.file_ref ?? 'no file ref'}
        </span>
        {/* Deal type is a real distinction and gets meaning-carrying colour.
            OUTLINED, because phases own filled tints — a different channel, so
            the two palettes cannot be confused for one another. */}
        {type && t && (
          <span
            className="ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: t.fg, borderColor: t.border, background: t.bg }}
          >
            {type}
          </span>
        )}
      </div>

      {borrowers.length > 0 ? (
        <div className="mt-1.5">
          {borrowers.map(b => (
            <p key={`${b.name}-${b.role}`} className="text-sm leading-snug text-navy">
              {b.name}
              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cool-500">
                {b.role}
              </span>
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-sm text-cool-500">no borrower recorded</p>
      )}

      {amount && (
        <p className="mt-1.5 font-heading text-base font-semibold text-navy tabular-nums">
          {amount}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Lime has exactly one meaning on this page: this needs you. Only the
            You chip carries it; Client, Lender and Lawyer are information and
            stay quiet, which is the only reason You means anything. Nothing
            renders at all when blocked_by is null — the chip is never guessed. */}
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
        {/* Days in stage, or words saying why there is none. Never a 0 and
            never a dash: a deal that has not moved since March must not read as
            0 days, and a dash reads as zero. */}
        {days.known ? (
          <span
            className="ml-auto text-[10px] tabular-nums text-cool-600"
            title={`Entered this stage on ${days.since}`}
          >
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
