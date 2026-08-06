// The Deals (Beta) board, rebuilt from the design export (handoff 58).
//
// THE STRUCTURE IS THREE LEVELS, and it is the one thing the export does NOT
// contain. The export holds three earlier approaches; Michael settled on this
// after seeing them:
//
//   LEVEL ONE, always visible.  The KPI figures, then the five phases as a
//                               single horizontal row, each showing its file
//                               count, expected volume and weighted volume.
//   LEVEL TWO.                  Click a phase and it expands underneath,
//                               revealing that phase's stages as columns.
//   LEVEL THREE.                File cards inside those stage columns.
//
// ONLY ONE PHASE'S STAGES RENDER AT A TIME. That is what makes the geometry
// work: the widest thing on screen is seven columns rather than twenty-five,
// which is why handoff 57's vertical stack had to go.
//
// VOCABULARY. Michael thinks in STAGES containing SUB-STAGES; the database says
// phases containing stages. The interface uses his words, the code keeps the
// database's, and lib/board-layout.ts is the one seam where they meet. Nothing
// here renames a column or a variable.
//
// EVERY VISUAL VALUE COMES FROM lib/design-tokens.ts, which read them out of
// the export. Nothing here is a hex literal, enforced by
// tests/board-tokens.test.ts walking the directory.
//
// EXPANSION RIDES THE URL (`?open=`), so this is STILL A SERVER COMPONENT: no
// handler, no client state, no drag target. The only client code on the board
// is the Remove control, which is a leaf.
//
// THE ZONE RULE SURVIVES. Projection green renders in footers and strips
// through ProjectionFigure.tsx; lime renders on cards through DealCard.tsx.
// This orchestrator imports both and carries no lime of its own.

import Link from 'next/link'
import {
  archiveRows,
  borrowersFor,
  columnsForPhase,
  dealsInStage,
  fmtAmount,
  fmtTotal,
  hasSteps,
  isDealLevel,
  isGate,
  orderedPhases,
  purposeLabel,
  terminalStages,
  unplacedDeals,
  type AttractSourceLike,
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
import {
  closingCountdown,
  phaseFigures,
  stageWord,
  subStageWord,
} from '@/lib/board-layout'
import {
  MISSING_VALUE,
  RADIUS,
  ROLE,
  STROKE,
  SURFACE,
  TEXT,
  TYPE,
  navyAlpha,
  phaseHue,
  radius,
  stageTone,
  typeStyle,
} from '@/lib/design-tokens'
import {
  feedPosture,
  indexWithdrawals,
  withdrawalFor,
  type WithdrawalLike,
} from '@/lib/rec-withdrawal'
import DealCard from '@/components/admin/deals-beta/DealCard'
import {
  RemoveRecordControl,
  ReverseWithdrawalControl,
} from '@/components/admin/deals-beta/RecordWithdrawal'
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
  archive: boolean
  withdrawnView: boolean
  nostageView: boolean
  withdrawals: WithdrawalLike[]
  withdrawnDeals: DealLike[]
  roomDealIds: string[]
  canWithdraw: boolean
  addressByDeal: Record<string, string>
  /** The phase to expand, already validated against the record layer. */
  openPhase: string | null
  selectedRef: string | null
  nowISO: string
  todayYMD: string
}

const BASE = '/portal/admin/deals-beta'

