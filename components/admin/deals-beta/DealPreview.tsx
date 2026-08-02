// The deal preview panel.
//
// A SERVER COMPONENT, like everything else on this board. Selection rides
// `?deal=<file_ref>` through the same searchParams mechanism the collapse state
// already uses, so opening and closing the panel is a Next soft navigation —
// no browser page load, no client state, and the board keeps its ~195 B of
// client JS. Defending that figure is worth a server round trip.
//
// READ ONLY, and structurally so: there is no form, no handler, no button that
// posts, and no edit control of any kind. The only interactive element is the
// close link, which removes the parameter from the URL.
//
// NO PROJECTION GREEN HERE. This panel shows one file, which puts it on the
// card side of the zone rule — a probability is stated in words and figures,
// never in the projection fill, so the green stays confined to column footers
// and the insights strip where it means "this whole column is a forecast".

import Link from 'next/link'
import {
  BLOCKED_BY_LABELS,
  DAYS_UNKNOWN_COPY,
  blockedByChip,
  borrowersFor,
  conditionCategoryLabel,
  conditionsForDeal,
  daysInStage,
  fmtAmount,
  milestonesForDeal,
  ownerLabel,
  purposeLabel,
  stageProbability,
  type ConditionLike,
  type DealClientLike,
  type DealLike,
  type DealMilestoneLike,
  type MilestoneTypeLike,
  type PhaseLike,
  type StageEventLike,
  type StageLike,
} from '@/lib/phase-model'
import { typeSkin } from '@/lib/phase-palette'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 border-b border-cool-100 py-1.5 last:border-b-0">
      <span className="min-w-[5.5rem] text-[10px] uppercase tracking-wide text-cool-500">
        {label}
      </span>
      <span className="flex-1 text-sm text-navy">{children}</span>
    </div>
  )
}

