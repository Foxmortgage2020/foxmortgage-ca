// Google Calendar provider — A DECLARED STUB. Session one ships Outlook; this
// file exists so the interface has two implementations from day one and adding
// Google is filling in three methods, not reshaping the engine.
//
// Every method reports not connected. Nothing here pretends to work, and
// `capability().configured` is false, so the admin surface and the report both
// state the truth rather than implying a half-built integration.
//
// ─── READ THIS BEFORE PLANNING A GOOGLE LAUNCH DATE ──────────────────────────
//
// GOOGLE OAUTH VERIFICATION IS A LEAD TIME, NOT A TASK. Reading a user's calendar
// uses https://www.googleapis.com/auth/calendar (or .../calendar.events), which
// Google classifies as a SENSITIVE or RESTRICTED scope. An app requesting one in
// production must pass OAuth app verification, and that review has historically
// taken SEVERAL WEEKS from submission, longer when the reviewer comes back with
// questions. It also requires, at minimum:
//
//   * a verified domain the OAuth consent screen is registered against,
//   * a published privacy policy URL that names the Google data used,
//   * a homepage that explains the integration in the app's own words,
//   * a demonstration video walking the full consent-to-use flow,
//   * a security questionnaire, and for restricted scopes a third-party security
//     assessment that carries its own cost and calendar.
//
// Until verification passes, an unverified app is capped at 100 test users and
// shows an unverified-app warning screen. That is survivable for the practice's
// own account and NOT survivable for a client-facing booking page.
//
// THE PRACTICAL CONSEQUENCE: if agent two runs on Google Workspace, START THE
// VERIFICATION SUBMISSION AT LEAST A FULL QUARTER BEFORE THEY NEED TO TAKE
// BOOKINGS. Do not discover this in the week they onboard. Building the code is
// days; getting permission to run it is months.
//
// A Google Workspace tenant can alternatively use a domain-wide-delegated service
// account, which skips public verification entirely but only works for mailboxes
// inside that one Workspace tenant. That is the cheaper path when the host is an
// employee of a Workspace org, and the harder path when they are not.

import type {
  BusyResult,
  CalendarProvider,
  CalendarRange,
  CancelEventResult,
  CreateEventInput,
  CreateEventResult,
  ProviderCapability,
} from '@/lib/booking/calendar'

const NOT_CONNECTED = 'Google Calendar is not connected yet.'

export const googleProvider: CalendarProvider = {
  id: 'google',

  async capability(): Promise<ProviderCapability> {
    return {
      configured: false,
      canRead: false,
      canWrite: false,
      detail: NOT_CONNECTED,
    }
  },

  async getBusy(_range: CalendarRange): Promise<BusyResult> {
    return { ok: false, reason: 'google_not_connected' }
  },

  async createEvent(_input: CreateEventInput): Promise<CreateEventResult> {
    return { ok: false, reason: NOT_CONNECTED, permanent: true }
  },

  async cancelEvent(_calendarId: string | null, _eventId: string): Promise<CancelEventResult> {
    return { ok: false, reason: NOT_CONNECTED }
  },
}
