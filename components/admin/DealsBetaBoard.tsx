// The Deals (Beta) phase board — restructured and rebuilt on the design tokens
// (handoff 57).
//
// WHY IT RESTRUCTURED RATHER THAN RESTYLED. Michael called the board
// complicated and hard to read, and named the blue-grey canvas. The canvas was
// real but it was not the whole problem: twenty-eight stages laid side by side
// overflowed 1512 by 588px and still needed collapse controls, and no amount of
// paint fixes a row that long. So:
//
//   PHASES STACK VERTICALLY. Each phase's stages sit side by side under its own
//   header, in a grid that WRAPS rather than scrolls, so the board can never
//   overflow sideways at any width.
//
//   EMPTY STAGES FOLD to one line at the foot of their phase, and EMPTY PHASES
//   fold to their header line alone. On today's book that leaves Underwriting
//   and Fulfilment open with three stages each, and Attract, Intake and Monitor
//   as three quiet lines.
//
// THE OLD `?collapsed=` MECHANISM IS GONE. It existed to make a too-wide row
// survivable, and the row is gone, so a control that hid a column to make room
// now only hides work. `parseCollapsed` and `toggleCollapsed` stay exported and
// tested in lib/phase-model.ts, unused, the same way DealPreview was left.
//
// `?phase=` IS GONE WITH IT, and so is the phase bar it drove. Every phase is
// on the screen now, so a selector that showed one at a time is a step between
// Michael and the board.
//
// EVERY COLOUR AND EVERY TYPE SIZE COMES FROM lib/design-tokens.ts. Nothing
// here is a hex literal, enforced by tests/board-tokens.test.ts, which walks the
// directory so a file nobody has written yet is covered.
//
// NOTHING ABOUT THE MODEL IS HARDCODED. Phases, stages, units, gates,
// probabilities, tag rules, milestone types, Attract's sources and the return
// paths are all rows read at runtime.
//
// THE ZONE RULE SURVIVES UNCHANGED. Projection green renders in footers and the
// strip through ProjectionFigure.tsx; needs-you lime renders on cards through
// DealCard.tsx. This orchestrator imports both and puts each in its own place,
// and it carries no lime of its own.

import Link from 'next/link'
import {
  archiveRows,
  borrowersFor,
  columnTotals,
  columnWeight,
  columnsForPhase,
  dealsInStage,
  fmtAmount,
  fmtCompact,
  fmtTotal,
  hasSteps,
  isDealLevel,
  isGate,
  orderedPhases,
  orderedReturns,
  phaseTotals,
  purposeLabel,
  returnTarget,
  terminalStages,
  unevaluableTags,
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
import { columnSkin, typeSkin } from '@/lib/phase-palette'
import { emptyStagesNote, foldStages, phaseIsQuiet, phaseWeighted } from '@/lib/board-layout'
import {
  RADIUS,
  STROKE,
  SURFACE,
  TEXT,
  TYPE,
  radius,
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
  /** The subject property's address per rec deal id, resolved on the page. */
  addressByDeal: Record<string, string>
  selectedRef: string | null
  nowISO: string
  /** Today in Toronto. One value for the whole render, so every countdown on
   *  the screen agrees about what day it is. */
  todayYMD: string
}

const BASE = '/portal/admin/deals-beta'

function href(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

const panelStyle = {
  background: SURFACE.panel,
  border: `${STROKE.panel}px solid ${SURFACE.panelBorder}`,
  borderRadius: radius(RADIUS.panel),
}

export default function DealsBetaBoard(props: Props) {
  const { archive, withdrawnView, nostageView } = props

  return (
    <div className="mt-5">
      <InsightsStrip insights={props.insights} />
      <ViewSwitch
        stages={props.stages}
        deals={props.deals}
        archive={archive}
        withdrawnView={withdrawnView}
        nostageView={nostageView}
        withdrawnCount={props.withdrawnDeals.length}
      />
      {nostageView ? (
        <NoStageView
          stages={props.stages}
          deals={props.deals}
          clients={props.clients}
          roomDealIds={props.roomDealIds}
          canWithdraw={props.canWithdraw}
        />
      ) : withdrawnView ? (
        <WithdrawnView
          deals={props.withdrawnDeals}
          withdrawals={props.withdrawals}
          clients={props.clients}
          canWithdraw={props.canWithdraw}
        />
      ) : archive ? (
        <ArchiveView
          stages={props.stages}
          deals={props.deals}
          clients={props.clients}
          roomDealIds={props.roomDealIds}
          canWithdraw={props.canWithdraw}
        />
      ) : (
        <AllPhases {...props} />
      )}
      {!archive && !withdrawnView && !nostageView && (
        <ReturnRail
          returns={props.returns}
          phases={orderedPhases(props.phases)}
          stages={props.stages}
          sources={props.sources}
        />
      )}
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <p className="p-5" style={{ ...panelStyle, ...typeStyle(TYPE.body), color: TEXT.secondary }}>
      {children}
    </p>
  )
}

/** A section heading on one of the list views. */
function ViewHeading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 style={{ ...typeStyle(TYPE.phaseName), color: TEXT.primary }}>{title}</h2>
      <p
        className="mt-0.5 max-w-4xl"
        style={{ ...typeStyle(TYPE.phaseDescription), color: TEXT.secondary }}
      >
        {children}
      </p>
    </div>
  )
}

