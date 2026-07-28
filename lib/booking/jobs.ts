// The two scheduled booking jobs. SERVER-ONLY, machine-triggered.
//
//   1. REMINDERS — the day-ahead nudge, with the guard that a booking made
//      inside the lead window never gets one.
//   2. RECONCILE — drain the pending_retry calendar queue, which is what makes
//      a provider outage (or a missing permission) recoverable instead of
//      permanent.
//
// BOTH RETURN A STRUCTURED LOG rather than printing and forgetting. The n8n
// workflow keeps the response, so a run that quietly did nothing is visible as
// a run that did nothing, and a booking stuck past the threshold is NAMED in the
// output rather than merely counted.
//
// NEITHER RUNS IN DEMO. They assert it and refuse, rather than no-opping their
// stamps silently while appearing to work (the demo-guard asymmetry a reconcile
// job would otherwise inherit from the store).

import { isDemoMode } from '@/lib/demo'
import {
  RECONCILE_BATCH,
  RECONCILE_STUCK_HOURS,
  REMINDER_LEAD_HOURS,
  REMINDER_WINDOW_FROM_HOURS,
  REMINDER_WINDOW_TO_HOURS,
} from '@/config/booking'
import {
  claimStuckAlert,
  dueReminders,
  markCalendarAttempt,
  markSent,
  pendingCalendarBookings,
  type PendingCalendarRow,
} from '@/lib/booking/store'
import { factsFrom, sendReminderMail, sendStuckCalendarAlert } from '@/lib/booking/email'
import { buildCalendarDescription } from '@/lib/booking/email-copy'
import { providerForAgent } from '@/lib/booking/engine'

export interface JobLog {
  ok: boolean
  ran: string
  considered: number
  succeeded: number
  failed: number
  skipped: number
  /** Bookings that have been waiting too long. Named, not just counted. */
  stuck: Array<{ id: string; ageHours: number; detail: string | null; alerted: boolean }>
  notes: string[]
}

function emptyLog(name: string): JobLog {
  return { ok: true, ran: name, considered: 0, succeeded: 0, failed: 0, skipped: 0, stuck: [], notes: [] }
}

// ─── Reminders ───────────────────────────────────────────────────────────────

/**
 * Send the day-ahead reminder.
 *
 * THE WINDOW is deliberately wider than the hourly cadence (23h to 25h out), so
 * a late or missed run still catches its bookings. `reminder_sent_at` is what
 * makes the overlap safe: a booking already reminded is never selected again.
 *
 * THE GUARD is in SQL, not here: booking_due_reminders excludes any booking
 * created less than REMINDER_LEAD_HOURS before it starts. Someone who books
 * tomorrow morning at midnight tonight gets a confirmation and nothing else,
 * rather than a reminder arriving seconds later.
 */
export async function runReminderJob(now: Date = new Date()): Promise<JobLog> {
  const log = emptyLog('reminders')
  if (isDemoMode()) {
    log.ok = false
    log.notes.push('demo mode, refused')
    return log
  }

  const fromIso = new Date(now.getTime() + REMINDER_WINDOW_FROM_HOURS * 3_600_000).toISOString()
  const toIso = new Date(now.getTime() + REMINDER_WINDOW_TO_HOURS * 3_600_000).toISOString()

  let due
  try {
    due = await dueReminders({ fromIso, toIso, minLeadHours: REMINDER_LEAD_HOURS, limit: 100 })
  } catch (err) {
    log.ok = false
    log.notes.push(`store unreachable: ${err instanceof Error ? err.message : 'unknown'}`)
    return log
  }
  if (!due.configured) {
    log.ok = false
    log.notes.push('booking store is not configured')
    return log
  }
  if (!due.ok) {
    log.ok = false
    log.notes.push(due.error)
    return log
  }

  log.considered = due.data.length
  for (const row of due.data) {
    const facts = factsFrom({
      clientName: row.clientName,
      clientEmail: row.clientEmail,
      clientPhoneDisplay: displayPhone(row.clientPhone),
      clientTimezone: row.clientTimezone,
      hostName: row.hostDisplayName,
      hostTimezone: row.hostTimezone,
      eventName: row.eventTypeName ?? 'call',
      durationMinutes: row.durationMinutes,
      startUtc: row.startsAt,
      endUtc: row.endsAt,
    })
    const sent = await sendReminderMail({ bookingId: row.id, facts })
    if (sent) {
      await markSent(row.id, 'reminder')
      log.succeeded += 1
    } else {
      // Deliberately NOT stamped. An unsent reminder stays due, so the next
      // hourly run tries again while the booking is still in the window.
      log.failed += 1
      log.notes.push(`reminder not sent for ${row.id}`)
    }
  }
  return log
}

// ─── Calendar reconcile ──────────────────────────────────────────────────────

