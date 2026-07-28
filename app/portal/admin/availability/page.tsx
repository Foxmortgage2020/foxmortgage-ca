// Availability: the admin surface for the native booking engine.
//
// Sessions one to three built the engine and the client-facing pages. Michael's
// hours, his closed days, and his meeting-type settings were seeded by
// migration and could only be changed by writing another one. This page is
// where they become his to change.
//
// PER-AGENT BY DESIGN, Michael-only in practice. Every store function takes an
// agent id, the id is resolved SERVER-SIDE from a config slug, and no agent id
// is ever accepted from the browser. A second host is new rows plus a per-user
// lookup, never a new surface.
//
// The strings here are ADMIN-facing and are professional plain language. The
// one place client wording appears is a meeting type's name and description,
// which a client reads on the public booking page, so those two fields are
// gated in the editor.

import type { Metadata } from 'next'
import { requirePermission } from '@/lib/authz'
import { BOOKING_HOST_SLUG } from '@/config/booking'
import { bookingAgentId } from '@/lib/booking/admin-agent'
import { adminOverview, adminUpcoming, bookingStoreConfigured } from '@/lib/booking/store'
import { isDemoMode } from '@/lib/demo'
import AvailabilityEditor from './AvailabilityEditor'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Availability | Fox Mortgage' }

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-navy">Availability</h1>
        <p className="font-ui mt-1 text-[13px] text-muted">
          When the booking pages may offer a time, and what they offer.
        </p>
      </header>
      {children}
    </div>
  )
}

function Notice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[9px] border border-cool-200 bg-white p-8 text-center">
      <p className="font-heading text-base font-bold text-navy">{title}</p>
      <p className="font-ui mx-auto mt-2 max-w-md text-[13px] text-muted">{detail}</p>
    </div>
  )
}

export default async function AvailabilityPage() {
  await requirePermission('booking.manage')

  if (!bookingStoreConfigured()) {
    return (
      <Shell>
        <Notice
          title="Booking store not connected"
          detail="FOXCA_SUPABASE_URL and FOXCA_SUPABASE_KEY are not both set on this deployment, so hours and meeting types cannot be read or written."
        />
      </Shell>
    )
  }

  const agentId = await bookingAgentId()
  if (!agentId) {
    return (
      <Shell>
        <Notice
          title="No booking host is configured"
          detail={`No booking host row matches the slug "${BOOKING_HOST_SLUG}". A host row is created by migration, not from this page.`}
        />
      </Shell>
    )
  }

  const [overviewRes, upcomingRes] = await Promise.all([
    adminOverview(agentId),
    adminUpcoming(agentId, 50),
  ])

  if (!overviewRes.configured || !overviewRes.ok) {
    return (
      <Shell>
        <Notice
          title="Could not read the booking store"
          detail={
            overviewRes.configured
              ? overviewRes.error
              : 'The booking store is not configured on this deployment.'
          }
        />
      </Shell>
    )
  }

  const overview = overviewRes.data

  return (
    <Shell>
      <AvailabilityEditor
        hostSlug={overview.host?.slug ?? BOOKING_HOST_SLUG}
        hostName={overview.host?.displayName ?? ''}
        timezone={overview.host?.timezone ?? 'America/Toronto'}
        initialHours={overview.hours}
        initialOverrides={overview.overrides}
        initialEventTypes={overview.eventTypes}
        upcoming={upcomingRes.configured && upcomingRes.ok ? upcomingRes.data : []}
        upcomingError={
          upcomingRes.configured && !upcomingRes.ok ? upcomingRes.error : null
        }
        demo={isDemoMode()}
      />
    </Shell>
  )
}