function href(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

const hair = `${STROKE.hairline}px solid ${SURFACE.border}`

/** THE SUB-STAGE COLUMN WIDTH, fixed rather than fractional.
 *
 *  MEASURED, not estimated: at 1512 with the sidebar open the row's visible
 *  width is 1103px, so four of these plus their three 8px gaps come to 1096 and
 *  the fifth sits just off the edge. That is the "roughly four visible" Michael
 *  asked for. A first pass at 288 fitted only three, which is why this number
 *  is the one that was checked on screen rather than the one that looked right.
 *
 *  Fixed rather than fractional, because a fraction would re-narrow the card
 *  every time a phase with more sub-stages opened, and the card's shape is
 *  exactly what this change exists to fix. */
const STAGE_COLUMN_WIDTH = 268

export default function DealsBetaBoard(props: Props) {
  const { archive, withdrawnView, nostageView } = props
  const otherView = archive || withdrawnView || nostageView

  return (
    <div>
      <SummaryStrip {...props} />
      <ViewSwitch
        stages={props.stages}
        deals={props.deals}
        archive={archive}
        withdrawnView={withdrawnView}
        nostageView={nostageView}
        withdrawnCount={props.withdrawnDeals.length}
        openPhase={props.openPhase}
      />
      {nostageView ? (
        <NoStageView {...props} />
      ) : withdrawnView ? (
        <WithdrawnView {...props} />
      ) : archive ? (
        <ArchiveView {...props} />
      ) : (
        <PhaseRow {...props} />
      )}
      {!otherView && <BesideTheBoard {...props} />}
    </div>
  )
}

// ─── Level one: the summary strip ───────────────────────────────────────────

function SummaryStrip(props: Props) {
  const { stages, boardDeals: deals, todayYMD } = props
  const stageByCode = new Map(stages.map(s => [s.code, s]))
  const inFlight = deals.filter(d => {
    const s = d.stage_code ? stageByCode.get(d.stage_code) : null
    return s ? s.category !== 'terminal_won' && s.category !== 'terminal_lost' : true
  })
  const funded = deals.length - inFlight.length
  const needsWork = deals.filter(d => {
    const s = d.stage_code ? stageByCode.get(d.stage_code) : null
    return closingCountdown({
      closingDate: typeof d.closing_date === 'string' ? d.closing_date : null,
      todayYMD,
      stageCategory: s?.category ?? null,
    }).urgent
  }).length

  const openValue = inFlight.reduce((a, d) => a + (d.mortgage_amount ?? 0), 0)
  const openWeighted = inFlight.reduce((a, d) => {
    const s = d.stage_code ? stageByCode.get(d.stage_code) : null
    const p = typeof s?.probability === 'number' ? s.probability : null
    return p === null ? a : a + ((d.mortgage_amount ?? 0) * p) / 100
  }, 0)

  const Figure = ({ n, label, first }: { n: number; label: string; first?: boolean }) => (
    <div
      className="flex items-baseline gap-[7px]"
      style={{
        padding: first ? '0 20px 0 0' : '0 20px',
        ...(first ? {} : { borderLeft: hair }),
      }}
    >
      <span style={{ ...typeStyle(TYPE.kpiFigure), color: TEXT.navy }}>{n}</span>
      <span style={{ ...typeStyle(TYPE.kpiLabel), color: TEXT.dim }}>{label}</span>
    </div>
  )

  return (
    <div
      className="flex flex-wrap items-center gap-y-2"
      style={{ borderTop: hair, borderBottom: hair, padding: '11px 0', margin: '0 0 4px' }}
      data-testid="beta-summary"
    >
      <Figure n={inFlight.length} label="in flight" first />
      <Figure n={funded} label="funded, now in Monitor" />
      <Figure n={needsWork} label="closing dates past or inside 14 days" />
      <div className="ml-auto flex items-baseline gap-[18px]" style={{ paddingLeft: '20px' }}>
        <span style={{ ...typeStyle(TYPE.kpiValueLabel), color: TEXT.dim }}>
          Open value{' '}
          <b style={{ ...typeStyle(TYPE.kpiValue), color: TEXT.navy }}>{fmtTotal(openValue)}</b>
        </span>
        <span className="flex items-baseline gap-1.5">
          <ProjectionLabel>Weighted</ProjectionLabel>
          <ProjectionFigure testId="beta-open-weighted">{fmtTotal(openWeighted)}</ProjectionFigure>
        </span>
      </div>
    </div>
  )
}

// ─── The view switch ────────────────────────────────────────────────────────

function ViewSwitch({
  stages,
  deals,
  archive,
  withdrawnView,
  nostageView,
  withdrawnCount,
  openPhase,
}: {
  stages: StageLike[]
  deals: DealLike[]
  archive: boolean
  withdrawnView: boolean
  nostageView: boolean
  withdrawnCount: number
  openPhase: string | null
}) {
  const count = archiveRows(stages, deals).length
  const nostageCount = unplacedDeals(stages, deals).length
  const boardOn = !archive && !withdrawnView && !nostageView
  const chip = (on: boolean) => ({
    ...typeStyle(on ? TYPE.chipOn : TYPE.chipOff),
    color: on ? SURFACE.panel : TEXT.dim,
    background: on ? TEXT.navy : 'transparent',
    border: on ? `${STROKE.hairline}px solid ${TEXT.navy}` : hair,
    borderRadius: radius(RADIUS.chip),
    padding: '6px 11px',
  })
  return (
    <div className="flex flex-wrap gap-1.5" style={{ padding: '12px 0 2px' }}>
      {/* Board keeps whichever phase was open, so switching away and back does
          not silently close what someone was reading. */}
      <Link href={href({ open: openPhase })} style={chip(boardOn)}>
        Board
      </Link>
      <Link href={href({ view: 'archive' })} style={chip(archive)}>
        Archive {count}
      </Link>
      <Link href={href({ view: 'nostage' })} style={chip(nostageView)} data-testid="beta-view-nostage">
        No stage {nostageCount}
      </Link>
      {/* The count renders at zero too: a book that shrinks can only be read
          against what left it if the number is always on the same screen. */}
      <Link href={href({ view: 'withdrawn' })} style={chip(withdrawnView)} data-testid="beta-view-withdrawn">
        Withdrawn {withdrawnCount}
      </Link>
    </div>
  )
}

// ─── Level one: the five phases as one row ──────────────────────────────────

function PhaseRow(props: Props) {
  const { phases, stages, boardDeals: deals, sources, openPhase } = props
  const ordered = orderedPhases(phases)
  if (ordered.length === 0) {
    return <Panel>No phases are configured, so there is nothing to show. Phases live in rec.phases.</Panel>
  }
  const open = ordered.find(p => p.code === openPhase) ?? null

  return (
    <div style={{ marginTop: '14px' }}>
      {/* THE FIVE, SIDE BY SIDE, AND STICKY (handoff 59).
          They wrap rather than scroll if the viewport cannot hold five, so this
          row never gains a sideways scrollbar: the horizontal scroll is the
          SUB-STAGE row's alone.

          STICKY, because the page is now deliberately long. With the column
          scroll box gone, Fulfilment runs to several thousand pixels, and
          someone forty files down Funded had no way to see where they were or
          switch phase without scrolling all the way back. Sticking the tile row
          keeps both one click away.

          It sticks at top:0 with an opaque white ground and a hairline beneath,
          which the white canvas made easy: cards scrolling underneath cannot
          bleed through. The cost is about 120px of vertical space while
          scrolling, which is the trade for never losing your place. */}
      <div
        className="sticky top-0 z-20 grid gap-2"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          background: SURFACE.canvas,
          paddingBottom: '10px',
          borderBottom: hair,
        }}
        data-testid="beta-phases"
      >
        {ordered.map(p => (
          <PhaseTile
            key={p.code}
            phase={p}
            stages={stages}
            deals={deals}
            open={p.code === openPhase}
          />
        ))}
      </div>

      {/* LEVEL TWO, underneath, and only ever one of them. */}
      {open ? (
        <ExpandedPhase {...props} phase={open} />
      ) : (
        <p
          style={{ ...typeStyle(TYPE.phaseBlurb), color: TEXT.dim, margin: '14px 0 0' }}
          data-testid="beta-nothing-open"
        >
          Pick a {PHASE_LABEL} above to see the {subStageWord(2)} inside it and the files sitting in
          each one.
        </p>
      )}

      {/* Attract's sources are level-one information: it has no stages by
          design, so there is nothing to expand into. */}
      {open === null && <AttractSources phases={ordered} sources={sources} />}
    </div>
  )
}