/**
 * Retry the calendar writes that did not land.
 *
 * This is the loop that makes session one's read-only period recoverable: every
 * booking taken while the app could not write to the calendar sits in
 * pending_retry, and the first run after the permission lands writes them all.
 *
 * Rows already marked permanently blocked are skipped by the query, so the job
 * does not hammer a wall. A row past RECONCILE_STUCK_HOURS is named in `stuck`
 * whether or not this run fixed it, because "it has been failing for a day" is
 * the thing a person needs to see.
 */
export async function runReconcileJob(now: Date = new Date()): Promise<JobLog> {
  const log = emptyLog('calendar-reconcile')
  if (isDemoMode()) {
    log.ok = false
    log.notes.push('demo mode, refused')
    return log
  }

  let pending
  try {
    pending = await pendingCalendarBookings(RECONCILE_BATCH)
  } catch (err) {
    log.ok = false
    log.notes.push(`store unreachable: ${err instanceof Error ? err.message : 'unknown'}`)
    return log
  }
  if (!pending.configured) {
    log.ok = false
    log.notes.push('booking store is not configured')
    return log
  }
  if (!pending.ok) {
    log.ok = false
    log.notes.push(pending.error)
    return log
  }

  log.considered = pending.data.length

  let alerted = 0
  for (const row of pending.data) {
    // THE ALERT COMES BEFORE THE RETRY, deliberately. A row that has been stuck
    // a day is worth telling Michael about whether or not this particular run
    // happens to fix it, and claiming first means a run that crashes halfway
    // still leaves the alert claimed rather than sending twice on the next pass.
    //
    // The claim is atomic in the database, so the send happens once per booking
    // per Toronto day no matter how many runs overlap. A store that cannot be
    // reached returns false and nothing is sent, which is the safe direction:
    // the stuck row is still NAMED in this log every hour.
    if (row.ageHours >= RECONCILE_STUCK_HOURS) {
      const claimed = await claimStuckAlert({
        id: row.id,
        ageHours: row.ageHours,
        detail: row.calendarDetail,
      })
      let sent = false
      if (claimed) {
        sent = await sendStuckCalendarAlert({
          bookingId: row.id,
          clientName: row.clientName,
          eventName: row.eventTypeName ?? 'Call',
          startUtc: row.startsAt,
          hostTimezone: row.hostTimezone,
          ageHours: row.ageHours,
          detail: row.calendarDetail,
          attempts: row.calendarAttempts,
        })
        if (sent) alerted += 1
        else log.notes.push(`stuck alert for ${row.id} could not be sent`)
      }
      log.stuck.push({
        id: row.id,
        ageHours: row.ageHours,
        detail: row.calendarDetail,
        alerted: sent,
      })
    }

    const provider = providerForAgent(row.agentId)
    const write = await provider.createEvent({
      calendarId: null,
      subject: `${row.eventTypeName ?? 'Call'} with ${row.clientName}`,
      body: calendarBodyFor(row),
      startUtc: row.startsAt,
      endUtc: row.endsAt,
      location: `Phone call to ${displayPhone(row.clientPhone)}`,
    })

    if (write.ok) {
      await markCalendarAttempt({
        id: row.id,
        calendarEventId: write.eventId,
        calendarStatus: 'written',
        detail: null,
        permanent: false,
      })
      log.succeeded += 1
    } else {
      await markCalendarAttempt({
        id: row.id,
        calendarEventId: null,
        calendarStatus: 'pending_retry',
        detail: write.reason.slice(0, 300),
        permanent: write.permanent,
      })
      if (write.permanent) {
        log.skipped += 1
        log.notes.push(`${row.id} is permanently blocked: ${write.reason}`)
      } else {
        log.failed += 1
      }
    }
  }

  if (log.stuck.length > 0) {
    log.notes.push(
      `${log.stuck.length} booking(s) have been waiting over ${RECONCILE_STUCK_HOURS} hours for a calendar entry, ${alerted} emailed this run`,
    )
  }
  return log
}

// ─── Shared ──────────────────────────────────────────────────────────────────

function displayPhone(stored: string): string {
  const digits = stored.replace(/\D+/g, '').slice(-10)
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : stored
}

function calendarBodyFor(row: PendingCalendarRow): string {
  const facts = factsFrom({
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    clientPhoneDisplay: displayPhone(row.clientPhone),
    clientTimezone: row.clientTimezone,
    hostName: row.hostDisplayName,
    hostTimezone: row.hostTimezone,
    eventName: row.eventTypeName ?? 'Call',
    durationMinutes: row.durationMinutes,
    startUtc: row.startsAt,
    endUtc: row.endsAt,
  })
  return buildCalendarDescription(facts, {
    notes: row.notes,
    answers: row.intakeAnswers,
    smsConsent: row.smsConsent,
  })
}
