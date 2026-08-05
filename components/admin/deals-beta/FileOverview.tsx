// The Overview tab (handoff 42) — the only filled tab in this session.
//
// Read from `rec` through portal_readonly, the same path the board uses. A
// SERVER COMPONENT with no form, no handler and no control of any kind: this
// session builds the container, and the file-level features move into the other
// seven tabs in the sessions that follow.
//
// COLOUR. Reuses lib/phase-palette.ts and nothing else. The zone rule holds:
// this page shows ONE file, which puts it on the card side, so it carries NO
// projection green — a probability is stated as a plain percentage in words and
// figures, never in a projection fill. The four field groups are banded in the
// file's own PHASE hue, which is the palette's existing meaning for hue (which
// phase), not a new one invented here.
//
// EVERY EMPTY FIELD READS "Not specified". Never blank, which reads as a
// rendering fault, and never zero, which reads as a measured figure that
// happens to be none.

import {
  NOT_SPECIFIED,
  fieldGroups,
  fmtDateWords,
  fmtMoneyExact,
  formatMonths,
  humanise,
  type MortgageLike,
  type PropertyLike,
} from '@/lib/beta-file'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  blockedByChip,
  borrowersFor,
  daysInStage,
  milestonesForDeal,
  purposeLabel,
  stageProbability,
  type DealClientLike,
  type DealLike,
  type DealMilestoneLike,
  type MilestoneTypeLike,
  type PhaseLike,
  type StageEventLike,
  type StageLike,
} from '@/lib/phase-model'
import { phaseAccent, phaseTint, typeSkin } from '@/lib/phase-palette'

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-cool-500">{label}</dt>
      <dd
        className={
          value
            ? 'mt-0.5 text-sm font-medium text-navy break-words'
            : 'mt-0.5 text-sm italic text-cool-400'
        }
      >
        {value ?? NOT_SPECIFIED}
      </dd>
    </div>
  )
}

function Band({
  phaseCode,
  children,
}: {
  phaseCode: string | null
  children: React.ReactNode
}) {
  const accent = phaseCode ? phaseAccent(phaseCode) : '#032133'
  const tint = phaseCode ? phaseTint(phaseCode) : undefined
  return (
    <div
      className="rounded-[7px] border border-cool-200 border-l-[3px] bg-white px-3.5 py-1"
      style={{ borderLeftColor: accent, background: tint }}
    >
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-cool-100 py-2 last:border-b-0">
      <span className="min-w-[7rem] text-[10px] uppercase tracking-wide text-cool-500">{label}</span>
      <span className="flex-1 text-sm text-navy">{children}</span>
    </div>
  )
}

