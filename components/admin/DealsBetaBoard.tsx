// The Deals (Beta) phase board — rebuild for the five-phase record layer
// (2026-08-02b).
//
// A SERVER COMPONENT ON PURPOSE, and still one after gaining a collapse
// control: collapse rides searchParams through plain links, exactly as phase
// and view selection do. The page therefore ships no client JavaScript, has no
// handler, no form and no drag target, and its read-only promise stays a
// property of its shape rather than a rule someone has to remember.
//
// NOTHING ABOUT THE MODEL IS HARDCODED. Phases, stages, units, gates,
// probabilities, tag rules, milestone types, Attract's sources and the return
// paths are all rows read at runtime. `advise` and `fund` were renamed to
// `underwriting` and `fulfilment` in the record layer and no branch here
// noticed, which is the property this page exists to demonstrate.
//
// THREE THINGS THIS FILE REFUSES TO DO:
//   1. Render a null probability as 0, or let one into a weighted total.
//   2. Draw a projection like an actual — weighted figures take the projection
//      green, in ProjectionFigure.tsx, and always carry the word `weighted`.
//   3. Evaluate a tag whose field the deal row does not carry.
//
// THE ZONE RULE. Two greens carry two meanings here and are separated by
// module, not by discipline: the card (DealCard.tsx) may render the needs-you
// lime and never the projection green; the footer and strip render the
// projection green (ProjectionFigure.tsx) and never the lime. This orchestrator
// imports both and puts each in its own place, and tests assert both halves.

import Link from 'next/link'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  archiveRows,
  blockedByChip,
  borrowersFor,
  columnTotals,
  columnWeight,
  columnsForPhase,
  daysInStage,
  dealsInStage,
  fmtAmount,
  fmtCompact,
  fmtTotal,
  hasSteps,
  isActionableChip,
  isDealLevel,
  isGate,
  milestonesForDeal,
  orderedPhases,
  orderedReturns,
  parseCollapsed,
  phaseTotals,
  purposeLabel,
  returnTarget,
  tagsForDeal,
  terminalStages,
  toggleCollapsed,
  unevaluableTags,
  type AttractSourceLike,
  findDealByRef,
  type CardTagLike,
  type ConditionLike,
  type DealClientLike,
  type DealLike,
  type DealMilestoneLike,
  type Insights,
  type MilestoneTypeLike,
  type PhaseLike,
  type PhaseReturnLike,
  type StageEventLike,
  type StageLike,
} from '@/lib/phase-model'
import { columnSkin, phaseAccent, phaseTint, typeSkin } from '@/lib/phase-palette'
import DealCard from '@/components/admin/deals-beta/DealCard'
import DealPreview from '@/components/admin/deals-beta/DealPreview'
import ProjectionFigure, { ProjectionLabel } from '@/components/admin/deals-beta/ProjectionFigure'

interface Props {
  phases: PhaseLike[]
  stages: StageLike[]
  deals: DealLike[]
  boardDeals: DealLike[]
  events: StageEventLike[]
  clients: DealClientLike[]
  returns: PhaseReturnLike[]
  sources: AttractSourceLike[]
  tags: CardTagLike[]
  milestoneTypes: MilestoneTypeLike[]
  milestones: DealMilestoneLike[]
  conditions: ConditionLike[]
  insights: Insights
  activePhase: string | null
  archive: boolean
  collapsedRaw: string | null
  selectedRef: string | null
  nowISO: string
}

const BASE = '/portal/admin/deals-beta'

