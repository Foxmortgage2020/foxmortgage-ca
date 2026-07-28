// Booking engine constants that are values, not secrets, and belong in one place.

/**
 * The origin that goes into a manage link inside an email.
 *
 * It is a CONSTANT rather than an environment variable on purpose: this session
 * is not allowed to provision env vars, and a public site origin is not a secret.
 * `VERCEL_URL` is deliberately not used as the primary, because it names the
 * deployment (a long generated hostname) rather than the custom domain, and a
 * client should never receive a link that looks like a machine wrote it.
 *
 * Local development: an email sent from a dev server still carries the
 * production origin, so a manage link in a locally-triggered mail points at
 * production. That is the right default for a link a client might keep, and the
 * local override below exists so a live test can point somewhere reachable.
 */
export const BOOKING_SITE_ORIGIN =
  process.env.BOOKING_SITE_ORIGIN?.trim() || 'https://foxmortgage.ca'

/** The from and reply-to for client-facing booking mail. */
export const BOOKING_MAIL_FROM = 'Mike Fox <mike@app.foxmortgage.ca>'
export const BOOKING_MAIL_REPLY_TO = 'mfox@foxmortgage.ca'
export const BOOKING_HOST_INBOX = 'mfox@foxmortgage.ca'

/**
 * The reminder lands a day ahead. A booking made INSIDE this window never gets
 * one, because a reminder arriving minutes after a confirmation reads as a fault
 * rather than a courtesy.
 */
export const REMINDER_LEAD_HOURS = 24

/**
 * The reminder job runs hourly and sweeps a window slightly wider than an hour,
 * so a late or skipped run still catches its bookings. `reminder_sent_at` is
 * what makes the overlap safe.
 */
export const REMINDER_WINDOW_FROM_HOURS = 23
export const REMINDER_WINDOW_TO_HOURS = 25

/** How many calendar writes one reconcile pass will attempt. */
export const RECONCILE_BATCH = 25

/** A pending calendar write older than this is called out in the job log. */
export const RECONCILE_STUCK_HOURS = 24

/** The note title prefix for a booking note in Zoho.
 *
 *  IT MUST NOT COLLIDE with the portal-message prefixes the read layer splits
 *  on ('FP Message from ', 'Realtor Message from ', and their General twins).
 *  A booking note is timeline, not a message, and this prefix keeps it there.
 */
export const ZOHO_BOOKING_NOTE_PREFIX = 'Booking: '

/** CASL consent method for someone who ticked the box on the booking form. */
export const CASL_METHOD_EXPRESS = 'Express'
export const CASL_SOURCE_BOOKING = 'Booking page, foxmortgage.ca'