// ─── The insights strip ─────────────────────────────────────────────────────

function InsightsStrip({ insights }: { insights: Insights }) {
  if (insights.tiles.length === 0) return null
  return (
    <div className="mb-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {insights.tiles.map(t => (
          <div key={t.key} className="p-3" style={panelStyle} data-testid={`beta-tile-${t.key}`}>
            <div className="flex items-baseline gap-2">
              <p
                className="flex-1"
                style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}
              >
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
                <span
                  className="tabular-nums"
                  style={{ ...typeStyle(TYPE.figure), color: TEXT.primary }}
                >
                  {t.unit === 'days' ? `${Math.round(t.value)} days` : fmtTotal(t.value)}
                </span>
              )}
            </p>
            <p
              className="mt-1.5 tabular-nums"
              style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}
            >
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
        <p className="mt-2" style={{ ...typeStyle(TYPE.meta), color: TEXT.muted }}>
          {insights.omitted.map(o => (
            <span key={o.label}>
              {o.label} is not shown: {o.reason}.
            </span>
          ))}
        </p>
      )}
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
  if (rows.length === 0) return null

  return (
    <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${SURFACE.sectionHairline}` }}>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {rows.map(({ r, target }) => {
          const fromStage = stages.find(s => s.code === r.from_stage_code)
          return (
            <p key={r.code} style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}>
              <span style={{ color: TEXT.primary }}>
                {fromStage ? fromStage.label : r.from_phase} back to {target}
              </span>
              <span className="ml-2">{r.label}</span>
            </p>
          )
        })}
      </div>
    </div>
  )
}

// ─── Board / Archive / No stage / Withdrawn switch ──────────────────────────

function ViewSwitch({
  stages,
  deals,
  archive,
  withdrawnView,
  nostageView,
  withdrawnCount,
}: {
  stages: StageLike[]
  deals: DealLike[]
  archive: boolean
  withdrawnView: boolean
  nostageView: boolean
  withdrawnCount: number
}) {
  const count = archiveRows(stages, deals).length
  const nostageCount = unplacedDeals(stages, deals).length
  const boardOn = !archive && !withdrawnView && !nostageView
  const chip = (on: boolean) => ({
    ...typeStyle(TYPE.meta),
    borderRadius: radius(RADIUS.card),
    background: on ? TEXT.navy : SURFACE.panel,
    color: on ? SURFACE.panel : TEXT.secondary,
    border: `${STROKE.panel}px solid ${on ? TEXT.navy : SURFACE.panelBorder}`,
  })
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href={href({})} className="px-3 py-1.5" style={chip(boardOn)}>
        Board
      </Link>
      <Link href={href({ view: 'archive' })} className="px-3 py-1.5" style={chip(archive)}>
        Archive <span className="tabular-nums">{count}</span>
      </Link>
      {/* The count renders at zero for the same reason Withdrawn's does: the
          views must account for the whole book on the screen where the book is
          read, and the day a stageless record arrives, the place that explains
          it already exists. */}
      <Link
        href={href({ view: 'nostage' })}
        className="px-3 py-1.5"
        style={chip(nostageView)}
        data-testid="beta-view-nostage"
      >
        No stage <span className="tabular-nums">{nostageCount}</span>
      </Link>
      {/* THE COUNT IS ALWAYS HERE, INCLUDING AT ZERO. A withdrawn record leaves
          the columns and the totals, so this number is the only place the book
          can be read against what left it. */}
      <Link
        href={href({ view: 'withdrawn' })}
        className="px-3 py-1.5"
        style={chip(withdrawnView)}
        data-testid="beta-view-withdrawn"
      >
        Withdrawn <span className="tabular-nums">{withdrawnCount}</span>
      </Link>
    </div>
  )
}

// ─── The board: every phase, stacked ────────────────────────────────────────

function AllPhases(props: Props) {
  const ordered = orderedPhases(props.phases)
  if (ordered.length === 0) {
    return <Panel>No phases are configured, so there is nothing to show. Phases live in rec.phases.</Panel>
  }
  return (
    <div className="space-y-4">
      {ordered.map(phase => (
        <PhaseSection key={phase.code} phase={phase} {...props} />
      ))}
    </div>
  )
}

function PhaseSection(props: Props & { phase: PhaseLike }) {
  const { phase, stages, boardDeals: deals, tags } = props
  const columns = columnsForPhase(stages, phase.code)
  const dealLevel = isDealLevel(phase)
  const countFor = (s: StageLike) => (dealLevel ? dealsInStage(deals, s.code).length : 0)
  const fileCount = columns.reduce((n, s) => n + countFor(s), 0)

  // A phase with nothing in it folds to its header line alone. Attract has no
  // stages by configuration and the contact-level phases hold nobody, so all
  // three fold by one rule rather than three special cases.
  if (phaseIsQuiet(fileCount)) {
    return (
      <section style={panelStyle} data-testid={`beta-phase-${phase.code}`} data-quiet="true">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
          <h2 style={{ ...typeStyle(TYPE.phaseName), color: TEXT.primary }}>{phase.label}</h2>
          {phase.description && (
            <p
              className="min-w-0 flex-1"
              style={{ ...typeStyle(TYPE.phaseDescription), color: TEXT.secondary }}
            >
              {phase.description}
            </p>
          )}
          <span
            className="ml-auto shrink-0"
            style={{ ...typeStyle(TYPE.meta), color: TEXT.absent }}
          >
            {hasSteps(phase)
              ? `No ${phase.unit} in this phase yet`
              : 'Sources rather than steps, and no arrivals recorded yet'}
          </span>
        </div>
      </section>
    )
  }

  const { occupied, empty } = foldStages(columns, countFor)
  const note = emptyStagesNote(empty.length)
  const totals = phaseTotals(phase, stages, deals)
  const weighted = phaseWeighted(columns, code => columnTotals(dealsInStage(deals, code)).amount)
  const unevaluable = dealLevel ? unevaluableTags(tags, deals) : []

  return (
    <section style={panelStyle} data-testid={`beta-phase-${phase.code}`}>
      <header
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3"
        style={{ borderBottom: `1px solid ${SURFACE.sectionHairline}` }}
      >
        <div className="min-w-0 flex-1">
          <h2 style={{ ...typeStyle(TYPE.phaseName), color: TEXT.primary }}>{phase.label}</h2>
          {phase.description && (
            <p
              className="mt-0.5"
              style={{ ...typeStyle(TYPE.phaseDescription), color: TEXT.secondary }}
            >
              {phase.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="tabular-nums" style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}>
            {fileCount} {fileCount === 1 ? 'file' : 'files'}
          </span>
          {totals && phase.counts_dollars && (
            <>
              <Pipe />
              <span
                className="tabular-nums"
                style={{ ...typeStyle(TYPE.meta), color: TEXT.primary }}
              >
                {fmtTotal(totals.amount)}
              </span>
            </>
          )}
          {weighted && (
            <>
              <Pipe />
              <span className="flex items-center gap-1.5">
                <ProjectionLabel>weighted</ProjectionLabel>
                {/* NOT `beta-phase-...`: that prefix belongs to the section
                    itself, and a selector for phases would otherwise pick up
                    the figures inside them. */}
                <ProjectionFigure testId={`beta-phaseweight-${phase.code}`}>
                  {fmtTotal(weighted.weighted)}
                </ProjectionFigure>
              </span>
            </>
          )}
        </div>
      </header>

      <div className="p-3">
        {/* A tag rule that cannot be evaluated is named rather than silently
            dropped, because "no tag" and "cannot tell" are different facts. */}
        {unevaluable.map(u => (
          <p
            key={u.tag.code}
            className="mb-3"
            style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}
          >
            The {u.tag.label} tag is not shown: its rule reads {u.tag.rule_field}, which no deal row
            carries. Marking every file with it would invent a signal out of a field nobody records.
          </p>
        ))}

        {/* THE GRID WRAPS, IT DOES NOT SCROLL. auto-fit with a minimum means a
            phase with six occupied stages reflows onto a second line rather
            than pushing the board off the side of the screen. */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {occupied.map(col => (
            <StageColumn
              key={col.code}
              {...props}
              stage={col}
              index={columns.findIndex(c => c.code === col.code)}
              total={columns.length}
              inColumn={dealsInStage(deals, col.code)}
            />
          ))}
        </div>

        {/* An empty stage is still a fact about the process, so it is named
            rather than dropped. */}
        {note && (
          <p
            className="mt-3"
            style={{ ...typeStyle(TYPE.meta), color: TEXT.muted }}
            data-testid={`beta-empty-stages-${phase.code}`}
          >
            {note} {empty.map(s => s.label).join(', ')}.
          </p>
        )}
      </div>
    </section>
  )
}

function Pipe() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-px"
      style={{ background: SURFACE.figurePipe }}
    />
  )
}

function StageColumn(
  props: Props & {
    phase: PhaseLike
    stage: StageLike
    index: number
    total: number
    inColumn: DealLike[]
  },
) {
  const { phase, stage, index, total, inColumn } = props
  // Resolved on the page with the same resolveRoom the file page uses, so the
  // refusal posture on a card and the refusal in the route agree by
  // construction rather than by two people remembering the same rule.
  const rooms = new Set(props.roomDealIds)
  const skin = columnSkin(phase.code, index, total)
  const totals = columnTotals(inColumn)
  const gate = isGate(stage)
  const weight = columnWeight(stage, inColumn)

  return (
    <div
      className="overflow-hidden"
      style={{ background: SURFACE.columnGround, borderRadius: radius(RADIUS.column) }}
      data-testid={`beta-col-${stage.code}`}
    >
      {/* Hue says which phase, depth says how far along. A gate is dashed
          rather than solid: a decision point is not somewhere a file rests. */}
      <div
        style={{
          height: `${STROKE.stageRule}px`,
          ...(gate
            ? {
                backgroundImage: `repeating-linear-gradient(90deg, ${skin.accent} 0 6px, transparent 6px 11px)`,
              }
            : { background: skin.accent }),
        }}
        aria-hidden="true"
      />
      <div className="px-3 pb-2 pt-2.5">
        {/* THE COUNT SITS BESIDE THE NAME, NOT RIGHT-ALIGNED. Right-aligning it
            puts it against the next column, where it reads as belonging to that
            one instead. The stage name is navy rather than the phase hue:
            coloured headings are not the brand. */}
        <div className="flex items-center gap-2">
          <h3 style={{ ...typeStyle(TYPE.stageName), color: TEXT.navy }}>{stage.label}</h3>
          <span
            className="shrink-0 tabular-nums"
            style={{
              ...typeStyle(TYPE.countPill),
              color: TEXT.navy,
              background: SURFACE.columnGround,
              borderRadius: radius(RADIUS.countPill),
              padding: '2px 9px',
              border: `${STROKE.panel}px solid ${SURFACE.cardBorder}`,
            }}
            data-testid={`beta-count-${stage.code}`}
          >
            {totals.count}
          </span>
          {gate && (
            <span
              className="shrink-0"
              style={{ ...typeStyle(TYPE.meta), color: TEXT.muted }}
            >
              gate
            </span>
          )}
        </div>
        {/* The single most useful element for someone who has never seen the
            system: what this stage actually means. */}
        {stage.description && (
          <p
            className="mt-1"
            style={{ ...typeStyle(TYPE.stageDescription), color: TEXT.muted }}
          >
            {stage.description}
          </p>
        )}
        {weight && (
          <p className="mt-1.5 flex items-center gap-1.5">
            <ProjectionLabel>{weight.probability}% weighted</ProjectionLabel>
            <ProjectionFigure testId={`beta-weighted-${stage.code}`}>
              {fmtTotal(weight.weighted)}
            </ProjectionFigure>
          </p>
        )}
      </div>

      <div className="space-y-2 px-2 pb-2">
        {inColumn.map(d => {
          const sourceId = typeof d.source_id === 'string' ? d.source_id : null
          const posture = feedPosture({
            finmoApplicationId:
              typeof d.finmo_application_id === 'string' ? d.finmo_application_id : null,
            hasRoom: rooms.has(d.id),
          })
          return (
            <DealCard
              key={d.id}
              deal={d}
              events={props.events}
              clients={props.clients}
              tags={props.tags}
              milestoneTypes={props.milestoneTypes}
              milestones={props.milestones}
              nowISO={props.nowISO}
              todayYMD={props.todayYMD}
              stageCategory={stage.category ?? null}
              address={props.addressByDeal[d.id] ?? null}
              selected={(d.file_ref ?? d.id) === props.selectedRef}
              href={`/portal/admin/deals-beta/${encodeURIComponent(d.id)}`}
              // A record with no source id cannot be keyed by the loader, so
              // there is nothing to withdraw and no control is offered.
              remove={
                props.canWithdraw && sourceId ? (
                  <RemoveRecordControl
                    sourceId={sourceId}
                    fileRef={d.file_ref}
                    posture={posture}
                    variant="card"
                  />
                ) : undefined
              }
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── A row on one of the list views ─────────────────────────────────────────

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
  /** The fact that leads the row, where one does. */
  lead?: React.ReactNode
  /** The link to the file page. Passed IN by each view rather than built here,
   *  so tests/rec-withdrawal.test.ts can still find it inside the view whose
   *  reachability it is asserting. */
  refLink: React.ReactNode
  testId: string
  children?: React.ReactNode
}) {
  const borrowers = borrowersFor(deal, clients)
  const amount = fmtAmount(deal.mortgage_amount)
  const type = purposeLabel(deal.deal_type)
  const t = typeSkin(deal.deal_type)
  return (
    <div
      className="px-4 py-3"
      style={{ borderTop: `1px solid ${SURFACE.sectionHairline}` }}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {lead}
        {refLink}
        {borrowers.length > 0 && (
          <span style={{ ...typeStyle(TYPE.body), color: TEXT.primary }}>
            {borrowers.map(b => b.name).join(', ')}
          </span>
        )}
        {type && t && (
          <span
            className="rounded-full border px-2 py-0.5"
            style={{ ...typeStyle(TYPE.meta), color: t.fg, borderColor: t.border, background: t.bg }}
          >
            {type}
          </span>
        )}
        <span
          className="ml-auto tabular-nums"
          style={{
            ...typeStyle(TYPE.cardAmount),
            color: amount ? TEXT.primary : TEXT.absent,
          }}
        >
          {amount ?? 'No amount'}
        </span>
      </div>
      {children}
    </div>
  )
}

// ─── The No stage view ──────────────────────────────────────────────────────

/** RECORDS THE BOARD CANNOT PLACE, AS A VIEW RATHER THAN A FOOTNOTE. Census
 *  2026-08-05: 33 of 160, every one a historical import with a NULL stage_code,
 *  every one carrying a file_ref, none with a workbench room. NO STAGE IS
 *  INVENTED to make them visible: writing one would fabricate a fact about a
 *  file. Membership comes from lib/phase-model.ts unplacedDeals, the COMPLEMENT
 *  of the board and the Archive, so the three sets partition the live book. */
function NoStageView({
  stages,
  deals,
  clients,
  roomDealIds,
  canWithdraw,
}: {
  stages: StageLike[]
  deals: DealLike[]
  clients: DealClientLike[]
  roomDealIds: string[]
  canWithdraw: boolean
}) {
  const rows = unplacedDeals(stages, deals)
  const rooms = new Set(roomDealIds)
  return (
    <section>
      <ViewHeading title="No stage">
        Records the migration loaded without any stage, so the board and the Archive cannot place
        them. Nothing here has been given a stage to make it visible, because that would invent a
        fact about the file. The tiles at the top count these records, and one that carries an amount
        counts as open there, since nothing says it ended. Removing works from here, and a record the
        loader later stages will move to the board on its own.
      </ViewHeading>
      {rows.length === 0 ? (
        <Panel>
          Every record carries a stage the board knows, so there is nothing here. This view stays,
          because the day the loader delivers a record without a stage, this is where it will be.
        </Panel>
      ) : (
        <div className="overflow-hidden" style={panelStyle}>
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
                    className="tabular-nums underline underline-offset-2"
                    style={{ ...typeStyle(TYPE.fileRef), color: TEXT.fileRef }}
                  >
                    {deal.file_ref ?? 'No file reference'}
                  </Link>
                }
                lead={
                  <span
                    className="min-w-[13rem]"
                    style={{ ...typeStyle(TYPE.body), color: TEXT.absent }}
                  >
                    {reason === 'no_stage'
                      ? 'No stage recorded'
                      : `Stage code the board does not know: ${deal.stage_code}`}
                  </span>
                }
              >
                {canWithdraw && sourceId && (
                  <div className="-mx-3">
                    <RemoveRecordControl
                      sourceId={sourceId}
                      fileRef={deal.file_ref}
                      posture={posture}
                      variant="card"
                    />
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

// ─── The Withdrawn view ─────────────────────────────────────────────────────
//
// WHERE MICHAEL WILL BE STANDING WHEN HE GETS ONE WRONG. That is the whole job
// of this view, so every row states who removed it, when, and the reason they
// typed, and carries the control that puts it back.

function WithdrawnView({
  deals,
  withdrawals,
  clients,
  canWithdraw,
}: {
  deals: DealLike[]
  withdrawals: WithdrawalLike[]
  clients: DealClientLike[]
  canWithdraw: boolean
}) {
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
          No records have been withdrawn. When one is, it leaves the phase columns and the totals and
          appears here with the reason it was removed.
        </Panel>
      ) : (
        <div className="overflow-hidden" style={panelStyle}>
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
                    className="tabular-nums underline underline-offset-2"
                    style={{ ...typeStyle(TYPE.fileRef), color: TEXT.fileRef }}
                  >
                    {deal.file_ref ?? 'No file reference'}
                  </Link>
                }
              >
                {/* The identity on the row is the one the workbench recorded off
                    the verified session at decision time. Nothing here supplies
                    it and nothing here could. */}
                <p className="mt-1" style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}>
                  {w?.instructed_by ? `Removed by ${w.instructed_by}` : 'Removed'}
                  {w?.instructed_on ? ` on ${w.instructed_on}` : ''}
                </p>
                {w?.reason && (
                  <p
                    className="mt-0.5 max-w-prose"
                    style={{ ...typeStyle(TYPE.body), color: TEXT.primary }}
                  >
                    <span style={{ color: TEXT.muted }}>Reason given: </span>
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

function ArchiveView({
  stages,
  deals,
  clients,
  roomDealIds,
  canWithdraw,
}: {
  stages: StageLike[]
  deals: DealLike[]
  clients: DealClientLike[]
  roomDealIds: string[]
  canWithdraw: boolean
}) {
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
        <div className="p-5" style={panelStyle}>
          <p style={{ ...typeStyle(TYPE.body), color: TEXT.secondary }}>
            No files have ended yet. These are the outcomes a file can end in, all of them empty
            today:
          </p>
          <ul className="mt-3 space-y-2">
            {outcomes.map(s => (
              <li
                key={s.code}
                className="pl-3"
                style={{ borderLeft: `2px solid ${SURFACE.cardBorder}` }}
              >
                <p style={{ ...typeStyle(TYPE.stageName), color: TEXT.primary }}>{s.label}</p>
                {s.description && (
                  <p style={{ ...typeStyle(TYPE.meta), color: TEXT.secondary }}>{s.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="overflow-hidden" style={panelStyle}>
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
                    className="tabular-nums underline underline-offset-2"
                    style={{ ...typeStyle(TYPE.fileRef), color: TEXT.fileRef }}
                  >
                    {deal.file_ref ?? 'No file reference'}
                  </Link>
                }
                lead={
                  // The outcome leads the row: it decides whether this person is
                  // worth contacting again.
                  <span
                    className="min-w-[13rem]"
                    style={{ ...typeStyle(TYPE.stageName), color: TEXT.primary }}
                  >
                    {stage.label}
                  </span>
                }
              >
                {canWithdraw && sourceId && (
                  <div className="-mx-3">
                    <RemoveRecordControl
                      sourceId={sourceId}
                      fileRef={deal.file_ref}
                      posture={posture}
                      variant="card"
                    />
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
