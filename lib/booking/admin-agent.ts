// Which agent the Availability page is acting for. SERVER-ONLY.
//
// One function, because the answer has to be the same in the page and in all
// four write routes. The routes cannot take the agent id from the request body:
// a client-supplied agent id on an admin write is exactly how one host edits
// another host's calendar. It is resolved server-side, every time, from a
// config slug.
//
// Cached for the life of the process. The mapping from slug to agent id changes
// when a host row is created, which is a migration, not a runtime event.

import { BOOKING_HOST_SLUG } from '@/config/booking'
import { agentIdForSlug } from '@/lib/booking/store'

let cached: string | null = null

export async function bookingAgentId(): Promise<string | null> {
  if (cached) return cached
  const res = await agentIdForSlug(BOOKING_HOST_SLUG)
  if (!res.configured || !res.ok || !res.data) return null
  cached = res.data
  return cached
}

/** Test seam. Never called by application code. */
export function resetBookingAgentCache(): void {
  cached = null
}
