// The Client tab (handoff 45) — contact detail for EVERY client on the file.
//
// Not the primary borrower alone: a co-applicant is a person you have to reach
// too, and a tab that showed only the first name on the file would send you
// back to the CRM for the second.
//
// Read from `rec.clients` through `rec.deal_clients`, on the record layer, via
// portal_readonly. Coverage is uneven and honest (verified live): email and
// phone on 137 of 139 links, date of birth on 136, work phone on 40, marital
// status on 44, dependents on 39. Each field says "Not specified" on its own
// rather than the person being hidden for missing one.
//
// 34 live deals carry no client link at all. Those get the honest empty state.

import { NOT_SPECIFIED, fieldValue, fmtDateWords, humanise } from '@/lib/beta-file'
import { roleLabel } from '@/lib/phase-model'
import type { RecClientDetail } from '@/lib/underwriting'

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

export default function FileClient({ clients }: { clients: RecClientDetail[] }) {
  if (clients.length === 0) {
    return (
      <section
        data-testid="beta-file-client-empty"
        className="mt-4 rounded-[9px] border border-cool-200 bg-white p-5"
      >
        <h2 className="font-heading text-sm font-semibold text-navy">Client</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
          The people on this file and how to reach them.
        </p>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
          Nobody is linked to this file in the record layer yet, so there is no contact detail to
          show.
        </p>
      </section>
    )
  }

  // Primary applicant first, then everyone else in the order the record gives.
  const ordered = [...clients].sort(
    (a, b) => (a.role === 'primary_applicant' ? 0 : 1) - (b.role === 'primary_applicant' ? 0 : 1),
  )

  return (
    <div className="mt-4 space-y-3" data-testid="beta-file-client">
      {ordered.map((c, i) => (
        <section
          key={c.clientId ?? `${c.dealId}-${i}`}
          className="rounded-[9px] border border-cool-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h2 className="font-heading text-sm font-semibold text-navy">
              {fieldValue(c.fullName) ??
                fieldValue([c.firstName, c.lastName].filter(Boolean).join(' ')) ??
                'Name not recorded'}
            </h2>
            <span className="text-[10px] uppercase tracking-wide text-cool-500">
              {roleLabel(c.role)}
            </span>
            {c.isLead && (
              <span className="rounded-full border border-cool-300 px-1.5 text-[10px] text-cool-600">
                lead
              </span>
            )}
          </div>
          <dl className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Email" value={fieldValue(c.email)} />
            <Field label="Phone" value={fieldValue(c.phone)} />
            <Field label="Work phone" value={fieldValue(c.workPhone)} />
            <Field label="Date of birth" value={fmtDateWords(c.dateOfBirth)} />
            <Field label="Marital status" value={humanise(c.maritalStatus)} />
            <Field
              label="Dependents"
              // Zero dependents is a real answer, not an absent one.
              value={fieldValue(c.dependents, { zeroIsReal: true })}
            />
            <Field label="Preferred language" value={humanise(c.preferredLanguage)} />
          </dl>
        </section>
      ))}
    </div>
  )
}
