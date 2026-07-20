// Lender BDM / underwriter contacts — the pure, client-and-server-safe shape
// and the client-side draft validation. A leaf module (no imports) so both
// lib/gates.ts (the gate helpers) and lib/demo-fixtures.ts (the canned demo
// set) read the type from here without a cycle.
//
// The card is exactly what the workbench (fox-underwriting W1, migrations
// 0051+0052) serves for an approved contact. The phone is stored as two fields
// — `phone` (pure E.164) and `phone_ext` (digits only) — and the workbench
// ALSO pre-builds `tel` (an RFC 3966 href, with ";ext=" only when an ext
// exists) and `phone_display` (the human label). The portal renders those
// pre-built fields and never re-derives them.

export interface LenderContactCard {
  id: string
  lender_slug: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  phone_ext: string | null
  // Pre-built by the workbench: the click-to-call href and its human label.
  tel: string | null
  phone_display: string | null
  note: string | null
  // 'manual' (hand-entered, W1) or 'extracted' (from a lender document, W2).
  source: 'manual' | 'extracted'
  claim_text: string | null
  created_at: string | null
  updated_at: string | null
  // Populated by W2's confirmation loop; always null today.
  last_confirmed: string | null
}

// The fields a human enters when adding or editing a contact. The workbench
// normalizes the phone to E.164 + extension and is authoritative on email
// format, bounds, and duplicates; the extension is a separate field.
export interface ContactDraft {
  name: string
  title?: string
  email?: string
  phone?: string
  extension?: string
  note?: string
}

function boundedString(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t ? t.slice(0, max) : undefined
}

// Shape an untrusted request body into a ContactDraft (trim, bound, drop
// non-strings). The route runs this before validateContactDraft; the workbench
// re-validates everything server-side. Bounds mirror the workbench schema.
export function shapeContactDraft(raw: unknown): ContactDraft {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    name: boundedString(r.name, 200) ?? '',
    title: boundedString(r.title, 160),
    email: boundedString(r.email, 200),
    phone: boundedString(r.phone, 40),
    extension: boundedString(r.extension, 12),
    note: boundedString(r.note, 1000),
  }
}

// Mirror the workbench's minimum junk refusal client-side (the server stays
// authoritative): a contact needs a name and at least one way to reach them.
// Returns a plain-words reason, or null when the draft is good enough to send.
export function validateContactDraft(draft: ContactDraft): string | null {
  if (!draft.name.trim()) return 'A contact needs a name.'
  if (!draft.phone?.trim() && !draft.email?.trim()) return 'Add a phone number or an email.'
  return null
}
