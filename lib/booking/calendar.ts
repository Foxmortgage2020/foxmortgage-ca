// The provider-agnostic calendar layer. THREE operations, nothing else:
// getBusy, createEvent, cancelEvent. Every caller in the booking engine talks to
// this interface and never to a vendor SDK, so adding Google is adding one file
// that satisfies this contract — no change to the engine, the routes, or the page.
//
// Session one implements Outlook (lib/booking/outlook.ts) and ships Google as a
// declared stub (lib/booking/google.ts) that reports not connected.
//
// RESULT SHAPES: every method returns a discriminated union and NEVER throws to
// the caller. Availability fails CLOSED on a busy read failure (see
// lib/booking/availability.ts); a write failure is recoverable and leaves the
// booking with calendar_status 'pending_retry' for the reconcile job.

import type { Interval, ProviderId } from '@/lib/booking/types'

export interface CalendarRange {
  startUtc: string
  endUtc: string
}

export type BusyResult =
  | { ok: true; busy: Interval[] }
  | { ok: false; reason: string }

export interface CreateEventInput {
  /** Mailbox / calendar owner. For Outlook this is the UPN. */
  calendarId: string | null
  subject: string
  /** Plain text. Carries the client's phone number, because the agent calls them. */
  body: string
  startUtc: string
  endUtc: string
  location: string | null
}

export type CreateEventResult =
  | { ok: true; eventId: string }
  | {
      ok: false
      reason: string
      /**
       * True when retrying cannot help without a human changing something
       * (a missing permission grant, a disconnected provider). The reconcile job
       * uses this to stop hammering a wall.
       */
      permanent: boolean
    }

export type CancelEventResult = { ok: true } | { ok: false; reason: string }

export interface CalendarProvider {
  readonly id: ProviderId
  /** Human-readable state for the admin surface and the session-one report. */
  capability(): Promise<ProviderCapability>
  getBusy(range: CalendarRange): Promise<BusyResult>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
  cancelEvent(calendarId: string | null, eventId: string): Promise<CancelEventResult>
}

export interface ProviderCapability {
  configured: boolean
  canRead: boolean
  canWrite: boolean
  /** One plain sentence naming the current state. Safe to show an admin. */
  detail: string
}
