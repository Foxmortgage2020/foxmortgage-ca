// ─── Single source of truth for portal support contact details ───────────────
// Every role's Support page (realtor / lawyer / fp / investor / generic) reads
// Michael's phone, email, and booking link from here — so there is exactly one
// place to change them. When a Zoho Bookings URL is provisioned, set `bookingUrl`
// below and every "Book a Call" card picks it up with no other code change.

export interface ContactInfo {
  phone: { display: string; href: string }
  email: { address: string; href: string }
  /**
   * Public booking link (Zoho Bookings). Set 2026-07-18 (B7-P). When empty,
   * Support pages route "Book a Call" to the Messages inbox rather than
   * dead-linking; when set, they deep-link to it in a new tab.
   */
  bookingUrl: string
  /**
   * Public Google review link. A NAMED PLACEHOLDER: empty until Michael
   * supplies the value. Nothing renders a placeholder to a client — every
   * surface that uses this stays ABSENT (truthiness-gated) until it is set.
   */
  reviewUrl: string
}

export const CONTACT: ContactInfo = {
  // The one place the Fox Mortgage phone number lives. Set 2026-07-17 to
  // 226-770-8880 per Michael's confirmation (was 519-226-8880). A guard test
  // (tests/contact-number.test.ts) forbids this number as a literal anywhere
  // else, so it can never drift out of sync again.
  phone: { display: '226-770-8880', href: 'tel:+12267708880' },
  email: { address: 'mfox@foxmortgage.ca', href: 'mailto:mfox@foxmortgage.ca' },
  bookingUrl: 'https://foxmortgage.zohobookings.com/4936582000000975003',
  // Placeholder: set to Michael's Google review link when available. Until then
  // it stays empty and no surface renders it.
  reviewUrl: '',
}