const PHASE_LABEL = 'stage'

function PhaseTile({
  phase,
  stages,
  deals,
  open,
}: {
  phase: PhaseLike
  stages: StageLike[]
  deals: DealLike[]
  open: boolean
}) {
  const cols = columnsForPhase(stages, phase.code)
  const dealLevel = isDealLevel(phase)
  const figures = phaseFigures(cols, code => (dealLevel ? dealsInStage(deals, code) : []))
  const hue = phaseHue(phase.code)
  const clickable = cols.length > 0

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="shrink-0"
          style={{ width: '7px', height: '7px', borderRadius: radius(RADIUS.swatch), background: hue }}
        />
        <span style={{ ...typeStyle(TYPE.phaseName), color: TEXT.navy }}>{phase.label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          style={{
            ...typeStyle(TYPE.stageCount),
            color: figures.count > 0 ? TEXT.navy : TEXT.ghost,
          }}
        >
          {figures.count}
        </span>
        <span style={{ ...typeStyle(TYPE.kpiLabel), color: TEXT.dim }}>{phase.unit}</span>
      </div>
      {/* Expected and weighted volume, on the two phases that count dollars.
          A phase counting people carries neither rather than a zero. */}
      {phase.counts_dollars && (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span style={{ ...typeStyle(TYPE.phaseValue), color: TEXT.navy }}>
            {fmtTotal(figures.value)}
          </span>
          {figures.weighted !== null && (
            <span className="flex items-baseline gap-1">
              <ProjectionLabel>wtd</ProjectionLabel>
              <ProjectionFigure testId={`beta-phaseweight-${phase.code}`}>
                {fmtTotal(figures.weighted)}
              </ProjectionFigure>
            </span>
          )}
        </div>
      )}
      <p
        className="mt-1.5 line-clamp-2"
        style={{ ...typeStyle(TYPE.phaseBlurb), color: TEXT.dim }}
      >
        {phase.description ?? `${cols.length} ${subStageWord(cols.length)}`}
      </p>
      {figures.missingAmounts > 0 && (
        <p style={{ ...typeStyle(TYPE.stageTeach), ...MISSING_VALUE, marginTop: '4px' }}>
          {figures.missingAmounts} with no amount recorded
        </p>
      )}
    </>
  )

  const style = {
    background: SURFACE.panel,
    border: open ? `${STROKE.hairline}px solid ${TEXT.navy}` : hair,
    borderTop: `3px solid ${open ? hue : 'transparent'}`,
    borderRadius: radius(RADIUS.card),
    padding: '9px 11px 11px',
  }

  if (!clickable) {
    return (
      <div style={style} data-testid={`beta-phase-${phase.code}`} data-open="false">
        {inner}
      </div>
    )
  }
  return (
    <Link
      href={href({ open: open ? null : phase.code })}
      aria-expanded={open}
      style={style}
      className="block"
      data-testid={`beta-phase-${phase.code}`}
      data-open={open ? 'true' : 'false'}
    >
      {inner}
    </Link>
  )
}

