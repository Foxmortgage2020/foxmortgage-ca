import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import {
  findPartnerByIdAndMagicLinkToken,
  findPartnerByMagicLinkToken,
  type PartnerProfile,
} from '@/lib/zoho'

// POST /api/onboard/request-new-link
//
// Public route — the original (expired) link's params are in the
// body so we can route a Resend notification to Mike with a direct
// link to the Partner's detail page. Always returns 200 on the
// user-visible path, even when the params don't resolve to a known
// partner — we don't want to leak existence to attackers.
//
// Accepts two body shapes:
//   - Path B canonical: { p: string, ref: string }   (partnerId + token)
//   - Legacy fallback:  { ref: string }              (token only)
//
// The Path B path is preferred when both fields are present and
// well-formed; it uses direct getPartner so it's not subject to
// Zoho's /search index lag.
export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const { p, ref } = (body ?? {}) as { p?: unknown; ref?: unknown }

    let partnerName = '(unknown)'
    let partnerEmail = '(unknown)'
    let partnerId: string | null = null

    let partner: PartnerProfile | null = null
    if (
      typeof p === 'string' &&
      /^\d{15,19}$/.test(p) &&
      typeof ref === 'string' &&
      /^[a-f0-9]{64}$/i.test(ref)
    ) {
      // Path B canonical: validate id+token together, immediately consistent.
      try {
        partner = await findPartnerByIdAndMagicLinkToken(p, ref)
      } catch (lookupErr) {
        console.error('[onboard/request-new-link] id+token lookup failed', lookupErr)
      }
    } else if (typeof ref === 'string' && /^[a-f0-9]{64}$/i.test(ref)) {
      // Legacy fallback: token-only lookup via deprecated /search path.
      try {
        partner = await findPartnerByMagicLinkToken(ref)
      } catch (lookupErr) {
        console.error('[onboard/request-new-link] legacy token lookup failed', lookupErr)
      }
    }

    if (partner) {
      partnerName = partner.name ?? partnerName
      partnerEmail = partner.email ?? partnerEmail
      partnerId = partner.id
    }

    const adminLink = partnerId
      ? `${req.nextUrl.origin}/portal/admin/partners/${partnerId}`
      : `${req.nextUrl.origin}/portal/admin/partners`

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
        to: 'mfox@foxmortgage.ca',
        subject: `Expired onboarding link request from ${partnerName}`,
        text:
`${partnerName} (${partnerEmail}) tried to access an expired onboarding link and requested a new one.

Generate a new link from their partner detail page:
${adminLink}`,
      })
    } catch (mailErr) {
      console.error('[onboard/request-new-link] Resend send failed', mailErr)
      // Continue to 200 — the investor sees the same "got it" message
      // either way. Mike can monitor logs / Resend dashboard if
      // deliveries are dropping.
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/onboard/request-new-link]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't process that request right now. Please try again in a moment." },
      { status: 503 },
    )
  }
}