export default function FileOverview({
  deal,
  stage,
  phase,
  events,
  clients,
  milestoneTypes,
  milestones,
  mortgage,
  existing,
  property,
  nowISO,
}: {
  deal: DealLike & {
    mortgage_amount: number | null
    purchase_price: number | null
    down_payment: number | null
    down_payment_not_applicable: boolean | null
    lender_name_raw: string | null
    closing_date: string | null
    existing_mortgage_id: string | null
  }
  stage: StageLike | null
  phase: PhaseLike | null
  events: StageEventLike[]
  clients: DealClientLike[]
  milestoneTypes: MilestoneTypeLike[]
  milestones: DealMilestoneLike[]
  mortgage: MortgageLike | null
  existing: MortgageLike | null
  property: PropertyLike | null
  nowISO: string
}) {
  const borrowers = borrowersFor(deal, clients)
  const days = daysInStage(deal, events, nowISO)
  const chip = blockedByChip(deal.blocked_by)
  const type = purposeLabel(deal.deal_type)
  const t = typeSkin(deal.deal_type)
  const prob = stageProbability(stage)
  const marks = milestonesForDeal(deal, milestones, milestoneTypes)
  const groups = fieldGroups({ deal, mortgage, property })
  const phaseCode = phase?.code ?? null

  return (
    <div className="mt-4 space-y-4" data-testid="beta-file-overview">
      {/* ── Who and what ───────────────────────────────────────────────── */}
      <section className="rounded-[9px] border border-cool-200 bg-white p-4">
        <Row label="Borrowers">
          {borrowers.length > 0 ? (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {borrowers.map(b => (
                <span key={`${b.name}-${b.role}`}>
                  {b.name}
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cool-500">
                    {b.role}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-sm italic text-cool-400">No borrower recorded on this file</span>
          )}
        </Row>
        <Row label="Purpose">
          {type && t ? (
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: t.fg, borderColor: t.border, background: t.bg }}
            >
              {type}
            </span>
          ) : (
            <span className="text-sm italic text-cool-400">{NOT_SPECIFIED}</span>
          )}
          <span className="ml-3 font-heading font-semibold tabular-nums">
            {fmtMoneyExact(deal.mortgage_amount) ?? (
              <span className="font-body text-sm font-normal italic text-cool-400">
                {NOT_SPECIFIED}
              </span>
            )}
          </span>
        </Row>
        <Row label="Stage">
          <span className="font-heading text-sm">
            {stage?.label ?? deal.stage_code ?? 'unknown'}
          </span>
          {phase && <span className="ml-2 text-[11px] text-cool-600">{phase.label}</span>}
          {/* Probability as a plain percentage. NO projection green on a file
              page — one file is an actual, not a forecast over a column. */}
          {prob !== null && (
            <span className="ml-2 text-[11px] text-cool-600">{prob}% at this stage</span>
          )}
          {stage?.description && (
            <span className="mt-1 block max-w-prose text-[11px] leading-snug text-cool-600">
              {stage.description}
            </span>
          )}
        </Row>
        <Row label="Days in stage">
          {days.known ? (
            <span className="tabular-nums">
              {days.days} days
              <span className="ml-1.5 text-[11px] text-cool-500">since {days.since}</span>
            </span>
          ) : (
            // The board's rule stands: no invented figure, and the two absent
            // states stay distinguished rather than collapsing into a dash.
            <span className="text-sm italic text-cool-500">{DAYS_UNKNOWN_COPY[days.reason]}</span>
          )}
        </Row>
        <Row label="Blocked by">
          {chip ? (
            <span className="text-sm">{BLOCKED_BY_LABELS[chip]}</span>
          ) : (
            <span className="text-sm italic text-cool-400">Nobody — nothing is waiting</span>
          )}
        </Row>
        <Row label="Milestones">
          {marks.length > 0 ? (
            <span className="flex flex-wrap gap-2">
              {marks.map(m => (
                <span
                  key={m.code}
                  className="rounded border border-cool-300 px-1.5 py-0.5 text-[11px] text-cool-700"
                >
                  {m.label}
                  {m.occurred_at && <span className="ml-1 tabular-nums">{m.occurred_at}</span>}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-sm italic text-cool-400">None recorded</span>
          )}
        </Row>
      </section>

      {/* ── The mortgage, in four banded groups ────────────────────────── */}
      <section className="space-y-2">
        <h2 className="font-heading text-sm font-semibold text-navy">The mortgage</h2>
        {groups.map(g => (
          <Band key={g.key} phaseCode={phaseCode}>
            {g.fields.map(f => (
              <Field key={f.label} label={f.label} value={f.value} />
            ))}
          </Band>
        ))}
        {!mortgage && (
          <p className="text-[11px] leading-snug text-cool-500 font-ui">
            No mortgage record is attached to this file yet, so the lender, rate, term,
            amortization and payment fields have nothing to read. They fill in when one is.
          </p>
        )}
      </section>

      {/* ── The mortgage being replaced, when the file names one ───────── */}
      {existing && (
        <section className="rounded-[9px] border border-cool-200 bg-white p-4">
          <h2 className="font-heading text-sm font-semibold text-navy">
            The mortgage being replaced
          </h2>
          <p className="mt-0.5 text-[11px] leading-snug text-cool-500 font-ui">
            This is the client’s existing mortgage, not the terms of this deal. It is shown
            separately so the two can never be read as one.
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Lender" value={humanise(existing.lender_name_raw)} />
            <Field
              label="Rate"
              value={existing.rate !== null ? `${existing.rate}%` : null}
            />
            <Field label="Term" value={formatMonths(existing.term_months)} />
            <Field label="Matures" value={fmtDateWords(existing.maturity_on)} />
          </dl>
        </section>
      )}
    </div>
  )
}
