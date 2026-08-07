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
// VOCABULARY (handoff 60). PHASES CONTAIN STAGES, on screen and in the code
// both. Michael closed the seam reading the live board: "sub-stage" is not a
// word this product uses any more. lib/board-layout.ts still owns the words, so
// a future rename is one edit rather than a sweep.
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
  columnTotals,
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
  PHASE_WORD,
  closingCountdown,
  phaseFigures,
  stageShowsCards,
  stageShowsSummary,
  stageWord,
} from '@/lib/board-layout'
import {
  MISSING_NOTE,
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
  /** The finished stage whose files have been unfolded, already validated
   *  against the record layer (handoff 61). Null means every terminal stage
   *  renders as a summary, which is the default. */
  shownStage: string | null
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

/** THE STAGE COLUMN WIDTH, fixed rather than fractional.
 *
 *  MEASURED, not estimated: at 1512 with the sidebar open the row's visible
 *  width is 1103px, so four of these plus their three 8px gaps come to 1096 and
 *  the fifth sits just off the edge. That is the "roughly four visible" Michael
 *  asked for. A first pass at 288 fitted only three, which is why this number
 *  is the one that was checked on screen rather than the one that looked right.
 *
 *  Fixed rather than fractional, because a fraction would re-narrow the card
 *  every time a phase with more stages opened, and the card's shape is exactly
 *  what handoff 59 existed to fix.
 *
 *  UNCHANGED BY THE BORDER handoff 60 put around the column: the box sizing is
 *  border-box, so the 1px each side comes out of the padding rather than out of
 *  the width, and the card inside is still 250px. */
const STAGE_COLUMN_WIDTH = 268

/** THE COMMAND CENTRE'S OWN STICKY TOPBAR, and the reason the phase tiles read
 *  as sliced (handoff 60).
 *
 *  `AdminShell` puts a 56px white header (`h-14`) at `sticky top-0 z-40`. The
 *  phase row was ALSO stuck at `top: 0`, at `z-20`, so the shell's bar simply
 *  painted over the top 56px of every tile the moment the page scrolled: the
 *  phase name and its colour swatch disappeared and the count and money were
 *  left looking cut off. Nothing was clipping anything, and no overflow was
 *  involved. Two sticky elements were given the same offset and the one with
 *  the higher z-index won.
 *
 *  So the row sticks BELOW the shell's chrome instead of underneath it. The
 *  coupling is real and deliberately written down here rather than tuned by
 *  eye, and tests/board-tokens.test.ts asserts AdminShell still renders that
 *  bar at h-14, so the day it changes height this fails loudly. */
const ADMIN_TOPBAR_HEIGHT = 56

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
    <div style={{ marginTop: '6px' }}>
      {/* THE FIVE, SIDE BY SIDE, AND STICKY (handoff 59).
          They wrap rather than scroll if the viewport cannot hold five, so this
          row never gains a sideways scrollbar: the horizontal scroll is the
          stage row's alone.

          STICKY, because the page is now deliberately long. With the column
          scroll box gone, Fulfilment runs to several thousand pixels, and
          someone forty files down Funded had no way to see where they were or
          switch phase without scrolling all the way back. Sticking the tile row
          keeps both one click away.

          IT STICKS BELOW THE SHELL'S OWN TOPBAR, not at zero (handoff 60). See
          ADMIN_TOPBAR_HEIGHT: sticking at zero put the tiles underneath the
          Command Centre's 56px header, which is what made them read as sliced.
          The 8px of padding above them is the breathing room that keeps the
          tile's top border and radius legible where the two meet.

          The opaque white ground and the hairline beneath are what stop cards
          bleeding through as they scroll past. The cost is about 165px of
          vertical space while scrolling, which is the trade for never losing
          your place. */}
      <div
        className="sticky z-20 grid gap-2"
        style={{
          top: `${ADMIN_TOPBAR_HEIGHT}px`,
          // 168 RATHER THAN 210 (handoff 60), and the reason is the STICKY
          // HEIGHT rather than the tile width. At 1280 the row is 897px wide,
          // so a 210px minimum fitted only four and the fifth wrapped onto a
          // second line. Once the blurbs stopped truncating, that two-line
          // stuck row reached HALF the viewport. Five across at 173px each
          // costs 45px of tile width and buys back about 110px of screen every
          // time you scroll. 1512 is unaffected: five already fitted there.
          gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
          background: SURFACE.canvas,
          paddingTop: '8px',
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
          Pick a {PHASE_WORD} above to see the {stageWord(2)} inside it and the files sitting in
          each one.
        </p>
      )}

      {/* Attract's sources are level-one information: it has no stages by
          design, so there is nothing to expand into. */}
      {open === null && <AttractSources phases={ordered} sources={sources} />}
    </div>
  )
}

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
      {/* THE MONEY, AND IN-FLIGHT IS NEVER ADDED TO BANKED (handoff 60).
          On the two phases that count dollars. A phase counting people carries
          no money line at all rather than a zero.

          A phase holding NO finished files reads exactly as it always did: one
          total and its weighted figure, no labels, because there is nothing to
          tell apart. Underwriting, Intake and Monitor are all in that case, so
          four of the five tiles are untouched by this.

          A phase holding finished files splits them out, because Fulfilment's
          single total was 74 files and $39.9M with a "weighted" figure of
          $38.8M, and sixty-six of those files were already funded. Weighting a
          certainty is how a forecast starts lying. */}
      {phase.counts_dollars &&
        (figures.fundedCount === 0 ? (
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
        ) : (
          <div className="mt-1.5 flex flex-col gap-1" data-testid={`beta-phasemoney-${phase.code}`}>
            {figures.inFlightCount > 0 && (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span style={{ ...typeStyle(TYPE.kpiLabel), color: TEXT.dim }}>In flight</span>
                <span style={{ ...typeStyle(TYPE.phaseValue), color: TEXT.navy }}>
                  {figures.inFlightCount} · {fmtTotal(figures.inFlightValue)}
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
            {/* Banked, so it is quiet monospace rather than the headline navy:
                it is context for the figure above, not a second forecast. */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span style={{ ...typeStyle(TYPE.kpiLabel), color: TEXT.dim }}>Funded</span>
              <span
                style={{ ...typeStyle(TYPE.phaseValue), color: TEXT.metaMono }}
                data-testid={`beta-phasefunded-${phase.code}`}
              >
                {figures.fundedCount} · {fmtTotal(figures.fundedValue)}
              </span>
            </div>
          </div>
        ))}
      {/* NO CLAMP (handoff 60). It truncated mid-word while the tile had unused
          height beneath it, because the grid stretches every tile to the tallest
          one anyway. Letting the line run costs nothing and reads. */}
      <p className="mt-1.5" style={{ ...typeStyle(TYPE.phaseBlurb), color: TEXT.dim }}>
        {phase.description ?? `${cols.length} ${stageWord(cols.length)}`}
      </p>
      {figures.missingAmounts > 0 && (
        // MISSING_NOTE, not MISSING_VALUE: this is a true sentence about the
        // phase, not a gap standing in for a figure, and the dotted underline
        // made it read as a link to somewhere it does not go.
        <p style={{ ...typeStyle(TYPE.stageTeach), ...MISSING_NOTE, marginTop: '4px' }}>
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
          {cols.length} {stageWord(cols.length)}
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
          No {stageWord(2)} are configured for {phase.label}. They are configuration: adding a row
          to rec.deal_stages adds a column here.
        </Panel>
      ) : (
        // ONE STRAIGHT HORIZONTAL LINE THAT SCROLLS SIDEWAYS (handoff 59), the
        // way every kanban Michael compared this against behaves. It used to
        // wrap onto a second row and he does not want them stacked.
        //
        // THIS DELIBERATELY REVERSES HANDOFF 57'S NO-HORIZONTAL-SCROLL RULE,
        // for this row and nothing else, and the reasoning is better than the
        // rule it replaces: the STAGE set is bounded at seven, so sideways
        // scrolling here is finite and predictable, while the FILE set is
        // unbounded, so files belong on the vertical axis. Wrapping is not
        // reintroduced to dodge the scroll.
        //
        // FOUR OF FULFILMENT'S FIVE COLUMNS FIT AT 1512 AND THE FIFTH IS OFF
        // THE RIGHT EDGE, which is this row working rather than a stage going
        // missing (handoff 60 checked: scrollLeft 0, five children, sort order
        // Submitted first). The count beside the phase name says five, and the
        // bordered columns below make the cut edge legible, which is what the
        // borderless version could not do.
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
  // The column's border eats 1px, so the fill inside it needs the smaller
  // radius or the grey cap's corners sit proud of the border's curve.
  const innerRadius = radius(RADIUS.card - STROKE.hairline)

  // A FINISHED STAGE SUMMARISES RATHER THAN LISTS (handoff 61). The rule lives
  // in lib/board-layout.ts and keys on the stage's own category, so nothing
  // here names a stage. Unfolding rides the URL like the phase does, which is
  // why the board is still a server component with no handler on this control.
  const expanded = props.shownStage === stage.code
  const showsCards = dealLevel && stageShowsCards({
    category: stage.category,
    fileCount: inColumn.length,
    expanded,
  })
  const showsSummary = dealLevel && stageShowsSummary({
    category: stage.category,
    fileCount: inColumn.length,
    expanded,
  })
  const totals = showsSummary ? columnTotals(inColumn) : null

  return (
    <div
      // FOUR COLUMNS VISIBLE AT 1512 is what this width buys, and the extra
      // width over the previous five-across is what gives the card its shape.
      // `shrink-0` keeps it at that width inside the scrolling row instead of
      // being squeezed to fit.
      //
      // A BORDERED UNIT WITH A GREY CAP AND A WHITE BODY (handoff 60). The
      // columns used to be white boxes on a white canvas separated by a hairline
      // nobody could see, so adjacent columns merged into one field of cards.
      // Now the border says where a column begins and ends, and the grey cap
      // says which stage it is. The cards keep sitting on white.
      //
      // NO `overflow: hidden` HERE, deliberately: the cap gets its own top radii
      // instead. This board has just spent a session on one thing being clipped
      // by something else, and a new clipping ancestor around every column is
      // not the way to round two corners.
      className="shrink-0"
      style={{
        width: `${STAGE_COLUMN_WIDTH}px`,
        background: SURFACE.panel,
        border: hair,
        borderRadius: radius(RADIUS.card),
      }}
      data-testid={`beta-col-${stage.code}`}
    >
      {/* THE PHASE-HUE RULE, full width across the top of the column, sitting on
          white so the depth ramp reads exactly as it was built: hue says which
          phase, depth says how far along. It sits ABOVE the grey band rather
          than inside it, because the tone is semi-transparent on the early
          stages and a grey behind it would mute the ramp it exists to show. */}
      <div
        aria-hidden="true"
        style={{
          height: `${STROKE.stageRule}px`,
          background: tone,
          borderTopLeftRadius: innerRadius,
          borderTopRightRadius: innerRadius,
        }}
      />
      <div
        style={{
          background: SURFACE.stageHeader,
          borderBottom: hair,
          padding: '8px 9px 9px',
        }}
        data-testid={`beta-col-head-${stage.code}`}
      >
        <div className="flex items-baseline gap-1.5">
          <div className="min-w-0" style={{ ...typeStyle(TYPE.stageName), color: TEXT.navy }}>
            {stage.label}
          </div>
          {gate && (
            <span className="ml-auto shrink-0" style={{ ...typeStyle(TYPE.gate), color: TEXT.metaMono }}>
              GATE
            </span>
          )}
        </div>
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
        {/* THE TEACHING LINE AT FULL STRENGTH EVEN AT ZERO. A stage holding
            nothing still explains what happens there, which is the whole reason
            someone new can read this board. */}
        {stage.description && (
          <p className="mt-1.5" style={{ ...typeStyle(TYPE.stageTeach), color: TEXT.dim }}>
            {stage.description}
          </p>
        )}
      </div>

      {showsSummary && totals && (
        /* THE SUMMARY OF A FINISHED STAGE (handoff 61). The name, the count and
           the teaching line are already in the grey cap above, exactly as every
           other column draws them, so what this adds is the money and the way
           in. The box, the border and the cap are untouched: a finished stage
           is the same object as a working one, holding a total instead of a
           stack of cards.

           THE FIGURE IS QUIET MONOSPACE, NOT HEADLINE NAVY, matching how the
           phase tile already prints its funded money one level up: this is
           banked, and banked money is context rather than a thing to chase. */
        <div style={{ padding: '9px' }} data-testid={`beta-col-summary-${stage.code}`}>
          <div className="flex items-baseline gap-1.5">
            <span style={{ ...typeStyle(TYPE.kpiLabel), color: TEXT.dim }}>Total</span>
            <span
              style={{ ...typeStyle(TYPE.phaseValue), color: TEXT.metaMono }}
              data-testid={`beta-col-total-${stage.code}`}
            >
              {fmtTotal(totals.amount)}
            </span>
          </div>
          {totals.partial && (
            /* MISSING_NOTE, not MISSING_VALUE: a true sentence about the column
               rather than a gap standing in for a figure, the handoff 60 rule. */
            <p style={{ ...typeStyle(TYPE.stageTeach), ...MISSING_NOTE, marginTop: '4px' }}>
              {inColumn.filter(d => typeof d.mortgage_amount !== 'number').length} with no amount
              recorded
            </p>
          )}
          {/* ONE PRESS EITHER WAY, and it says what it will do and to how many.
              A plain link rather than a button because the state is in the URL,
              so this is navigation and the back button works on it. */}
          <Link
            href={href({
              open: props.openPhase,
              show: expanded ? null : stage.code,
            })}
            className="mt-2 inline-block"
            style={{
              ...typeStyle(TYPE.pillLabel),
              color: TEXT.navy,
              border: hair,
              borderRadius: radius(RADIUS.chip),
              padding: '4px 9px',
            }}
            data-testid={`beta-col-disclose-${stage.code}`}
          >
            {expanded ? 'Hide' : 'Show'} the {inColumn.length} {phase.unit}
          </Link>
        </div>
      )}

      {showsCards && inColumn.length > 0 && (
        // NO SCROLL BOX (handoff 59, and still true after handoff 61). Every
        // file in the stage renders, all the way down. Michael's instruction:
        // if Submitted holds two hundred files he wants two hundred listed, and
        // he will scroll the page or use the search at the top to reach a name.
        //
        // A FINISHED STAGE REACHES THIS BLOCK ONLY ONCE UNFOLDED, and when it
        // does it renders every one of its files exactly as before. Handoff 61
        // hid the cards behind a press, it did not cap or slice them.
        <div
          className="flex flex-col gap-1.5"
          style={{ padding: '8px' }}
          data-testid={`beta-col-body-${stage.code}`}
        >
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
        {attract.label} has no {stageWord(2)} by design, because nobody moves through a source:
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
