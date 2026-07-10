// POST /api/admin/impersonate
//
// Gated on portals.view-as (Session 8; admin-only in the shipped
// baseline). Looks up the target partner in Zoho to derive a display name
// and firm, logs the session start to FOXCA (view_as_sessions, narrow
// security-definer function), then sets the `fox_impersonation`
// signed+encrypted cookie via lib/auth.ts. The cookie is httpOnly +
// sameSite=lax + secure-in-production, and is honored by
// lib/auth.ts#getPortalContext only when the requesting user has the
// 'admin' role at request time (defense in depth — cookie alone is never
// enough).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { setImpersonationCookie } from '@/lib/auth'
import { viewAsStart } from '@/lib/people-store'
import { getZohoToken } from '@/lib/zoho'

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

// Zoho record IDs are 18-digit numeric strings. Use a loose >=15 check so we
// don't reject if Zoho ever changes ID length, while still blocking
// "random string" inputs.
const ZOHO_ID_RE = /^\d{15,}$/

type PartnerLookup = {
  id: string
  name: string
  type: string
  firm: undefined
} | null

// Resolves a partner record by ID in Mike's custom `Partners` module. All
// portal partner records (FPs, investors, realtors, lawyers) live there;
// they're differentiated by the `Partner_Type` picklist.
//
// Returns null on 404 / 204 / empty data so the route handler can map that
// to a clean PartnerNotFound 400. Throws on any other non-OK response
// (auth, scope, network) — those are unexpected and surface as a 500 from
// Next.js rather than being silently coerced into PartnerNotFound.
async function lookupPartner(
  partnerId: string,
): Promise<PartnerLookup> {
  const token = await getZohoToken()
  // The Partners module's "Partner Name" field has API name `Name` (not
  // `Partner_Name` — that's the UI label only). Zoho silently drops unknown
  // field names from `?fields=`, so getting this wrong returns the record
  // without the name. Verified against /settings/fields?module=Partners.
  const url = `${ZOHO_API}/Partners/${partnerId}?fields=Name,Partner_Type`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })

  if (res.status === 404 || res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(
      `[admin/impersonate] Zoho Partners lookup failed: status=${res.status} body=${text.slice(0, 500)}`,
    )
    throw new Error(`Zoho Partners lookup failed with status ${res.status}`)
  }

  const data = await res.json()
  const record = data?.data?.[0]
  if (!record) return null

  return {
    id: partnerId,
    name: record.Name ?? partnerId,
    type: record.Partner_Type ?? '',
    firm: undefined,
  }
}

export async function POST(req: Request) {
  // 1. Permission gate (Session 8: portals.view-as, not a role literal).
  const gate = await apiPermission('portals.view-as')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  // 2. Parse + validate body.
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'BadRequest', message: 'Body must be valid JSON.' },
      { status: 400 },
    )
  }
  const { role, partnerId } = (body ?? {}) as {
    role?: unknown
    partnerId?: unknown
  }
  if (
    role !== 'fp' &&
    role !== 'investor' &&
    role !== 'realtor' &&
    role !== 'lawyer' &&
    role !== 'mortgage_agent'
  ) {
    return NextResponse.json(
      { error: 'BadRequest', message: "role must be 'fp', 'investor', 'realtor', 'lawyer', or 'mortgage_agent'." },
      { status: 400 },
    )
  }
  if (typeof partnerId !== 'string' || !ZOHO_ID_RE.test(partnerId)) {
    return NextResponse.json(
      {
        error: 'BadRequest',
        message: 'partnerId must be a numeric Zoho record id (15+ digits).',
      },
      { status: 400 },
    )
  }

  // 3. Look up the partner in Zoho. A null return means 404/empty (mapped to
  // PartnerNotFound 400 below). Any non-OK status from Zoho (auth, scope,
  // network, rate limit) is thrown by the helper and caught here so the
  // client sees a sanitized 503 instead of raw Zoho error text.
  let partner: PartnerLookup
  try {
    partner = await lookupPartner(partnerId)
  } catch (error) {
    console.error('[POST /api/admin/impersonate]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't load this data right now. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
  if (!partner) {
    return NextResponse.json(
      {
        error: 'PartnerNotFound',
        message: 'Could not find partner in Zoho.',
      },
      { status: 400 },
    )
  }

  // 3a. Validate Partner_Type aligns with the requested role. The Partners
  // module mixes Financial Planner / Investor / Realtor / Lawyer / Mortgage
  // Agent in a single module differentiated by Partner_Type. Lawyer was added
  // 2026-05-28 alongside the Lawyer portal; Mortgage Agent 2026-05-29.
  const expectedType =
    role === 'fp' ? 'Financial Planner'
    : role === 'realtor' ? 'Realtor'
    : role === 'lawyer' ? 'Lawyer'
    : role === 'mortgage_agent' ? 'Mortgage Agent'
    : 'Investor'
  if (partner.type !== expectedType) {
    return NextResponse.json(
      {
        error: 'PartnerTypeMismatch',
        message: `This partner is of type ${partner.type || '<unset>'} but you are trying to impersonate them as ${expectedType}.`,
      },
      { status: 400 },
    )
  }

  // 4. Log the session start to FOXCA. Graceful: a store outage never
  // blocks Michael's own tool, but the miss is logged loudly and the
  // session will show as never-ended in the view-as log.
  let logId: string | undefined
  const logged = await viewAsStart({
    viewerClerkId: gate.user.userId,
    viewerEmail: gate.user.email,
    partnerZohoId: partnerId,
    partnerName: partner.name,
    portalRole: role,
  })
  if (logged.configured && logged.ok && typeof logged.data === 'string') {
    logId = logged.data
  } else {
    console.error('[admin/impersonate] view_as_start did not record; session will lack a log row')
  }

  // 5. Set the signed+encrypted cookie. Firm is intentionally undefined for
  // now — the canonical firm source lives elsewhere in Zoho and is out of
  // scope for this build.
  await setImpersonationCookie({
    role,
    partnerId,
    partnerName: partner.name,
    partnerFirm: undefined,
    logId,
  })

  return NextResponse.json({
    ok: true,
    partner: { id: partnerId, name: partner.name, firm: undefined },
  })
}
