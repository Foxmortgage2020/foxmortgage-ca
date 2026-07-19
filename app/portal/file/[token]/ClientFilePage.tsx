// The client's status page body. Server component, no client JS needed.
//
// THE RULES THIS FILE OBEYS (config/lifecycle.ts holds them in full):
//   - Sections render ONLY when their data is real. There are no placeholders
//     here: the internal surfaces show planned capability on purpose, but a
//     placeholder on a client's page just advertises what we cannot do.
//   - Nothing tells the person no. No qualification, no rate, no decline. No
//     internal judgment: the documents checklist reads only the raw Finmo
//     request state, never an AI verdict, flag, or freshness note.
//   - Brand, not admin tokens: Poppins and Montserrat, brand navy, warm
//     whitespace. Lime appears exactly once, on the single primary contact
//     action, because on this surface it is the brand accent rather than the
//     admin decision token.
//   - Mobile FIRST, desktop CONSIDERED (B8a standing rule): built for the
//     thumb at 375px, and composed for the laptop at 1280px — a wider frame,
//     the journey given room, documents and team side by side. Never a
//     stretched phone column. Both widths are designed and proven together.

import { CONTACT } from '@/lib/contact'
import type { ClientFileView, TeamMember } from '@/lib/client-file'
import type { ClientDocChecklist } from '@/lib/client-checklist'
import ClientFooter from './ClientFooter'