// ─── Level two: one phase expanded, its stages as columns ───────────────────

function ExpandedPhase(props: Props & { phase: PhaseLike }) {
  const { phase, stages, boardDeals: deals } = props
  const cols = columnsForPhase(stages, phase.code)
  const dealLevel = isDealLevel(phase)
  const hue = phaseHue(phase.code)

  return (
    <section
      style={{
        marginTop: '10px',
        background: SURFACE.panel,
        border: hair,
        borderTop: `3px solid ${hue}`,
        borderRadius: radius(RADIUS.card),
        padding: '12px 12px 14px',
      }}
      data-testid={`beta-expanded-${phase.code}`}
    >
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span style={{ ...typeStyle(TYPE.sectionTitle), color: TEXT.navy }}>{phase.label}</span>
        <span style={{ ...typeStyle(TYPE.sectionNote), color: TEXT.dim }}>
          {cols.length} {subStageWord(cols.length)}
        </span>
        <Link
          href={href({})}
          className="ml-auto"
          style={{
            ...typeStyle(TYPE.pillLabel),
            color: TEXT.dim,
            border: hair,
            borderRadius: radius(RADIUS.chip),
            padding: '4px 9px',
          }}
        >
          Close
        </Link>
      </div>

      {cols.length === 0 ? (
        <Panel>
          No {subStageWord(2)} are configured for {phase.label}. They are configuration: adding a row
          to rec.deal_stages adds a column here.
        </Panel>
      ) : (
        // ONE STRAIGHT HORIZONTAL LINE THAT SCROLLS SIDEWAYS (handoff 59), the
        // way every kanban Michael compared this against behaves. It used to
        // wrap onto a second row and he does not want them stacked.
        //
        // THIS DELIBERATELY REVERSES HANDOFF 57'S NO-HORIZONTAL-SCROLL RULE,
        // for this row and nothing else, and the reasoning is better than the
        // rule it replaces: the SUB-STAGE set is bounded at seven, so sideways
        // scrolling here is finite and predictable, while the FILE set is
        // unbounded, so files belong on the vertical axis. Wrapping is not
        // reintroduced to dodge the scroll.
        //
        // The column is a FIXED width rather than a fraction, because a
        // fraction would re-narrow the card every time a phase with more
        // sub-stages opened, and the card's shape is the point.
        <div
          className="flex items-start gap-2 overflow-x-auto pb-2"
          data-testid={`beta-stage-row-${phase.code}`}
        >
          {cols.map((col, i) => (
            <StageColumn
              key={col.code}
              {...props}
              stage={col}
              index={i}
              total={cols.length}
              inColumn={dealLevel ? dealsInStage(deals, col.code) : []}
              dealLevel={dealLevel}
            />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Level three: a stage column and its cards ──────────────────────────────

function StageColumn(
  props: Props & {
    phase: PhaseLike
    stage: StageLike
    index: number
    total: number
    inColumn: DealLike[]
    dealLevel: boolean
  },
) {
  const { phase, stage, index, total, inColumn, dealLevel } = props
  const gate = isGate(stage)
  const tone = stageTone(phase.code, index, total)

  return (
    <div
      // FOUR COLUMNS VISIBLE AT 1512 is what this width buys, and the extra
      // width over the previous five-across is what gives the card its shape.
      // `shrink-0` keeps it at that width inside the scrolling row instead of
      // being squeezed to fit.
      className="shrink-0"
      style={{
        width: `${STAGE_COLUMN_WIDTH}px`,
        // White, like the export's own stage column, which is `background:#fff`
        // with a border rather than a tint. The border and the cards' own
        // borders carry the figure-ground now that the canvas is white too.
        background: SURFACE.panel,
        border: hair,
        borderRadius: radius(RADIUS.card),
        padding: '9px 8px 8px',
      }}
      data-testid={`beta-col-${stage.code}`}
    >
      <div className="flex items-center gap-1.5" style={{ height: '9px', margin: '0 0 7px' }}>
        <span
          aria-hidden="true"
          className="shrink-0"
          style={{ width: '16px', height: '3px', borderRadius: radius(RADIUS.swatch), background: tone }}
        />
        {gate && <span style={{ ...typeStyle(TYPE.gate), color: TEXT.metaMono }}>GATE</span>}
      </div>
      <div style={{ ...typeStyle(TYPE.stageName), color: TEXT.navy }}>{stage.label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          style={{
            ...typeStyle(TYPE.stageCount),
            color: inColumn.length > 0 ? TEXT.navy : TEXT.ghost,
          }}
        >
          {dealLevel ? inColumn.length : 0}
        </span>
        <span style={{ ...typeStyle(TYPE.kpiLabel), color: TEXT.dim }}>{phase.unit}</span>
      </div>
      {/* THE TEACHING LINE AT FULL STRENGTH EVEN AT ZERO. A sub-stage holding
          nothing still explains what happens there, which is the whole reason
          someone new can read this board. */}
      {stage.description && (
        <p className="mt-1.5" style={{ ...typeStyle(TYPE.stageTeach), color: TEXT.dim }}>
          {stage.description}
        </p>
      )}

      {inColumn.length > 0 && (
        // NO SCROLL BOX (handoff 59). Every file in the sub-stage renders, all
        // the way down. Michael's instruction: if Submitted holds two hundred
        // files he wants two hundred listed, and he will scroll the page or
        // use the search at the top to reach a name. The tall page is now a
        // chosen outcome rather than a defect, and it is not what made the old
        // board twenty-four thousand pixels long: that was five phases stacked
        // at once, not one phase's files.
        <div className="mt-2 flex flex-col gap-1.5" data-testid={`beta-col-body-${stage.code}`}>
          {inColumn.map(d => (
            <DealCard
              key={d.id}
              deal={d}
              events={props.events}
              clients={props.clients}
              nowISO={props.nowISO}
              todayYMD={props.todayYMD}
              stageCategory={stage.category ?? null}
              stageName={stage.label}
              address={props.addressByDeal[d.id] ?? null}
              selected={(d.file_ref ?? d.id) === props.selectedRef}
              href={`/portal/admin/deals-beta/${encodeURIComponent(d.id)}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Attract: sources, not stages ───────────────────────────────────────────

function AttractSources({
  phases,
  sources,
}: {
  phases: PhaseLike[]
  sources: AttractSourceLike[]
}) {
  const attract = phases.find(p => !hasSteps(p))
  if (!attract || sources.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span style={{ ...typeStyle(TYPE.sectionNote), color: TEXT.dim }}>
        {attract.label} has no {subStageWord(2)} by design, because nobody moves through a source:
      </span>
      {sources.map(s => (
        <span
          key={s.code}
          style={{
            ...typeStyle(TYPE.pillLabel),
            color: TEXT.dim,
            border: hair,
            borderRadius: radius(RADIUS.pill),
            padding: '5px 10px',
          }}
          data-testid={`beta-source-${s.code}`}
        >
          {s.label} <b style={{ ...typeStyle(TYPE.cardInStage), color: TEXT.faintMono }}>0</b>
        </span>
      ))}
    </div>
  )
}

// ─── Beside the board ───────────────────────────────────────────────────────

function BesideTheBoard(props: Props) {
  const { stages, deals, insights } = props
  const projected = insights.tiles.find(t => t.isProjection)
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
      style={{ borderTop: hair, marginTop: '13px', padding: '11px 0' }}
    >
      <span style={{ ...typeStyle(TYPE.footNote), color: TEXT.dim }}>
        Beside the board: Archive {archiveRows(stages, deals).length} · No stage{' '}
        {unplacedDeals(stages, deals).length} · Withdrawn {props.withdrawnDeals.length}
      </span>
      {projected && (
        <span className="ml-auto flex items-baseline gap-1.5">
          <ProjectionLabel>Projected to fund</ProjectionLabel>
          <ProjectionFigure testId="beta-projected">{fmtTotal(projected.value)}</ProjectionFigure>
        </span>
      )}
    </div>
  )
}

// ─── Shared pieces for the list views ───────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        ...typeStyle(TYPE.pageSubtitle),
        color: TEXT.dim,
        background: SURFACE.panel,
        border: hair,
        borderRadius: radius(RADIUS.card),
        padding: '16px',
      }}
    >
      {children}
    </p>
  )
}

function ViewHeading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: '14px 0 10px' }}>
      <h2 style={{ ...typeStyle(TYPE.sectionTitle), color: TEXT.navy }}>{title}</h2>
      <p
        className="mt-1 max-w-4xl"
        style={{ ...typeStyle(TYPE.phaseBlurb), color: TEXT.dim }}
      >
        {children}
      </p>
    </div>
  )
}

function ListRow({
  deal,
  clients,
  lead,
  refLink,
  testId,
  children,
}: {
  deal: DealLike
  clients: DealClientLike[]
  lead?: React.ReactNode
  /** Passed IN by each view rather than built here, so the reachability
   *  assertions in tests/rec-withdrawal.test.ts still find it in the view. */
  refLink: React.ReactNode
  testId: string
  children?: React.ReactNode
}) {
  const borrowers = borrowersFor(deal, clients)
  const amount = fmtAmount(deal.mortgage_amount)
  const type = purposeLabel(deal.deal_type)
  return (
    <div style={{ borderTop: hair, padding: '10px 12px' }} data-testid={testId}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {lead}
        {refLink}
        <span style={{ ...typeStyle(TYPE.phaseBlurb), color: TEXT.navy }}>
          {borrowers.length > 0 ? borrowers.map(b => b.name).join(', ') : <span style={MISSING_VALUE}>No borrower recorded</span>}
        </span>
        {type && (
          <span
            style={{
              ...typeStyle(TYPE.cardMeta),
              color: TEXT.metaMono,
              border: hair,
              borderRadius: radius(RADIUS.small),
              padding: '2px 6px',
            }}
          >
            {type}
          </span>
        )}
        <span
          className="ml-auto"
          style={{ ...typeStyle(TYPE.cardAmount), ...(amount ? { color: TEXT.navy } : MISSING_VALUE) }}
        >
          {amount ?? 'No amount'}
        </span>
      </div>
      {children}
    </div>
  )
}

function refLinkFor(deal: DealLike) {
  return (
    <Link
      href={`/portal/admin/deals-beta/${encodeURIComponent(deal.id)}`}
      style={{ ...typeStyle(TYPE.cardMeta), color: TEXT.navy }}
      className="underline underline-offset-2"
    >
      {deal.file_ref ?? 'No file reference'}
    </Link>
  )
}

// ─── The No stage view ──────────────────────────────────────────────────────

/** RECORDS THE BOARD CANNOT PLACE, AS A VIEW RATHER THAN A FOOTNOTE. Every one
 *  is a historical import with a NULL stage_code. NO STAGE IS INVENTED to make
 *  them visible: writing one would fabricate a fact about a file. */
function NoStageView(props: Props) {
  const { stages, deals, clients, roomDealIds, canWithdraw } = props
  const rows = unplacedDeals(stages, deals)
  const rooms = new Set(roomDealIds)
  return (
    <section>
      <ViewHeading title="No stage">
        Records the migration loaded without any stage, so the board and the Archive cannot place
        them. Nothing here has been given one to make it visible, because that would invent a fact
        about the file. Removing works from here, and a record the loader later stages will move to
        the board on its own.
      </ViewHeading>
      {rows.length === 0 ? (
        <Panel>
          Every record carries a stage the board knows, so there is nothing here. This view stays,
          because the day the loader delivers a record without one, this is where it will be.
        </Panel>
      ) : (
        <div style={{ background: SURFACE.panel, border: hair, borderRadius: radius(RADIUS.card) }}>
          {rows.map(({ deal, reason }) => {
            const sourceId = typeof deal.source_id === 'string' ? deal.source_id : null
            const posture = feedPosture({
              finmoApplicationId:
                typeof deal.finmo_application_id === 'string' ? deal.finmo_application_id : null,
              hasRoom: rooms.has(deal.id),
            })
            return (
              <ListRow
                key={deal.id}
                deal={deal}
                clients={clients}
                testId={`beta-nostage-${deal.file_ref ?? deal.id}`}
                refLink={
                  <Link
                    href={`/portal/admin/deals-beta/${encodeURIComponent(deal.id)}`}
                    style={{ ...typeStyle(TYPE.cardMeta), color: TEXT.navy }}
                    className="underline underline-offset-2"
                  >
                    {deal.file_ref ?? 'No file reference'}
                  </Link>
                }
                lead={
                  <span className="min-w-[12rem]" style={{ ...typeStyle(TYPE.phaseBlurb), ...MISSING_VALUE }}>
                    {reason === 'no_stage'
                      ? 'No stage recorded'
                      : `Stage code the board does not know: ${deal.stage_code}`}
                  </span>
                }
              >
                {canWithdraw && sourceId && (
                  <RemoveRecordControl
                    sourceId={sourceId}
                    fileRef={deal.file_ref}
                    posture={posture}
                    variant="card"
                  />
                )}
              </ListRow>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── The Withdrawn view ─────────────────────────────────────────────────────

function WithdrawnView(props: Props) {
  const { withdrawnDeals: deals, withdrawals, clients, canWithdraw } = props
  const index = indexWithdrawals(withdrawals)
  return (
    <section>
      <ViewHeading title="Withdrawn">
        Records a person decided the loader should stop recreating. Nothing here was deleted. Each
        row is still in the record layer, still readable, and carries the decision and the reason it
        was made. Putting one back releases the loader to recreate it on its next run.
      </ViewHeading>
      {deals.length === 0 ? (
        <Panel>
          No records have been withdrawn. When one is, it leaves the columns and the totals and
          appears here with the reason it was removed.
        </Panel>
      ) : (
        <div style={{ background: SURFACE.panel, border: hair, borderRadius: radius(RADIUS.card) }}>
          {deals.map(deal => {
            const w = withdrawalFor(
              {
                source_system: typeof deal.source_system === 'string' ? deal.source_system : null,
                source_id: typeof deal.source_id === 'string' ? deal.source_id : null,
              },
              index,
            )
            return (
              <ListRow
                key={deal.id}
                deal={deal}
                clients={clients}
                testId={`beta-withdrawn-${deal.file_ref ?? deal.id}`}
                refLink={
                  <Link
                    href={`/portal/admin/deals-beta/${encodeURIComponent(deal.id)}`}
                    style={{ ...typeStyle(TYPE.cardMeta), color: TEXT.navy }}
                    className="underline underline-offset-2"
                  >
                    {deal.file_ref ?? 'No file reference'}
                  </Link>
                }
              >
                {/* The identity is the one the workbench recorded off the
                    verified session at decision time. Nothing here supplies it. */}
                <p className="mt-1" style={{ ...typeStyle(TYPE.stageTeach), color: TEXT.dim }}>
                  {w?.instructed_by ? `Removed by ${w.instructed_by}` : 'Removed'}
                  {w?.instructed_on ? ` on ${w.instructed_on}` : ''}
                </p>
                {w?.reason && (
                  <p className="mt-0.5 max-w-prose" style={{ ...typeStyle(TYPE.phaseBlurb), color: TEXT.body }}>
                    <span style={{ color: TEXT.dim }}>Reason given: </span>
                    {w.reason}
                  </p>
                )}
                {canWithdraw && w && (
                  <div className="mt-2">
                    <ReverseWithdrawalControl withdrawal={w} fileRef={deal.file_ref} />
                  </div>
                )}
              </ListRow>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── The Archive ────────────────────────────────────────────────────────────

function ArchiveView(props: Props) {
  const { stages, deals, clients, roomDealIds, canWithdraw } = props
  const rows = archiveRows(stages, deals)
  const outcomes = terminalStages(stages)
  const rooms = new Set(roomDealIds)
  return (
    <section>
      <ViewHeading title="Archive">
        Files that ended. The outcome is the point: a file lost to another agent is a remarketing
        lead and a cancelled one is not, so the two never collapse into one word.
      </ViewHeading>
      {rows.length === 0 ? (
        <div
          style={{
            background: SURFACE.panel,
            border: hair,
            borderRadius: radius(RADIUS.card),
            padding: '16px',
          }}
        >
          <p style={{ ...typeStyle(TYPE.pageSubtitle), color: TEXT.dim }}>
            No files have ended yet. These are the outcomes a file can end in, all empty today:
          </p>
          <ul className="mt-3 space-y-2">
            {outcomes.map(s => (
              <li key={s.code} className="pl-3" style={{ borderLeft: `2px solid ${navyAlpha(0.18)}` }}>
                <p style={{ ...typeStyle(TYPE.stageName), color: TEXT.navy }}>{s.label}</p>
                {s.description && (
                  <p style={{ ...typeStyle(TYPE.stageTeach), color: TEXT.dim }}>{s.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ background: SURFACE.panel, border: hair, borderRadius: radius(RADIUS.card) }}>
          {rows.map(({ deal, stage }) => {
            const sourceId = typeof deal.source_id === 'string' ? deal.source_id : null
            const posture = feedPosture({
              finmoApplicationId:
                typeof deal.finmo_application_id === 'string' ? deal.finmo_application_id : null,
              hasRoom: rooms.has(deal.id),
            })
            return (
              <ListRow
                key={deal.id}
                deal={deal}
                clients={clients}
                testId={`beta-archive-${deal.file_ref ?? deal.id}`}
                refLink={
                  <Link
                    href={`/portal/admin/deals-beta/${encodeURIComponent(deal.id)}`}
                    style={{ ...typeStyle(TYPE.cardMeta), color: TEXT.navy }}
                    className="underline underline-offset-2"
                  >
                    {deal.file_ref ?? 'No file reference'}
                  </Link>
                }
                lead={
                  // The outcome leads the row: it decides whether this person is
                  // worth contacting again.
                  <span className="min-w-[12rem]" style={{ ...typeStyle(TYPE.stageName), color: TEXT.navy }}>
                    {stage.label}
                  </span>
                }
              >
                {canWithdraw && sourceId && (
                  <RemoveRecordControl
                    sourceId={sourceId}
                    fileRef={deal.file_ref}
                    posture={posture}
                    variant="card"
                  />
                )}
              </ListRow>
            )
          })}
        </div>
      )}
    </section>
  )
}