function href(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

export default function DealsBetaBoard(props: Props) {
  const { phases, stages, deals, archive, activePhase } = props
  const ordered = orderedPhases(phases)
  const active = ordered.find(p => p.code === activePhase) ?? null
  // Selection rides the URL, like phase, view and collapse. An unknown ref
  // selects nothing rather than erroring.
  const selected = archive ? null : findDealByRef(props.boardDeals, props.selectedRef)

  return (
    <div className="mt-5">
      <InsightsStrip insights={props.insights} />
      <PhaseBar
        phases={ordered}
        stages={stages}
        deals={props.boardDeals}
        activeCode={archive ? null : active?.code ?? null}
      />
      <ReturnRail returns={props.returns} phases={ordered} stages={stages} sources={props.sources} />
      <ViewSwitch stages={stages} deals={deals} archive={archive} activeCode={active?.code ?? null} />
      {archive ? (
        <ArchiveView stages={stages} deals={deals} clients={props.clients} />
      ) : active ? (
        // The preview sits BESIDE the board rather than over it, so the column
        // a file came from stays visible while it is being read.
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <PhaseBody phase={active} {...props} />
          </div>
          {selected && (
            <DealPreview
              deal={selected}
              stage={stages.find(st => st.code === selected.stage_code) ?? null}
              phase={
                ordered.find(
                  ph => ph.code === stages.find(st => st.code === selected.stage_code)?.phase,
                ) ?? null
              }
              events={props.events}
              clients={props.clients}
              conditions={props.conditions}
              milestoneTypes={props.milestoneTypes}
              milestones={props.milestones}
              nowISO={props.nowISO}
              closeHref={href({ phase: props.activePhase, collapsed: props.collapsedRaw })}
            />
          )}
        </div>
      ) : (
        <Panel>No phases are configured, so there is nothing to show. Phases live in rec.phases.</Panel>
      )}
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[9px] border border-cool-200 bg-white p-5 text-sm text-cool-700">
      {children}
    </p>
  )
}

// ─── The insights strip ─────────────────────────────────────────────────────

function InsightsStrip({ insights }: { insights: Insights }) {
  if (insights.tiles.length === 0) return null
  return (
    <div className="mb-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {insights.tiles.map(t => (
          <div
            key={t.key}
            className="rounded-[9px] border border-cool-200 bg-white p-3"
            data-testid={`beta-tile-${t.key}`}
          >
            <div className="flex items-baseline gap-2">
              <p className="flex-1 font-heading text-[10px] font-bold uppercase tracking-[1.2px] text-cool-600">
                {t.label}
              </p>
              {/* Colour never carries the meaning alone: the word rides with
                  the figure so a reader who does not know the convention can
                  still read the page. */}
              {t.isProjection && <ProjectionLabel>projected</ProjectionLabel>}
            </div>
            <p className="mt-1.5">
              {t.isProjection ? (
                <ProjectionFigure size="lg">{fmtTotal(t.value)}</ProjectionFigure>
              ) : (
                <span className="font-heading text-xl leading-tight text-navy tabular-nums">
                  {t.unit === 'days' ? `${Math.round(t.value)} days` : fmtTotal(t.value)}
                </span>
              )}
            </p>
            <p className="mt-1.5 text-[11px] text-cool-600 tabular-nums">
              {t.perDeal !== null && <>{fmtCompact(t.perDeal)} per file · </>}
              {t.counted} of {t.total} files
              {t.note && <> · {t.note}</>}
            </p>
          </div>
        ))}
      </div>
      {/* What is NOT here, and why. An omitted tile stated is worth more than
          a placeholder shown. */}
      {insights.omitted.length > 0 && (
        <p className="mt-2 text-[11px] text-cool-500">
          {insights.omitted.map(o => (
            <span key={o.label}>
              <span className="font-semibold">{o.label}</span> is not shown: {o.reason}.
            </span>
          ))}
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
        const stepCount = columnsForPhase(stages, p.code).length
        return (
          <Link
            key={p.code}
            href={href({ phase: p.code })}
            aria-current={isActive ? 'page' : undefined}
            className={`block overflow-hidden rounded-[9px] bg-white motion-safe:transition-shadow hover:shadow-card ${
              // Solid = counts files. Dashed = counts people or arrivals.
              dealLevel ? 'border border-cool-300' : 'border-2 border-dashed border-cool-300'
            } ${isActive ? 'ring-2 ring-navy' : ''}`}
          >
            <div className="h-1" style={{ background: phaseAccent(p.code) }} aria-hidden="true" />
            <div className="p-3" style={{ background: isActive ? phaseTint(p.code) : undefined }}>
              <div className="flex items-baseline gap-2">
                <span className="font-heading text-[11px] font-bold uppercase tracking-[1.3px] text-navy">
                  {p.label}
                </span>
                {/* The unit is the phase's own word, from rec.phases. */}
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
                // Never invent a number: nothing is placed in the contact-level
                // phases and no arrivals are recorded, so the card says the
                // shape of the phase instead of a figure that would look
                // measured.
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
        href={href({ phase: activeCode })}
        className={`rounded-[7px] border px-3 py-1.5 text-xs font-heading ${
          archive ? 'border-cool-300 bg-white text-cool-700' : 'border-navy bg-navy text-white'
        }`}
      >
        Board
      </Link>
      <Link
        href={href({ view: 'archive' })}
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

function PhaseBody(props: Props & { phase: PhaseLike }) {
  const { phase, stages, boardDeals: deals, sources, tags, collapsedRaw } = props
  const columns = columnsForPhase(stages, phase.code)
  const dealLevel = isDealLevel(phase)
  const collapsed = parseCollapsed(collapsedRaw)
  const unevaluable = dealLevel ? unevaluableTags(tags, deals) : []

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-heading text-navy">{phase.label}</h2>
        {phase.description && (
          <p className="mt-0.5 max-w-4xl text-sm text-cool-600">{phase.description}</p>
        )}
      </div>

      {!hasSteps(phase) ? (
        <SourceList phase={phase} sources={sources} />
      ) : columns.length === 0 ? (
        <Panel>
          No stages are configured for {phase.label}. Stages are configuration: adding one to
          rec.deal_stages adds a column here.
        </Panel>
      ) : (
        <>
          {/* Said once, plainly, rather than as a fake zero on every column. */}
          {!dealLevel && (
            <p className="mb-3 rounded-[9px] border border-cool-200 bg-white px-4 py-2.5 text-sm text-cool-700">
              These are the steps of {phase.label}. Nobody is placed in them yet — this phase counts{' '}
              {phase.unit}, and there is no contact-level stage data in the record layer so far.
            </p>
          )}
          {/* A tag rule that cannot be evaluated is named rather than silently
              dropped, because "no tag" and "cannot tell" are different facts. */}
          {unevaluable.map(u => (
            <p
              key={u.tag.code}
              className="mb-3 rounded-[9px] border border-cool-200 bg-white px-4 py-2.5 text-sm text-cool-700"
            >
              The <span className="font-semibold">{u.tag.label}</span> tag is not shown: its rule
              reads <span className="font-mono text-[12px]">{u.tag.rule_field}</span>, which no deal
              row carries. Marking every file with it would invent a signal out of a field nobody
              records.
            </p>
          ))}
          {/* The one-screen constraint is withdrawn. Cards get a readable width
              and the board scrolls; collapsing a column is the real answer to a
              phase that does not fit, and it beats shrinking every card. */}
          <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
            <div className="flex items-start gap-3">
              {columns.map((col, i) => (
                <StageColumn
                  key={col.code}
                  {...props}
                  stage={col}
                  index={i}
                  total={columns.length}
                  inColumn={dealLevel ? dealsInStage(deals, col.code) : []}
                  showCounts={dealLevel}
                  collapsed={collapsed.has(col.code)}
                  collapsedRaw={collapsedRaw}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function StageColumn(
  props: Props & {
    phase: PhaseLike
    stage: StageLike
    index: number
    total: number
    inColumn: DealLike[]
    showCounts: boolean
    collapsed: boolean
  },
) {
  const { phase, stage, index, total, inColumn, showCounts, collapsed, collapsedRaw, activePhase } =
    props
  const skin = columnSkin(phase.code, index, total)
  const totals = columnTotals(inColumn)
  const gate = isGate(stage)
  const weight = showCounts ? columnWeight(stage, inColumn) : null

  const toggleHref = href({
    phase: activePhase,
    collapsed: toggleCollapsed(parseCollapsed(collapsedRaw), stage.code) || null,
  })

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-[9px] ${collapsed ? 'w-[132px]' : 'w-[280px]'}`}
      style={{ background: skin.surface, border: `1px solid ${skin.border}` }}
      data-testid={`beta-col-${stage.code}`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      {/* Hue says which phase, depth says how far along. A gate is dashed
          rather than solid: a decision point is not somewhere a file rests. */}
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
        <div className="flex items-baseline gap-1.5">
          <h3 className="font-heading text-sm font-bold uppercase leading-tight tracking-[0.06em] text-navy">
            {stage.label}
          </h3>
          {gate && !collapsed && (
            <span className="shrink-0 rounded-sm border border-navy/25 px-1 text-[9px] uppercase tracking-wide text-navy/70">
              gate
            </span>
          )}
          {showCounts && (
            <span className="ml-auto shrink-0 font-heading text-xs text-cool-700 tabular-nums">
              {totals.count}
            </span>
          )}
          <Link
            href={toggleHref}
            aria-label={collapsed ? `Expand ${stage.label}` : `Collapse ${stage.label}`}
            title={collapsed ? 'Expand' : 'Collapse'}
            className={`shrink-0 rounded-sm px-1 text-[11px] leading-none text-cool-600 hover:bg-white/60 hover:text-navy ${
              showCounts ? '' : 'ml-auto'
            }`}
            data-testid={`beta-collapse-${stage.code}`}
          >
            {collapsed ? '»' : '«'}
          </Link>
        </div>
        {/* A collapsed column still carries its name, count and total. */}
        {showCounts && (
          <p className="mt-1 font-heading text-base font-semibold leading-none text-navy tabular-nums">
            {fmtTotal(totals.amount)}
            {totals.partial && (
              <span className="ml-1 font-body text-[10px] font-normal text-cool-600">partial</span>
            )}
          </p>
        )}
        {stage.description && !collapsed && (
          <p className="mt-1.5 text-[11px] leading-snug text-cool-700">{stage.description}</p>
        )}
      </div>

      {/* The footer: the stage's probability and what it makes of the column.
          Only where a probability exists — a null carries no footer at all
          rather than a zeroed one. */}
      {weight && (
        <div
          className="border-t px-3 py-1.5"
          style={{ borderColor: skin.border, background: skin.surface }}
        >
          <ProjectionLabel>{weight.probability}% weighted</ProjectionLabel>
          <p className="mt-0.5">
            <ProjectionFigure testId={`beta-weighted-${stage.code}`}>
              {fmtTotal(weight.weighted)}
            </ProjectionFigure>
          </p>
        </div>
      )}

      {showCounts && !collapsed && (
        <div className="space-y-2 p-2">
          {inColumn.length === 0 ? (
            // Calm. An empty column is a fact about the week, not a failure.
            <p className="px-1 py-3 text-xs text-cool-500">No files in this stage.</p>
          ) : (
            inColumn.map(d => (
              <DealCard
                key={d.id}
                deal={d}
                events={props.events}
                clients={props.clients}
                tags={props.tags}
                milestoneTypes={props.milestoneTypes}
                milestones={props.milestones}
                nowISO={props.nowISO}
                selected={(d.file_ref ?? d.id) === props.selectedRef}
                // Clicking a card selects it in the URL; clicking the selected
                // one again clears it. Soft navigation, no page load, no state.
                href={href({
                  phase: props.activePhase,
                  collapsed: props.collapsedRaw,
                  deal: (d.file_ref ?? d.id) === props.selectedRef ? null : d.file_ref ?? d.id,
                })}
              />
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
    return <Panel>No sources are configured. Sources live in rec.attract_sources.</Panel>
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
                {/* The outcome leads the row: it decides whether this person is
                    worth contacting again. */}
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