function formatClosing(iso: string): { date: string; countdown: string } | null {
  // Tolerant of a bare date ("2026-07-28") and a full timestamp: take the date
  // part only, so a workbench value with a time never breaks the concat.
  const dateOnly = iso.slice(0, 10)
  const d = new Date(`${dateOnly}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
  const today = new Date()
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((d.getTime() - midnight.getTime()) / 86_400_000)
  const countdown =
    days > 1
      ? `${days} days to go`
      : days === 1
        ? 'Tomorrow'
        : days === 0
          ? 'Today'
          : 'Closing day has passed'
  return { date, countdown }
}

const CARD = 'rounded-2xl border border-navy/10 bg-white p-6 md:p-7'
const CARD_LABEL = 'font-heading text-xs font-bold uppercase tracking-wider text-navy/50'

export default function ClientFilePage({ view }: { view: ClientFileView }) {
  const { journey } = view
  const closing = view.closingDate ? formatClosing(view.closingDate) : null

  return (
    <main className="min-h-screen bg-[#F7F9FA] px-5 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-md md:max-w-4xl">
        {/* ── Greeting ── */}
        <p className="font-heading text-xs font-bold uppercase tracking-[0.14em] text-navy/50">
          Fox Mortgage
        </p>
        <h1 className="mt-3 font-heading text-[26px] font-bold leading-tight text-navy sm:text-3xl md:text-[40px]">
          {view.firstName ? `Hi ${view.firstName}.` : 'Your mortgage file.'}
        </h1>
        <p className="mt-2 font-body text-[15px] text-navy/60 md:text-base">
          Here&rsquo;s where your mortgage is right now.
        </p>
        {view.fileRef && (
          <p className="mt-1 font-body text-xs tracking-wide text-navy/35">{view.fileRef}</p>
        )}

        {/* ── The journey ── full width, given room to breathe on desktop */}
        <section className="mt-8 rounded-2xl border border-navy/10 bg-white p-6 md:p-8">
          {journey.mapped && journey.current ? (
            <>
              <ol className="flex flex-col gap-0">
                {journey.phases.map((p, i) => (
                  <li key={p.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        aria-hidden
                        className={
                          p.state === 'done'
                            ? 'mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy text-[10px] font-bold text-white'
                            : p.state === 'current'
                              ? 'mt-1 h-5 w-5 shrink-0 rounded-full border-[5px] border-navy bg-white'
                              : 'mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-navy/15 bg-white'
                        }
                      >
                        {p.state === 'done' ? '✓' : ''}
                      </span>
                      {i < journey.phases.length - 1 && (
                        <span
                          aria-hidden
                          className={`w-0.5 flex-1 ${p.state === 'done' ? 'bg-navy' : 'bg-navy/10'}`}
                        />
                      )}
                    </div>
                    <div className={i < journey.phases.length - 1 ? 'pb-5 md:pb-6' : ''}>
                      <p
                        className={
                          p.state === 'current'
                            ? 'font-heading text-[15px] font-bold text-navy md:text-base'
                            : 'font-heading text-[15px] font-semibold text-navy/40 md:text-base'
                        }
                      >
                        {p.label}
                      </p>
                      {p.state === 'current' && (
                        <p className="mt-1.5 font-body text-sm leading-relaxed text-navy/70 md:text-[15px]">
                          {journey.step?.happening ?? journey.current?.happening}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>

              {journey.needFromYou && (
                <div className="mt-5 rounded-xl bg-[#F2F7EC] p-4 md:p-5">
                  <p className="font-heading text-xs font-bold uppercase tracking-wider text-navy/60">
                    What we need from you
                  </p>
                  <p className="mt-1.5 font-body text-sm leading-relaxed text-navy md:text-[15px]">
                    {journey.needFromYou}
                  </p>
                </div>
              )}
            </>
          ) : (
            // The calm generic. A stage we cannot place is loud in our logs and
            // quiet here: the client never sees an error or an internal word.
            <p className="font-body text-[15px] leading-relaxed text-navy/70 md:text-base">
              We&rsquo;re working on your file. Michael will be in touch with an update.
            </p>
          )}
        </section>

        {/* ── Closing day ── renders only when there is a real date. On desktop
            it reads as a wide band (label left, the date and countdown right). */}
        {closing && (
          <section className="mt-4 rounded-2xl border border-navy/10 bg-white p-6 md:flex md:items-center md:justify-between md:p-7">
            <p className={CARD_LABEL}>Closing day</p>
            <div className="md:text-right">
              <p className="mt-2 font-heading text-xl font-bold text-navy md:mt-0 md:text-2xl">
                {closing.date}
              </p>
              <p className="mt-0.5 font-body text-sm text-navy/60">{closing.countdown}</p>
            </div>
          </section>
        )}

        {/* ── Documents and team, side by side where the width allows ── */}
        <div className="mt-4 space-y-4 md:mt-4 md:grid md:grid-cols-2 md:gap-5 md:space-y-0">
          <DocumentsCard checklist={view.documents} />
          <section className={CARD}>
            <p className={CARD_LABEL}>Your team</p>
            <ul className="mt-3 flex flex-col gap-4">
              {view.team.map(m => (
                <TeamRow key={`${m.role}-${m.name}`} member={m} />
              ))}
            </ul>
          </section>
        </div>

        {/* ── Questions ── the one lime on the page */}
        <section className="mt-4 rounded-2xl bg-navy p-6 md:p-7">
          <p className="font-heading text-lg font-bold text-white md:text-xl">Questions?</p>
          <p className="mt-1.5 font-body text-sm leading-relaxed text-white/70 md:text-[15px]">
            Ask Michael anything, any time. No question is too small.
          </p>
          <div className="mt-4 flex flex-col gap-2 md:flex-row md:flex-wrap">
            <a
              href={CONTACT.phone.href}
              className="rounded-xl bg-lime px-5 py-3 text-center font-heading text-sm font-bold text-navy"
            >
              Call {CONTACT.phone.display}
            </a>
            {CONTACT.bookingUrl && (
              <a
                href={CONTACT.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/20 px-5 py-3 text-center font-heading text-sm font-bold text-white"
              >
                Book a time with Michael
              </a>
            )}
            <a
              href={CONTACT.email.href}
              className="rounded-xl border border-white/20 px-5 py-3 text-center font-heading text-sm font-bold text-white"
            >
              Email Michael
            </a>
            {/* Review link renders only when the URL exists (placeholder-absent
                rule); no dead link ever shows to a client. */}
            {CONTACT.reviewUrl && (
              <a
                href={CONTACT.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-white/20 px-5 py-3 text-center font-heading text-sm font-bold text-white"
              >
                Leave a review
              </a>
            )}
          </div>
        </section>

        <ClientFooter />
      </div>
    </main>
  )
}

// The documents card. With a checklist it shows progress and the three client
// states; without one it falls back to the upload guidance (never an error).
// The guidance stays beneath the checklist too, because uploads always happen
// through the same secure link.
function DocumentsCard({ checklist }: { checklist: ClientDocChecklist | null }) {
  const allDone = checklist ? checklist.total > 0 && checklist.done === checklist.total : false
  return (
    <section className={CARD}>
      <p className={CARD_LABEL}>Your documents</p>

      {checklist && (
        <div className="mt-3">
          <p className="font-heading text-base font-bold text-navy">
            {allDone ? 'Everything’s in' : `${checklist.done} of ${checklist.total} done`}
          </p>

          {checklist.waiting > 0 && (
            <div className="mt-3 rounded-xl bg-[#F2F7EC] p-4">
              <p className="font-heading text-xs font-bold uppercase tracking-wider text-navy/60">
                Still needed from you
              </p>
              <div className="mt-2 flex flex-col gap-3">
                {checklist.groups.map((g, gi) => (
                  <div key={gi}>
                    {g.borrower && (
                      <p className="font-heading text-xs font-semibold text-navy/50">{g.borrower}</p>
                    )}
                    <ul className="mt-1 flex flex-col gap-1">
                      {g.names.map((n, ni) => (
                        <li key={ni} className="flex gap-2 font-body text-sm text-navy">
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-navy/40" />
                          <span>{n}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(checklist.received > 0 || (checklist.done > 0 && !allDone)) && (
            <div className="mt-3 flex flex-col gap-1">
              {checklist.received > 0 && (
                <p className="font-body text-sm text-navy/60">
                  {checklist.received === 1
                    ? '1 is in and being looked over'
                    : `${checklist.received} are in and being looked over`}
                </p>
              )}
              {checklist.done > 0 && !allDone && (
                <p className="font-body text-sm text-navy/60">
                  {checklist.done === 1 ? '1 is done' : `${checklist.done} are done`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 font-body text-sm leading-relaxed text-navy/70">
        Your secure upload link comes by email from our document system. It&rsquo;s the safest way to
        send anything, so please use that rather than email attachments.
      </p>
      <p className="mt-2 font-body text-sm leading-relaxed text-navy/70">
        Can&rsquo;t find it? Ask Michael and he&rsquo;ll send it again.
      </p>
    </section>
  )
}

function TeamRow({ member }: { member: TeamMember }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-navy/5 pb-4 last:border-0 last:pb-0">
      <div>
        <p className="font-heading text-[15px] font-bold text-navy">{member.name}</p>
        <p className="font-body text-xs text-navy/50">
          {member.roleLabel}
          {member.licence ? ` · ${member.licence}` : ''}
        </p>
      </div>
      {(member.phone || member.email) && (
        <div className="flex flex-wrap gap-2">
          {member.phone && (
            <a
              href={`tel:${member.phone.replace(/[^+\d]/g, '')}`}
              className="rounded-lg border border-navy/15 px-3 py-1.5 font-body text-xs font-semibold text-navy"
            >
              {member.phone}
            </a>
          )}
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className="rounded-lg border border-navy/15 px-3 py-1.5 font-body text-xs font-semibold text-navy"
            >
              Email
            </a>
          )}
        </div>
      )}
    </li>
  )
}