export default function DealPreview({
  deal,
  stage,
  phase,
  events,
  clients,
  conditions,
  milestoneTypes,
  milestones,
  nowISO,
  closeHref,
}: {
  deal: DealLike
  stage: StageLike | null
  phase: PhaseLike | null
  events: StageEventLike[]
  clients: DealClientLike[]
  conditions: ConditionLike[]
  milestoneTypes: MilestoneTypeLike[]
  milestones: DealMilestoneLike[]
  nowISO: string
  closeHref: string
}) {
  const borrowers = borrowersFor(deal, clients)
  const days = daysInStage(deal, events, nowISO)
  const chip = blockedByChip(deal.blocked_by)
  const amount = fmtAmount(deal.mortgage_amount)
  const type = purposeLabel(deal.deal_type)
  const t = typeSkin(deal.deal_type)
  const prob = stageProbability(stage)
  const rows = conditionsForDeal(deal, conditions)
  const marks = milestonesForDeal(deal, milestones, milestoneTypes)
  const open = rows.filter(c => c.status === 'open').length

  return (
    <aside
      className="w-full shrink-0 self-start rounded-[9px] border border-cool-300 bg-white lg:sticky lg:top-4 lg:w-[340px]"
      aria-label={`Preview of ${deal.file_ref ?? 'deal'}`}
      data-testid="beta-preview"
    >
      <div className="flex items-start gap-2 border-b border-cool-200 px-4 py-3">
        <div className="min-w-0">
          <p className="font-heading text-[11px] tabular-nums text-cool-600">
            {deal.file_ref ?? 'no file ref'}
          </p>
          {borrowers.length > 0 ? (
            borrowers.map(b => (
              <p key={`${b.name}-${b.role}`} className="text-sm leading-snug text-navy">
                {b.name}
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-cool-500">
                  {b.role}
                </span>
              </p>
            ))
          ) : (
            <p className="text-sm text-cool-500">no borrower recorded</p>
          )}
        </div>
        {/* The only control on this panel. */}
        <Link
          href={closeHref}
          scroll={false}
          aria-label="Close preview"
          className="ml-auto shrink-0 rounded-sm px-1.5 py-0.5 text-sm leading-none text-cool-600 hover:bg-cool-100 hover:text-navy"
          data-testid="beta-preview-close"
        >
          ✕
        </Link>
      </div>

      <div className="px-4 py-2">
        {type && t && (
          <Row label="Purpose">
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: t.fg, borderColor: t.border, background: t.bg }}
            >
              {type}
            </span>
          </Row>
        )}
        {amount && (
          <Row label="Amount">
            <span className="font-heading font-semibold tabular-nums">{amount}</span>
          </Row>
        )}
        <Row label="Stage">
          <span className="font-heading text-sm">{stage?.label ?? deal.stage_code ?? 'unknown'}</span>
          {phase && <span className="ml-2 text-[11px] text-cool-600">{phase.label}</span>}
          {stage?.description && (
            <span className="mt-1 block text-[11px] leading-snug text-cool-600">
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
            // The rule stands: no figure, and the two absent states stay
            // distinguished rather than collapsing into a dash.
            <span className="text-sm italic text-cool-500">{DAYS_UNKNOWN_COPY[days.reason]}</span>
          )}
        </Row>
        <Row label="Blocked by">
          {chip ? (
            <span className="rounded-full bg-cool-100 px-2 py-0.5 text-[10px] font-semibold text-cool-700">
              {BLOCKED_BY_LABELS[chip]}
            </span>
          ) : (
            <span className="text-sm text-cool-500">nobody recorded</span>
          )}
        </Row>
        <Row label="Probability">
          {prob !== null ? (
            // Stated plainly. No projection fill on this side of the zone rule.
            <span className="tabular-nums">{prob}%</span>
          ) : (
            <span className="text-sm text-cool-500">
              none on this stage
            </span>
          )}
        </Row>
      </div>

      {marks.length > 0 && (
        <div className="border-t border-cool-200 px-4 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-cool-500">Milestones</p>
          {marks.map(m => (
            <p key={m.code} className="mt-1 text-[11px] text-cool-700 tabular-nums">
              <span className="mr-1 text-cool-400">◆</span>
              {m.label}
              {m.occurred_at && <span className="ml-1">{m.occurred_at.slice(0, 10)}</span>}
            </p>
          ))}
        </div>
      )}

      <div className="border-t border-cool-200 px-4 py-2.5">
        <p className="text-[10px] uppercase tracking-wide text-cool-500">
          Conditions
          {rows.length > 0 && (
            <span className="ml-1.5 tabular-nums text-cool-600">
              {open} open of {rows.length}
            </span>
          )}
        </p>
        {rows.length === 0 ? (
          // Calm and honest, same as an empty column.
          <p className="mt-1.5 text-xs text-cool-500">No conditions on this file.</p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {rows.map((c, i) => (
              <li key={`${c.cond_number ?? i}`} className="border-l-2 border-cool-300 pl-2">
                <div className="flex flex-wrap items-baseline gap-x-1.5">
                  {c.cond_number && (
                    <span className="font-heading text-[10px] tabular-nums text-cool-600">
                      {c.cond_number}
                    </span>
                  )}
                  {c.status && (
                    <span className="text-[10px] uppercase tracking-wide text-cool-500">
                      {c.status}
                    </span>
                  )}
                  {c.owner && (
                    <span className="text-[10px] text-cool-600">{ownerLabel(c.owner)}</span>
                  )}
                  {c.load_bearing && (
                    <span className="rounded-sm border border-cool-300 px-1 text-[9px] uppercase tracking-wide text-cool-600">
                      load bearing
                    </span>
                  )}
                </div>
                {c.text && (
                  <p className="mt-0.5 text-[11px] leading-snug text-cool-700">{c.text}</p>
                )}
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-cool-500">
                  {conditionCategoryLabel(c.category) && (
                    <span>{conditionCategoryLabel(c.category)}</span>
                  )}
                  {c.due_date && <span className="tabular-nums">due {c.due_date}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
