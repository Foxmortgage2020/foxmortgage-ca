// ─── Single source of truth for portal support contact details ───────────────
// Every role's Support page (realtor / lawyer / fp / investor / generic) reads
// Michael's phone, email, and booking link from here — so there is exactly one
// place to change them. When a Zoho Bookings URL is provisioned, set `bookingUrl`
// below and every "Book a Call" card picks it up with no other code change.

export interface ContactInfo {
  phone: { display: string; href: string }
  email: { address: string; href: string }
  /**
   * Public booking link (e.g. Zoho Bookings). Empty string until provisioned.
   * When empty, Support pages route "Book a Call" to the Messages inbox rather
   * than dead-linking; when set, they deep-link to it in a new tab.
   */
  bookingUrl: string
}

export const CONTACT: ContactInfo = {
  // The one place the Fox Mortgage phone number lives. Set 2026-07-17 to
  // 226-770-8880 per Michael's confirmation (was 519-226-8880). A guard test
  // (tests/contact-number.test.ts) forbids this number as a literal anywhere
  // else, so it can never drift out of sync again.
  phone: { display: '226-770-8880', href: 'tel:+12267708880' },
  email: { address: 'mfox@foxmortgage.ca', href: 'mailto:mfox@foxmortgage.ca' },
  bookingUrl: '',
}
