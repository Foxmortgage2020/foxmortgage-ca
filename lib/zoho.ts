// Server-side only — never import in client components
// Wire up by adding env vars to Vercel:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN
//   ZOHO_ORG_ID

import { timingSafeEqual } from 'crypto'
import {
  opportunitiesCache,
  fpMessagesCache,
  lawyerMessagesCache,
  realtorMessagesCache,
  partnersCache,
  adminDashboardCache,
  getDocumentHints,
  pruneDocumentHints,
  rememberMagicLink,
  forgetMagicLink,
  lookupMagicLink,
} from '@/lib/cache'

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

// ─── Token Management ─────────────────────────────────────────────────────
// Cached in module scope — Zoho's token endpoint rate-limits before the data
// endpoints do, so refreshing on every call is the fastest way to surface
// "Access Denied / too many requests" errors to users. Pattern mirrors
// lib/zoho-creator.ts. Inflight-promise singleton prevents a thundering herd
// of concurrent refreshes when the cache expires.

let _crmToken: string | null = null
let _crmTokenExpiry = 0
let _crmTokenInflight: Promise<string> | null = null

async function refreshZohoToken(): Promise<string> {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN
  const clientId = process.env.ZOHO_CLIENT_ID
  const clientSecret = process.env.ZOHO_CLIENT_SECRET
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      'Zoho CRM env vars missing on this Vercel project. Required: ' +
      'ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN',
    )
  }
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Zoho token error: ${JSON.stringify(data)}`)
  _crmToken = data.access_token as string
  // Cache for 55 min; tokens are valid 60 min. Refresh 60s before expiry so a
  // call right at the boundary doesn't race the server-side invalidation.
  _crmTokenExpiry = Date.now() + 55 * 60 * 1000
  return _crmToken
}

export async function getZohoToken(): Promise<string> {
  if (_crmToken && Date.now() < _crmTokenExpiry - 60_000) return _crmToken
  if (_crmTokenInflight) return _crmTokenInflight
  _crmTokenInflight = refreshZohoToken().finally(() => {
    _crmTokenInflight = null
  })
  return _crmTokenInflight
}

// ─── Lead Creation ────────────────────────────────────────────────────────

export interface ZohoLeadPayload {
  Last_Name: string
  Email: string
  Phone?: string
  Lead_Source?: string
  Description?: string
  Tag?: string[]
}

export async function createZohoLead(payload: ZohoLeadPayload) {
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Leads`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [payload] }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Zoho error: ${JSON.stringify(data)}`)
  return data
}

// ─── Investor Portal — CRM API calls ──────────────────────────────────────

const DEAL_FIELDS = [
  'Deal_Name', 'Amount', 'Investor_Amount', 'Investor_Rate', 'Investor_Name',
  'Deal_Status_Investor', 'Investor_Status', 'Investor_Payout_Date',
  'Renewal_In_Progress', 'Mortgage_Type', 'Mortgage_Rate', 'Payment_Amount',
  'Payment_Frequency', 'Street', 'City', 'Province', 'Purchase_Price_Value',
  'Maturity_Date', 'Stage', 'Rate_Type', 'Term_Type', 'Exit_Strategy',
  'Lender_Notes', 'First_Payment_Date', 'Total_Loan_Amount', 'LTV',
  'Closing_Date', 'Term_Years', 'Amortization_Years', 'Zoning',
  'Construction_Type', 'Transaction_Type', 'Contact_Name', 'Lender_Fee',
].join(',')

// ─── Partner Profile ──────────────────────────────────────────────────────

// Fields read by the investor Profile page. Address fields live as
// flat columns on Partners (Street, City, Province, Postal_Code) — there
// is no Mailing_ prefix on this module. Verified via getFields on the
// Partners module.
const PARTNER_PROFILE_FIELDS = [
  'Name', 'Preferred_Name', 'Email', 'Phone', 'Mobile',
  'Street', 'City', 'Province', 'Postal_Code',
  'Partner_Type', 'Partner_Status',
  'Date_of_Birth', 'Residency_Status', 'Entity_Type',
  'Risk_Profile', 'Investor_Preferences',
  'Onboarding_Stage', 'Last_Onboarding_Step',
  'Magic_Link_Token', 'Magic_Link_Expires_At', 'Magic_Link_Used_At',
].join(',')

export interface PartnerProfile {
  id: string
  name: string | null
  preferredName: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  street: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  partnerType: string | null
  partnerStatus: string | null
  dateOfBirth: string | null         // ISO yyyy-MM-dd from Zoho
  residencyStatus: string | null
  entityType: string | null
  riskProfile: string | null
  investorPreferences: string | null
  onboardingStage: string | null
  lastOnboardingStep: string | null
  magicLinkToken: string | null
  magicLinkExpiresAt: string | null  // ISO datetime from Zoho
  magicLinkUsedAt: string | null
}

function normalizePartnerProfile(r: any): PartnerProfile {
  return {
    id: r.id,
    name: r.Name ?? null,
    preferredName: r.Preferred_Name ?? null,
    email: r.Email ?? null,
    phone: r.Phone ?? null,
    mobile: r.Mobile ?? null,
    street: r.Street ?? null,
    city: r.City ?? null,
    province: r.Province ?? null,
    postalCode: r.Postal_Code ?? null,
    partnerType: r.Partner_Type ?? null,
    partnerStatus: r.Partner_Status ?? null,
    dateOfBirth: r.Date_of_Birth ?? null,
    residencyStatus: r.Residency_Status ?? null,
    entityType: r.Entity_Type ?? null,
    riskProfile: r.Risk_Profile ?? null,
    investorPreferences: r.Investor_Preferences ?? null,
    onboardingStage: r.Onboarding_Stage ?? null,
    lastOnboardingStep: r.Last_Onboarding_Step ?? null,
    magicLinkToken: r.Magic_Link_Token ?? null,
    magicLinkExpiresAt: r.Magic_Link_Expires_At ?? null,
    magicLinkUsedAt: r.Magic_Link_Used_At ?? null,
  }
}

// ─── Partner list (admin) ─────────────────────────────────────────────────

// Slim field list for the admin partners list table — name, contact,
// type, last-activity. Avoid pulling the heavier profile fields like
// Investor_Preferences here; the detail page re-fetches via getPartner.
const PARTNER_LIST_FIELDS = [
  'Name', 'Email', 'Phone', 'Mobile', 'City', 'Province',
  'Partner_Type', 'Partner_Status', 'Modified_Time',
].join(',')

export interface PartnerListItem {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  province: string | null
  partnerType: string | null
  partnerStatus: string | null
  modifiedTime: string | null
}

function normalizePartnerListItem(r: any): PartnerListItem {
  return {
    id: r.id,
    name: r.Name ?? null,
    email: r.Email ?? null,
    phone: r.Mobile ?? r.Phone ?? null,
    city: r.City ?? null,
    province: r.Province ?? null,
    partnerType: r.Partner_Type ?? null,
    partnerStatus: r.Partner_Status ?? null,
    modifiedTime: r.Modified_Time ?? null,
  }
}

/**
 * Returns every Partner record. Pages through Zoho's 200-per-page max
 * until `more_records` is false. Cached for 2 min under a single key
 * (the admin list is the only consumer right now).
 *
 * Returns [] if the org has no Partner records.
 */
export async function listAllPartners(): Promise<PartnerListItem[]> {
  const cacheKey = 'all'
  const cached = partnersCache.get(cacheKey) as PartnerListItem[] | undefined
  if (cached !== undefined) return cached

  const token = await getZohoToken()
  const all: PartnerListItem[] = []
  let page = 1
  // Hard cap on page iterations as a safety net — even at 200/page that
  // covers 4,000 partners, which is well above any realistic count.
  while (page <= 20) {
    const url = `${ZOHO_API}/Partners?fields=${PARTNER_LIST_FIELDS}&per_page=200&page=${page}&sort_by=Modified_Time&sort_order=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[zoho] listAllPartners error:', res.status, text.substring(0, 300))
      throw new Error(`Zoho Partners list failed with status ${res.status}`)
    }
    const data = await res.json()
    const rows = (data?.data ?? []).map(normalizePartnerListItem)
    all.push(...rows)
    const moreRecords = data?.info?.more_records === true
    if (!moreRecords) break
    page += 1
  }

  partnersCache.set(cacheKey, all)
  return all
}

/**
 * Returns every Partner_Documents record (slim shape). Used by the
 * admin partners list to count documents per partner without N+1.
 * Cached separately from the partners list so we can invalidate them
 * independently if needed.
 */
export async function listAllPartnerDocuments(): Promise<PartnerDocument[]> {
  const cacheKey = 'docs:all'
  const cached = partnersCache.get(cacheKey) as PartnerDocument[] | undefined
  if (cached !== undefined) return cached

  const token = await getZohoToken()
  const all: PartnerDocument[] = []
  let page = 1
  while (page <= 20) {
    const url = `${ZOHO_API}/Partner_Documents?fields=${PARTNER_DOCUMENT_FIELDS}&per_page=200&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[zoho] listAllPartnerDocuments error:', res.status, text.substring(0, 300))
      throw new Error(`Zoho Partner_Documents list failed with status ${res.status}`)
    }
    const data = await res.json()
    const rows = (data?.data ?? []).map(normalizePartnerDocument)
    all.push(...rows)
    if (data?.info?.more_records !== true) break
    page += 1
  }

  partnersCache.set(cacheKey, all)
  return all
}

/**
 * Fetch every Deal where this partner is the Investor_Name. Same
 * shape and field list as the investor positions endpoint — the admin
 * detail page is just viewing one investor's holdings.
 */
export async function getDealsByPartner(partnerId: string): Promise<any[]> {
  return getInvestorPositions(partnerId)
}

// ─── Partner_Documents (custom module) ────────────────────────────────────

// Field list for the document list view. We don't fetch File_URL because the
// download flow re-fetches the attachment list directly from Zoho's
// Attachments API — File_URL is documentation/traceability only.
const PARTNER_DOCUMENT_FIELDS = [
  'Name', 'Document_Type', 'Document_Status', 'Uploaded_Date',
  'Expiry_Date', 'Partner', 'Reviewer_Notes',
].join(',')

export interface PartnerDocument {
  id: string
  name: string
  documentType: string | null
  documentStatus: string | null
  uploadedDate: string | null
  expiryDate: string | null
  partnerId: string | null
  reviewerNotes: string | null
}

function normalizePartnerDocument(r: any): PartnerDocument {
  // Partner is a lookup field — Zoho returns it as { id, name } object on read.
  const partnerRef = r.Partner
  return {
    id: r.id,
    name: r.Name ?? '',
    documentType: r.Document_Type ?? null,
    documentStatus: r.Document_Status ?? null,
    uploadedDate: r.Uploaded_Date ?? null,
    expiryDate: r.Expiry_Date ?? null,
    partnerId: typeof partnerRef === 'object' && partnerRef ? (partnerRef.id ?? null) : null,
    reviewerNotes: r.Reviewer_Notes ?? null,
  }
}

// Internal: just the search half of getPartnerDocuments. Split out so
// the public function can run search + hint fetches in parallel.
async function searchPartnerDocuments(
  partnerId: string,
  statuses?: string[],
): Promise<PartnerDocument[]> {
  const token = await getZohoToken()
  const partnerClause = `(Partner.id:equals:${partnerId})`
  let criteria = partnerClause
  if (statuses && statuses.length > 0) {
    const statusClauses = statuses.map(s => `(Document_Status:equals:${s})`).join('or')
    criteria = `${partnerClause}and(${statusClauses})`
  }
  const url = `${ZOHO_API}/Partner_Documents/search?criteria=${encodeURIComponent(criteria)}&fields=${PARTNER_DOCUMENT_FIELDS}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204) return []
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] searchPartnerDocuments error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho Partner_Documents search failed with status ${res.status}`)
  }
  const data = await res.json()
  return (data?.data ?? []).map(normalizePartnerDocument)
}

/**
 * List Partner_Documents records for a single partner. Optional status
 * filter narrows the result to the investor-visible subset (Approved /
 * Submitted / Expired) — admins fetch unfiltered.
 *
 * Read-after-write: Zoho's custom-module search index has 1-5 min
 * latency on freshly created records, so this function additionally
 * fetches any cached hint ids (records created in the last 5 min on
 * this Vercel instance) by direct id and merges them in. Direct id
 * fetches have immediate consistency. Once an id starts showing up
 * in search results the hint is pruned so the cache doesn't drift.
 */
export async function getPartnerDocuments(
  partnerId: string,
  statuses?: string[],
): Promise<PartnerDocument[]> {
  const hintIds = getDocumentHints(partnerId)

  // Run the search + hint-by-id fetches in parallel. A failure on any
  // single hint id (e.g. record deleted in Zoho between hint and fetch)
  // is treated as "no record" rather than poisoning the whole list.
  const [searchResults, hintFetches] = await Promise.all([
    searchPartnerDocuments(partnerId, statuses),
    Promise.all(
      hintIds.map(id =>
        getPartnerDocument(id).catch(err => {
          console.error('[zoho] hint fetch failed for document', id, err)
          return null
        }),
      ),
    ),
  ])

  const hintResults = hintFetches.filter((d): d is PartnerDocument => d !== null)

  // Filter hint results to match the same status filter the caller
  // requested. Admin uploads default to Approved so the investor-view
  // statuses [Approved, Submitted, Expired] is a passthrough in
  // practice — this branch matters if an admin ever uploads a record
  // in Pending status (then the investor read still hides it).
  const filteredHints = statuses && statuses.length > 0
    ? hintResults.filter(d => d.documentStatus !== null && statuses.includes(d.documentStatus))
    : hintResults

  // Merge + dedupe by id. Search results win on conflict (canonical
  // post-indexing shape).
  const searchIds = new Set(searchResults.map(d => d.id))
  const merged = [
    ...searchResults,
    ...filteredHints.filter(d => !searchIds.has(d.id)),
  ]

  // Prune any hints that the search index has now caught up to. Skips
  // the work entirely if there were no hints in the first place.
  if (hintIds.length > 0) {
    const resolved = hintIds.filter(id => searchIds.has(id))
    if (resolved.length > 0) pruneDocumentHints(partnerId, resolved)
  }

  return merged
}

/**
 * Fetch a single Partner_Documents record by id. Returns null on 404/204
 * so the download route can map to a clean 404.
 */
export async function getPartnerDocument(documentId: string): Promise<PartnerDocument | null> {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/Partner_Documents/${documentId}?fields=${PARTNER_DOCUMENT_FIELDS}`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 404 || res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] getPartnerDocument error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho Partner_Documents lookup failed with status ${res.status}`)
  }
  const data = await res.json()
  const record = data?.data?.[0]
  if (!record) return null
  return normalizePartnerDocument(record)
}

export interface CreatePartnerDocumentInput {
  name: string                  // Display label, e.g. "KYC - 2026-05-14"
  partnerId: string
  documentType: string          // Picklist value
  documentStatus?: string       // Picklist; defaults to "Approved" on admin upload
  uploadedDate?: string         // ISO yyyy-MM-dd; defaults to today
  expiryDate?: string | null
  reviewerNotes?: string | null
  fileUrl?: string | null
}

/**
 * Create a Partner_Documents record. Returns the new record's id on
 * success, throws on failure so the route's outer try/catch can return
 * the sanitized 503.
 */
export async function createPartnerDocument(input: CreatePartnerDocumentInput): Promise<string> {
  const token = await getZohoToken()
  const today = new Date().toISOString().slice(0, 10)
  const payload: Record<string, unknown> = {
    Name: input.name,
    Partner: { id: input.partnerId },
    Document_Type: input.documentType,
    Document_Status: input.documentStatus ?? 'Approved',
    Uploaded_Date: input.uploadedDate ?? today,
  }
  if (input.expiryDate) payload.Expiry_Date = input.expiryDate
  if (input.reviewerNotes) payload.Reviewer_Notes = input.reviewerNotes
  if (input.fileUrl) payload.File_URL = input.fileUrl

  const res = await fetch(`${ZOHO_API}/Partner_Documents`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [payload] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] createPartnerDocument error:', res.status, text.substring(0, 500))
    throw new Error(`Zoho create Partner_Documents failed with status ${res.status}`)
  }
  const data = await res.json()
  const id = data?.data?.[0]?.details?.id
  if (!id) throw new Error(`Zoho create Partner_Documents returned no id: ${JSON.stringify(data)}`)
  return id as string
}

/**
 * Update specific fields on an existing Partner_Documents record. Used
 * to backfill File_URL after the attachment upload succeeds.
 */
export async function updatePartnerDocument(documentId: string, patch: Record<string, unknown>): Promise<void> {
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Partner_Documents/${documentId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [{ id: documentId, ...patch }] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] updatePartnerDocument error:', res.status, text.substring(0, 500))
    throw new Error(`Zoho update Partner_Documents failed with status ${res.status}`)
  }
}

export interface ZohoAttachment {
  id: string
  fileName: string
  size: number | null
}

/**
 * List attachments on a Zoho record.
 */
export async function listAttachments(module: string, recordId: string): Promise<ZohoAttachment[]> {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/${module}/${recordId}/Attachments`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204) return []
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] listAttachments error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho listAttachments failed with status ${res.status}`)
  }
  const data = await res.json()
  return (data?.data ?? []).map((a: any) => ({
    id: a.id,
    fileName: a.File_Name ?? 'document',
    size: a.Size != null ? Number(a.Size) : null,
  }))
}

/**
 * Upload a file as an attachment to a Zoho record. Returns the
 * attachment id. Uses multipart/form-data per Zoho's Attachments API.
 */
export async function uploadAttachment(
  module: string,
  recordId: string,
  file: Blob,
  fileName: string,
): Promise<string> {
  const token = await getZohoToken()
  const form = new FormData()
  form.append('file', file, fileName)
  const res = await fetch(`${ZOHO_API}/${module}/${recordId}/Attachments`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] uploadAttachment error:', res.status, text.substring(0, 500))
    throw new Error(`Zoho upload attachment failed with status ${res.status}`)
  }
  const data = await res.json()
  const id = data?.data?.[0]?.details?.id
  if (!id) throw new Error(`Zoho upload attachment returned no id: ${JSON.stringify(data)}`)
  return id as string
}

/**
 * Download an attachment as a Response, ready to forward to the client.
 * Zoho's Attachments GET endpoint returns the file binary directly (no
 * intermediate redirect on the v2 API as long as the request includes
 * the Zoho-oauthtoken header). We pass through Content-Type and let the
 * route handler set Content-Disposition.
 */
export async function fetchAttachment(
  module: string,
  recordId: string,
  attachmentId: string,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/${module}/${recordId}/Attachments/${attachmentId}`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] fetchAttachment error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho fetch attachment failed with status ${res.status}`)
  }
  const body = await res.arrayBuffer()
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return { body, contentType }
}

/**
 * Fetches a Partner record from the custom Partners module by id.
 * Returns null on 404/204 (no such partner) so the caller can map that
 * to a friendly "setup pending" state. Throws on any other non-OK
 * response (auth, scope, network, rate limit) so the route handler's
 * outer try/catch can return the standard sanitized 503.
 */
export async function getPartner(partnerId: string): Promise<PartnerProfile | null> {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/Partners/${partnerId}?fields=${PARTNER_PROFILE_FIELDS}`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 404 || res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] getPartner error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho Partners lookup failed with status ${res.status}`)
  }
  const data = await res.json()
  const record = data?.data?.[0]
  if (!record) return null
  return normalizePartnerProfile(record)
}

/**
 * Update arbitrary fields on a Partner record. Mirror of
 * updatePartnerDocument — accepts a patch map keyed by Zoho api_name.
 * Throws on any non-OK so route handlers can fall through to their
 * sanitized error response.
 */
export async function updatePartner(
  partnerId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Partners/${partnerId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [{ id: partnerId, ...patch }] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] updatePartner error:', res.status, text.substring(0, 500))
    throw new Error(`Zoho update Partners failed with status ${res.status}`)
  }
}

/**
 * Create a Partner record. Returns the new record id on success.
 * Mirror of createPartnerDocument's POST shape. The caller is
 * responsible for passing field names that exist on the Partners
 * module — Zoho silently drops unknowns.
 */
export async function createPartner(payload: Record<string, unknown>): Promise<string> {
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Partners`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [payload] }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] createPartner error:', res.status, text.substring(0, 500))
    throw new Error(`Zoho create Partners failed with status ${res.status}`)
  }
  const data = await res.json()
  const id = data?.data?.[0]?.details?.id
  if (!id) throw new Error(`Zoho create Partners returned no id: ${JSON.stringify(data)}`)
  return id as string
}

/**
 * Find a Partner by id + magic-link token (canonical Path B lookup).
 *
 * Issues `getPartner(partnerId)` (direct GET /Partners/{id}, always
 * immediately consistent — no search index involved) and constant-time
 * compares the stored Magic_Link_Token to the URL token. The id-in-URL
 * pattern eliminates the false-expired failure mode that the older
 * findPartnerByMagicLinkToken (search-by-token) has when the click
 * lands within Zoho's 1-5 min search-index window.
 *
 * Returns null if:
 *   - Partner not found (Zoho 404)
 *   - Partner has no Magic_Link_Token on file
 *   - Stored Magic_Link_Token doesn't match the URL token
 *
 * All three null cases are indistinguishable to the caller — no
 * info leak about which partner ids exist or which tokens are live.
 * Caller is responsible for expiry + Magic_Link_Used_At checks.
 */
export async function findPartnerByIdAndMagicLinkToken(
  partnerId: string,
  token: string,
): Promise<PartnerProfile | null> {
  if (!partnerId || !token) return null

  const partner = await getPartner(partnerId)
  if (!partner || !partner.magicLinkToken) return null

  // Constant-time comparison. The page-level regex already guarantees
  // both strings are 64 hex chars; timingSafeEqual rejects mismatched
  // lengths so we double-check before calling it (calling with
  // mismatched lengths throws RangeError, not a timing-safe false).
  const a = Buffer.from(partner.magicLinkToken)
  const b = Buffer.from(token)
  if (a.length !== b.length) return null
  if (!timingSafeEqual(a, b)) return null

  return partner
}

/**
 * Find a Partner by their magic-link token. Hits the read-after-write
 * cache first (lib/cache.ts) so freshly-issued tokens resolve
 * immediately even before Zoho's search index catches up. Falls
 * through to /Partners/search on cache miss.
 *
 * Returns null if no Partner matches. Does NOT validate expiry or
 * usage — caller is responsible for those checks.
 *
 * @deprecated Path B (commit landing 2026-05-14) replaced this with
 * findPartnerByIdAndMagicLinkToken, which uses direct getPartner and
 * is immediately consistent. This function is retained only for the
 * legacy fallback route (`app/onboard/investor/[partnerId]/page.tsx`)
 * and the legacy ?ref= shape on /onboard/expired. Schedule for deletion
 * 2026-05-29 once all in-flight pre-Path-B magic-link emails (14-day
 * TTL) have expired.
 */
export async function findPartnerByMagicLinkToken(token: string): Promise<PartnerProfile | null> {
  if (!token) return null

  // Cache fast-path: token was just issued on this Vercel instance.
  const cachedPartnerId = lookupMagicLink(token)
  if (cachedPartnerId) {
    const partner = await getPartner(cachedPartnerId)
    // If the partner exists and the token still matches, return.
    // Otherwise the cache is stale (token was rotated) — fall through
    // to search.
    if (partner && partner.magicLinkToken === token) return partner
    forgetMagicLink(token)
  }

  // Search path: criteria match on Magic_Link_Token.
  const zohoToken = await getZohoToken()
  const url = `${ZOHO_API}/Partners/search?criteria=${encodeURIComponent(
    `(Magic_Link_Token:equals:${token})`,
  )}&fields=${PARTNER_PROFILE_FIELDS}&per_page=1`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${zohoToken}` },
    cache: 'no-store',
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho] findPartnerByMagicLinkToken error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho Partners search by token failed with status ${res.status}`)
  }
  const data = await res.json()
  const record = data?.data?.[0]
  if (!record) return null
  const partner = normalizePartnerProfile(record)
  // Repopulate cache so subsequent reads on this instance are fast.
  rememberMagicLink(token, partner.id)
  return partner
}

export async function getInvestorPositions(zohoPartnerId: string) {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/Deals/search?criteria=(Investor_Name:equals:${zohoPartnerId})&fields=${DEAL_FIELDS}&per_page=50`
  const response = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })

  // Zoho v2 /search returns 204 No Content with an empty body when zero
  // records match. Response.ok is true for 204, so we must intercept it
  // before calling .json() — otherwise the empty body throws
  // "Unexpected end of JSON input". Same pattern as getInvestorOpportunities
  // and searchPartnerDocuments.
  if (response.status === 204 || response.status === 404) return []

  if (!response.ok) {
    const text = await response.text()
    console.error('[zoho] getInvestorPositions error:', response.status, text.substring(0, 200))
    return []
  }
  const data = await response.json()
  return data.data || []
}

// Field list for the public opportunities card view — narrower than
// DEAL_FIELDS to keep the Zoho payload light. Verified against the
// fields the opportunities page actually reads.
const OPPORTUNITY_FIELDS = [
  'Deal_Name', 'Amount', 'Mortgage_Type', 'Mortgage_Rate',
  'Investor_Rate', 'Payment_Amount', 'City', 'Province',
  'Street', 'LTV', 'Purchase_Price_Value', 'Maturity_Date',
  'Exit_Strategy', 'Lender_Notes', 'Rate_Type', 'Term_Type',
  'Deal_Status_Investor', 'Stage', 'Closing_Date',
].join(',')

const OPPORTUNITIES_CACHE_KEY = 'opportunities:all'

/**
 * Public opportunities feed. Same query runs for every investor on every
 * dashboard + opportunities page load, so the result is cached under a
 * single shared key for 5 minutes (see lib/cache.ts).
 *
 * Only successful responses are cached. On 204/4xx/5xx/network errors
 * the function returns [] and does NOT poison the cache, so the next
 * request retries fresh.
 */
export async function getInvestorOpportunities(): Promise<any[]> {
  const cached = opportunitiesCache.get(OPPORTUNITIES_CACHE_KEY) as any[] | undefined
  if (cached !== undefined) return cached

  const token = await getZohoToken()
  const url = `${ZOHO_API}/Deals/search?criteria=(Deal_Status_Investor:equals:Available)&fields=${OPPORTUNITY_FIELDS}&per_page=10`
  const response = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })

  // 204 No Content = no records match criteria. Cache the empty result
  // so we don't hammer Zoho when there are simply no opportunities open.
  if (response.status === 204 || response.status === 404) {
    opportunitiesCache.set(OPPORTUNITIES_CACHE_KEY, [])
    return []
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error('[zoho] getInvestorOpportunities error:', response.status, text.substring(0, 200))
    return []
  }

  const text = await response.text()
  if (!text || text.trim() === '') {
    opportunitiesCache.set(OPPORTUNITIES_CACHE_KEY, [])
    return []
  }

  let json: any
  try {
    json = JSON.parse(text)
  } catch (err) {
    console.error('[zoho] getInvestorOpportunities parse error:', err)
    return []
  }

  const records = json.data || []
  opportunitiesCache.set(OPPORTUNITIES_CACHE_KEY, records)
  return records
}

export async function getInvestorDeal(dealId: string) {
  const token = await getZohoToken()
  const response = await fetch(`${ZOHO_API}/Deals/${dealId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!response.ok) {
    const text = await response.text()
    console.error('[zoho] getInvestorDeal error:', response.status, text.substring(0, 200))
    return null
  }
  const data = await response.json()
  return data.data?.[0] || null
}

// ─── FP Portal — CRM API calls ────────────────────────────────────────────────
// NOTE: Fox Mortgage CRM uses the Potentials module (UI label "Mortgages"),
// NOT the Deals module. All FP portal queries must hit /crm/v2/Potentials.
// Field list is restricted to fields confirmed to exist on the Potentials
// schema — unknown field names cause Zoho to return INVALID_DATA 400s.

// ─── Note_Title prefix constants ──────────────────────────────────────────────
// The Notes module is `system_hidden` on this org and silently drops any
// custom field on write (verified 2026-05-28 via /settings/fields?module=Notes,
// both v2 and v6). The FP/Realtor messaging workflows in n8n historically
// included `Note_Type` on every Zoho Notes POST — Zoho ignores it, so the
// stored notes carry no type. The only persisted, workflow-controlled signal
// is Note_Title, which both workflows set with these exact prefixes:
//
//   FP per-client (1jl45sF4HfvxO5L8 "Create Client Note"):
//     'FP Message from ' + body.fpName
//   FP general    (1jl45sF4HfvxO5L8 "Create General Note"):
//     'FP General Message from ' + body.fpName
//   Realtor per-client (rd8DuOTJrcoeQ55w "Create Client Note"):
//     'Realtor Message from ' + body.realtorName
//   Realtor general    (rd8DuOTJrcoeQ55w "Create General Note"):
//     'Realtor General Message from ' + body.realtorName
//
// Each prefix ends with " from " (trailing space) so substring collision with
// a hand-written Michael note is essentially impossible. Filtering on these
// constants below means a future workflow rename has ONE place to update.
const FP_CLIENT_NOTE_TITLE_PREFIX = 'FP Message from '
const FP_GENERAL_NOTE_TITLE_PREFIX = 'FP General Message from '
const REALTOR_CLIENT_NOTE_TITLE_PREFIX = 'Realtor Message from '
const REALTOR_GENERAL_NOTE_TITLE_PREFIX = 'Realtor General Message from '

// Lawyer messaging — mirror of the realtor prefixes. The lawyer
// messaging workflow does not exist yet (decision flagged in §2 of the
// build brief); when it ships it MUST set Note_Title with these exact
// strings so the per-client/timeline split here continues to work.
const LAWYER_CLIENT_NOTE_TITLE_PREFIX = 'Lawyer Message from '
const LAWYER_GENERAL_NOTE_TITLE_PREFIX = 'Lawyer General Message from '

// Fields confirmed to exist on the Potentials module (verified via
// /crm/v2/settings/fields?module=Potentials). Unknown field names cause
// Zoho to return INVALID_DATA 400s and drop the entire response.
// NOTE: requested Zip_Code → real API name is Postal_Code.
// NOTE: requested Goal / Mortgage_Goal do NOT exist on Potentials — use
// Transaction_Type / Application_Type / Mortgage_Type for the type chain.
const FP_DEAL_FIELDS = [
  'Deal_Name',
  'Contact_Name',
  'Amount',
  'Mortgage_Rate',
  'Stage',
  'Closing_Date',
  'Modified_Time',
  'Mortgage_Type',
  'Application_Type',
  'Transaction_Type',
  'Street',
  'City',
  'Province',
  'Postal_Code',
  'Country',
  'LTV',
  'Total_Loan_Amount',
  'Purchase_Price_Value',
  'Referral_Partner',
].join(',')

export interface FPClient {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: number | null
  stage: string
  stageModifiedTime: string | null
  city: string | null
  province: string | null
  location: string | null
  mortgageType: string | null
  type: string | null
  termYears: string | null
  paymentFrequency: string | null
  closingDate: string | null
  lastActivity: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  ltv: number | null
  totalLoanAmount: number | null
  purchasePriceValue: number | null
  referralPartnerId: string | null
  referralPartnerName: string | null
  description: string | null
}

export class ZohoError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`Zoho ${status}: ${body.substring(0, 300)}`)
    this.status = status
    this.body = body
  }
}

export interface FPNote {
  id: string
  body: string
  createdTime: string
  createdBy: string
  noteType: string | null
  noteTitle: string
}

export interface FPClientDetail extends FPClient {
  messages: FPNote[]
  timeline: FPNote[]
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function normalizeFPClient(r: any): FPClient {
  // Build full address from the 4 Potentials address fields.
  const street   = r.Street      || ''
  const city     = r.City        || ''
  const province = r.Province    || ''
  const postal   = r.Postal_Code || ''
  const location = [street, city, province, postal].filter(Boolean).join(', ') || null

  // Type chain: Mortgage_Type → Application_Type → Transaction_Type.
  // Transaction_Type is often the only one populated on migrated files.
  const rawType =
    r.Mortgage_Type ||
    r.Application_Type ||
    r.Transaction_Type ||
    null
  const type = rawType ? capitalize(String(rawType)) : null

  return {
    id: r.id,
    dealName: r.Deal_Name ?? '',
    contactName: typeof r.Contact_Name === 'object' ? (r.Contact_Name?.name ?? '') : (r.Contact_Name ?? ''),
    amount: r.Amount != null ? Number(r.Amount) : null,
    mortgageRate: r.Mortgage_Rate != null ? Number(r.Mortgage_Rate) : null,
    stage: r.Stage ?? '',
    stageModifiedTime: r.Modified_Time ?? null,
    city: r.City ?? null,
    province: r.Province ?? null,
    location,
    mortgageType: r.Mortgage_Type ?? null,
    type,
    termYears: null,
    paymentFrequency: null,
    closingDate: r.Closing_Date ?? null,
    lastActivity: null,
    nextReviewDate: null,
    savingsIdentified: null,
    ltv: r.LTV != null ? Number(r.LTV) : null,
    totalLoanAmount: r.Total_Loan_Amount != null ? Number(r.Total_Loan_Amount) : null,
    purchasePriceValue: r.Purchase_Price_Value != null ? Number(r.Purchase_Price_Value) : null,
    referralPartnerId: typeof r.Referral_Partner === 'object' ? (r.Referral_Partner?.id ?? null) : null,
    referralPartnerName: typeof r.Referral_Partner === 'object' ? (r.Referral_Partner?.name ?? null) : null,
    description: null,
  }
}

export async function getFPClients(fpZohoId: string): Promise<FPClient[]> {
  const token = await getZohoToken()
  const criteria = encodeURIComponent(`(Referral_Partner:equals:${fpZohoId})`)
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${FP_DEAL_FIELDS}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (res.status === 204) return []
  if (!res.ok) {
    const text = await res.text()
    console.error('[zoho] getFPClients error:', res.status, 'url:', url, 'body:', text.substring(0, 500))
    throw new ZohoError(res.status, text)
  }
  const data = await res.json()
  return (data.data ?? []).map(normalizeFPClient)
}

export async function getFPClientDetail(dealId: string): Promise<FPClientDetail | null> {
  const token = await getZohoToken()

  // Fetch the deal record (Potentials module)
  const dealRes = await fetch(`${ZOHO_API}/Potentials/${dealId}?fields=${FP_DEAL_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!dealRes.ok) {
    const text = await dealRes.text()
    console.error('[zoho] getFPClientDetail deal error:', dealRes.status, text.substring(0, 300))
    return null
  }
  const dealData = await dealRes.json()
  const r = dealData.data?.[0]
  if (!r) return null

  const client = normalizeFPClient(r)

  // Fetch related Notes (sorted oldest→newest for timeline display)
  let allNotes: FPNote[] = []
  try {
    const notesRes = await fetch(
      `${ZOHO_API}/Potentials/${dealId}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (notesRes.ok && notesRes.status !== 204) {
      const notesData = await notesRes.json()
      allNotes = (notesData.data ?? []).map((n: any): FPNote => ({
        id: n.id,
        body: n.Note_Content ?? '',
        createdTime: n.Created_Time ?? '',
        createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
        noteType: n.Note_Type ?? null,
        noteTitle: n.Note_Title ?? '',
      }))
    }
  } catch (err) {
    console.error('[zoho] getFPClientDetail notes error:', err)
  }

  // Split notes into "Messages" (portal-written) vs. "timeline" (everything else
  // on this Deal — Michael's hand-written notes, sync stamps, etc.) by Note_Title
  // prefix. Note_Type is not used because the Notes module is system_hidden and
  // silently drops custom fields on write; the workflows already write a
  // distinctive title prefix that Zoho persists losslessly.
  return {
    ...client,
    messages: allNotes.filter(n => n.noteTitle.startsWith(FP_CLIENT_NOTE_TITLE_PREFIX)),
    timeline: allNotes.filter(n => !n.noteTitle.startsWith(FP_CLIENT_NOTE_TITLE_PREFIX)),
  }
}

/**
 * FP messages thread. Three sequential Zoho calls per page load
 * (Partners.Email → Contacts/search → Contacts.Notes), so the result
 * is cached per partner id for 2 minutes. Only successful results are
 * cached; failures fall through to the existing return-[] path.
 *
 * Cache busting on the /api/portal/fp/message POST path is a future
 * improvement — for now a new note can be 0–120s late on the same
 * device. Acceptable for v1.
 *
 * Filtering uses Note_Title prefix (not Note_Type) because the Notes module
 * is system_hidden and silently drops custom fields on write; the FP
 * messaging workflow writes a stable title prefix that Zoho persists.
 */
export async function getFPMessages(partnerId: string): Promise<FPNote[]> {
  const cacheKey = `fp-messages:${partnerId}`
  const cached = fpMessagesCache.get(cacheKey) as FPNote[] | undefined
  if (cached !== undefined) return cached

  const token = await getZohoToken()

  // Look up the FP's Email from the Partners module first. This makes the
  // function impersonation-safe: under admin impersonation, the route passes
  // the impersonated partner's id, so we resolve to that partner's email
  // (not the admin's). Pre-impersonation, this also works because the FP's
  // own publicMetadata.fp_zoho_id matches their Partners record id.
  const partnerRes = await fetch(
    `${ZOHO_API}/Partners/${partnerId}?fields=Email`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!partnerRes.ok || partnerRes.status === 204) return []
  const partnerData = await partnerRes.json()
  const fpEmail = partnerData?.data?.[0]?.Email
  if (!fpEmail) return []

  // Find the FP's Contact record by email
  const contactRes = await fetch(
    `${ZOHO_API}/Contacts/search?criteria=${encodeURIComponent(`(Email:equals:${fpEmail})`)}&fields=id,Full_Name&per_page=1`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!contactRes.ok || contactRes.status === 204) return []
  const contactData = await contactRes.json()
  const contact = contactData.data?.[0]
  if (!contact) return []

  // Fetch Notes on this Contact
  const notesRes = await fetch(
    `${ZOHO_API}/Contacts/${contact.id}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!notesRes.ok || notesRes.status === 204) return []
  const notesData = await notesRes.json()

  const messages: FPNote[] = (notesData.data ?? [])
    .filter((n: any) => (n.Note_Title ?? '').startsWith(FP_GENERAL_NOTE_TITLE_PREFIX))
    .map((n: any): FPNote => ({
      id: n.id,
      body: n.Note_Content ?? '',
      createdTime: n.Created_Time ?? '',
      createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
      noteType: n.Note_Type ?? null,
      noteTitle: n.Note_Title ?? '',
    }))

  fpMessagesCache.set(cacheKey, messages)
  return messages
}

export interface FPDashboardStats {
  totalReferrals: number
  activeMonitoring: number   // Files In Progress
  closedMortgages: number    // Funded Mortgages
  fundedVolume: number       // Total Funded
  leadToClose: number
  savingsYTD: number
  mortgagesUnderMgmt: number // Total Referred Value
}

export interface FPDashboardRecent {
  client: string
  dealId: string
  stage: string
  lastActivity: string | null
  savingsIdentified: string | null
}

export interface FPDashboardPayload {
  stats: FPDashboardStats
  recent: FPDashboardRecent[]
  warning?: string
}

const EMPTY_STATS: FPDashboardStats = {
  totalReferrals: 0,
  activeMonitoring: 0,
  closedMortgages: 0,
  fundedVolume: 0,
  leadToClose: 0,
  savingsYTD: 0,
  mortgagesUnderMgmt: 0,
}

/**
 * Dashboard data for a single FP. Single minimal-field Zoho query drives
 * BOTH the stats cards and the Recent Activity table.
 *
 * Field list is the minimum required — adding more fields has historically
 * caused INVALID_DATA 400s and silently broken the entire dashboard.
 *
 * Error handling: this function NEVER throws. On any Zoho failure it logs
 * the error and returns { stats: EMPTY_STATS, recent: [], warning }. The
 * dashboard UI is designed to render the stat grid with zeros in that case
 * rather than disappear entirely.
 */
export async function getFPDashboardPayload(fpZohoId: string): Promise<FPDashboardPayload> {
  const criteria = encodeURIComponent(`(Referral_Partner:equals:${fpZohoId})`)
  // Minimal confirmed-working field list — do NOT add fields without verifying
  // via /crm/v2/settings/fields?module=Potentials first.
  const fields = 'Deal_Name,Contact_Name,Amount,Stage,Closing_Date,Referral_Partner'
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${fields}&per_page=200`

  let token: string
  try {
    token = await getZohoToken()
  } catch (err) {
    console.error('[zoho] getFPDashboardPayload token error:', err)
    return { stats: EMPTY_STATS, recent: [], warning: 'zoho-token-failed' }
  }

  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  } catch (err) {
    console.error('[zoho] getFPDashboardPayload fetch error:', err, 'url:', url)
    return { stats: EMPTY_STATS, recent: [], warning: 'zoho-network-error' }
  }

  if (res.status === 204) {
    // No records matching criteria — return zeros, not an error.
    return { stats: EMPTY_STATS, recent: [] }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(
      '[zoho] getFPDashboardPayload non-ok:',
      res.status,
      'url:', url,
      'body:', text.substring(0, 500),
    )
    return {
      stats: EMPTY_STATS,
      recent: [],
      warning: `zoho-${res.status}: ${text.substring(0, 200)}`,
    }
  }

  let body: any
  try {
    body = await res.json()
  } catch (err) {
    console.error('[zoho] getFPDashboardPayload JSON parse error:', err)
    return { stats: EMPTY_STATS, recent: [], warning: 'zoho-parse-error' }
  }

  const deals: any[] = Array.isArray(body?.data) ? body.data : []
  if (deals.length === 0) {
    return { stats: EMPTY_STATS, recent: [] }
  }

  // Exact Zoho picklist classification (not substring matching).
  const isFunded = (s: string) =>
    s === 'Mortgage Funded' || s.toLowerCase().includes('funded')
  const isLost = (s: string) =>
    s === 'Mortgage Lost' ||
    s.toLowerCase().includes('lost') ||
    s.toLowerCase().includes('cancelled') ||
    s.toLowerCase().includes('declined')

  const funded = deals.filter(d => isFunded(d.Stage ?? ''))
  const active = deals.filter(d => {
    const s = d.Stage ?? ''
    return !isFunded(s) && !isLost(s)
  })

  const totalReferredValue = deals.reduce(
    (sum: number, d: any) => sum + (Number(d.Amount) || 0),
    0,
  )
  const totalFunded = funded.reduce(
    (sum: number, d: any) => sum + (Number(d.Amount) || 0),
    0,
  )
  const leadToClose =
    deals.length > 0 ? Math.round((funded.length / deals.length) * 1000) / 10 : 0

  const stats: FPDashboardStats = {
    totalReferrals: deals.length,
    activeMonitoring: active.length,
    closedMortgages: funded.length,
    fundedVolume: totalFunded,
    leadToClose,
    savingsYTD: 0, // field not on Potentials
    mortgagesUnderMgmt: totalReferredValue,
  }

  // Recent Activity — derived from the same records.
  // Modified_Time/Last_Activity_Time intentionally NOT fetched to keep the
  // query field list minimal; Last Activity renders as "—".
  const recent: FPDashboardRecent[] = deals.slice(0, 8).map((d: any) => {
    const contactName =
      typeof d.Contact_Name === 'object'
        ? (d.Contact_Name?.name ?? '')
        : (d.Contact_Name ?? '')
    return {
      client: contactName || d.Deal_Name || '(untitled)',
      dealId: d.id,
      stage: d.Stage ?? '',
      lastActivity: null,
      savingsIdentified: null,
    }
  })

  return { stats, recent }
}

/** @deprecated — kept for legacy callers; prefer getFPDashboardPayload. */
export async function getFPDashboardStats(fpZohoId: string): Promise<FPDashboardStats> {
  const payload = await getFPDashboardPayload(fpZohoId)
  return payload.stats
}

// ─── Realtor Portal — CRM API calls ───────────────────────────────────────────
// Mirror of the FP block above, swapping the Partners lookup field from
// Referral_Partner → Realtor (a separate Lookup-to-Partners on the Potentials
// module, verified live by Mike on 2026-05-28). Same Potentials module, same
// Stage picklist, same Notes pipeline. We DO NOT reuse FP types — keeping
// RealtorClient distinct makes the call-site routing unambiguous and removes
// the risk of a wrong-portal data leak via a shared type accidentally
// dropping the role check.

const REALTOR_DEAL_FIELDS = [
  'Deal_Name',
  'Contact_Name',
  'Amount',
  'Mortgage_Rate',
  'Stage',
  'Closing_Date',
  'Modified_Time',
  'Mortgage_Type',
  'Application_Type',
  'Transaction_Type',
  'Street',
  'City',
  'Province',
  'Postal_Code',
  'Country',
  'LTV',
  'Total_Loan_Amount',
  'Purchase_Price_Value',
  'Realtor',
].join(',')

export interface RealtorClient {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: number | null
  stage: string
  stageModifiedTime: string | null
  city: string | null
  province: string | null
  location: string | null
  mortgageType: string | null
  type: string | null
  termYears: string | null
  paymentFrequency: string | null
  closingDate: string | null
  lastActivity: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  ltv: number | null
  totalLoanAmount: number | null
  purchasePriceValue: number | null
  realtorId: string | null
  realtorName: string | null
  description: string | null
}

export interface RealtorNote {
  id: string
  body: string
  createdTime: string
  createdBy: string
  noteType: string | null
  noteTitle: string
}

export interface RealtorClientDetail extends RealtorClient {
  messages: RealtorNote[]
  timeline: RealtorNote[]
}

function normalizeRealtorClient(r: any): RealtorClient {
  // Same address chain as normalizeFPClient — fields live on Potentials.
  const street   = r.Street      || ''
  const city     = r.City        || ''
  const province = r.Province    || ''
  const postal   = r.Postal_Code || ''
  const location = [street, city, province, postal].filter(Boolean).join(', ') || null

  const rawType =
    r.Mortgage_Type ||
    r.Application_Type ||
    r.Transaction_Type ||
    null
  const type = rawType ? capitalize(String(rawType)) : null

  return {
    id: r.id,
    dealName: r.Deal_Name ?? '',
    contactName: typeof r.Contact_Name === 'object' ? (r.Contact_Name?.name ?? '') : (r.Contact_Name ?? ''),
    amount: r.Amount != null ? Number(r.Amount) : null,
    mortgageRate: r.Mortgage_Rate != null ? Number(r.Mortgage_Rate) : null,
    stage: r.Stage ?? '',
    stageModifiedTime: r.Modified_Time ?? null,
    city: r.City ?? null,
    province: r.Province ?? null,
    location,
    mortgageType: r.Mortgage_Type ?? null,
    type,
    termYears: null,
    paymentFrequency: null,
    closingDate: r.Closing_Date ?? null,
    lastActivity: null,
    nextReviewDate: null,
    savingsIdentified: null,
    ltv: r.LTV != null ? Number(r.LTV) : null,
    totalLoanAmount: r.Total_Loan_Amount != null ? Number(r.Total_Loan_Amount) : null,
    purchasePriceValue: r.Purchase_Price_Value != null ? Number(r.Purchase_Price_Value) : null,
    realtorId: typeof r.Realtor === 'object' ? (r.Realtor?.id ?? null) : null,
    realtorName: typeof r.Realtor === 'object' ? (r.Realtor?.name ?? null) : null,
    description: null,
  }
}

export async function getRealtorClients(realtorZohoId: string): Promise<RealtorClient[]> {
  const token = await getZohoToken()
  const criteria = encodeURIComponent(`(Realtor:equals:${realtorZohoId})`)
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${REALTOR_DEAL_FIELDS}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (res.status === 204) return []
  if (!res.ok) {
    const text = await res.text()
    console.error('[zoho] getRealtorClients error:', res.status, 'url:', url, 'body:', text.substring(0, 500))
    throw new ZohoError(res.status, text)
  }
  const data = await res.json()
  return (data.data ?? []).map(normalizeRealtorClient)
}

export async function getRealtorClientDetail(dealId: string): Promise<RealtorClientDetail | null> {
  const token = await getZohoToken()

  const dealRes = await fetch(`${ZOHO_API}/Potentials/${dealId}?fields=${REALTOR_DEAL_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!dealRes.ok) {
    const text = await dealRes.text()
    console.error('[zoho] getRealtorClientDetail deal error:', dealRes.status, text.substring(0, 300))
    return null
  }
  const dealData = await dealRes.json()
  const r = dealData.data?.[0]
  if (!r) return null

  const client = normalizeRealtorClient(r)

  let allNotes: RealtorNote[] = []
  try {
    const notesRes = await fetch(
      `${ZOHO_API}/Potentials/${dealId}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (notesRes.ok && notesRes.status !== 204) {
      const notesData = await notesRes.json()
      allNotes = (notesData.data ?? []).map((n: any): RealtorNote => ({
        id: n.id,
        body: n.Note_Content ?? '',
        createdTime: n.Created_Time ?? '',
        createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
        noteType: n.Note_Type ?? null,
        noteTitle: n.Note_Title ?? '',
      }))
    }
  } catch (err) {
    console.error('[zoho] getRealtorClientDetail notes error:', err)
  }

  // Split notes by Note_Title prefix (Note_Type is dropped on write — see the
  // FP_*/REALTOR_* prefix constants at the top of the FP block).
  return {
    ...client,
    messages: allNotes.filter(n => n.noteTitle.startsWith(REALTOR_CLIENT_NOTE_TITLE_PREFIX)),
    timeline: allNotes.filter(n => !n.noteTitle.startsWith(REALTOR_CLIENT_NOTE_TITLE_PREFIX)),
  }
}

/**
 * Realtor messages thread. Single Zoho call — fetches the Notes on the
 * realtor's Partners record directly. The FP version takes a three-call
 * detour (Partner → Email → search Contacts → Contact.Notes) because FP
 * general messages were originally landing on the FP's Contact record; the
 * realtor messaging workflow (rd8DuOTJrcoeQ55w "Create General Note")
 * writes directly to /Partners/{partnerId}/Notes, so the read path can be
 * direct and the email/contact-search detour was a clone-from-FP oversight.
 *
 * Filter uses Note_Title prefix — see REALTOR_GENERAL_NOTE_TITLE_PREFIX.
 *
 * Cache key uses 'realtor-messages:' prefix so the FP and realtor caches
 * cannot collide on a shared partner id.
 */
export async function getRealtorMessages(partnerId: string): Promise<RealtorNote[]> {
  const cacheKey = `realtor-messages:${partnerId}`
  const cached = realtorMessagesCache.get(cacheKey) as RealtorNote[] | undefined
  if (cached !== undefined) return cached

  const token = await getZohoToken()

  const notesRes = await fetch(
    `${ZOHO_API}/Partners/${partnerId}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!notesRes.ok || notesRes.status === 204) return []
  const notesData = await notesRes.json()

  const messages: RealtorNote[] = (notesData.data ?? [])
    .filter((n: any) => (n.Note_Title ?? '').startsWith(REALTOR_GENERAL_NOTE_TITLE_PREFIX))
    .map((n: any): RealtorNote => ({
      id: n.id,
      body: n.Note_Content ?? '',
      createdTime: n.Created_Time ?? '',
      createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
      noteType: n.Note_Type ?? null,
      noteTitle: n.Note_Title ?? '',
    }))

  realtorMessagesCache.set(cacheKey, messages)
  return messages
}

export interface RealtorDashboardStats {
  totalReferrals: number
  activeMonitoring: number
  closedMortgages: number
  fundedVolume: number
  leadToClose: number
  savingsYTD: number
  mortgagesUnderMgmt: number
}

export interface RealtorDashboardRecent {
  client: string
  dealId: string
  stage: string
  lastActivity: string | null
  savingsIdentified: string | null
}

export interface RealtorDashboardPayload {
  stats: RealtorDashboardStats
  recent: RealtorDashboardRecent[]
  warning?: string
}

const EMPTY_REALTOR_STATS: RealtorDashboardStats = {
  totalReferrals: 0,
  activeMonitoring: 0,
  closedMortgages: 0,
  fundedVolume: 0,
  leadToClose: 0,
  savingsYTD: 0,
  mortgagesUnderMgmt: 0,
}

/**
 * Dashboard data for a single realtor. Mirror of getFPDashboardPayload —
 * single minimal-field Zoho query, never throws, returns zeros + warning on
 * any failure so the UI keeps rendering.
 */
export async function getRealtorDashboardPayload(realtorZohoId: string): Promise<RealtorDashboardPayload> {
  const criteria = encodeURIComponent(`(Realtor:equals:${realtorZohoId})`)
  const fields = 'Deal_Name,Contact_Name,Amount,Stage,Closing_Date,Realtor'
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${fields}&per_page=200`

  let token: string
  try {
    token = await getZohoToken()
  } catch (err) {
    console.error('[zoho] getRealtorDashboardPayload token error:', err)
    return { stats: EMPTY_REALTOR_STATS, recent: [], warning: 'zoho-token-failed' }
  }

  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  } catch (err) {
    console.error('[zoho] getRealtorDashboardPayload fetch error:', err, 'url:', url)
    return { stats: EMPTY_REALTOR_STATS, recent: [], warning: 'zoho-network-error' }
  }

  if (res.status === 204) {
    return { stats: EMPTY_REALTOR_STATS, recent: [] }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(
      '[zoho] getRealtorDashboardPayload non-ok:',
      res.status,
      'url:', url,
      'body:', text.substring(0, 500),
    )
    return {
      stats: EMPTY_REALTOR_STATS,
      recent: [],
      warning: `zoho-${res.status}: ${text.substring(0, 200)}`,
    }
  }

  let body: any
  try {
    body = await res.json()
  } catch (err) {
    console.error('[zoho] getRealtorDashboardPayload JSON parse error:', err)
    return { stats: EMPTY_REALTOR_STATS, recent: [], warning: 'zoho-parse-error' }
  }

  const deals: any[] = Array.isArray(body?.data) ? body.data : []
  if (deals.length === 0) {
    return { stats: EMPTY_REALTOR_STATS, recent: [] }
  }

  const isFunded = (s: string) =>
    s === 'Mortgage Funded' || s.toLowerCase().includes('funded')
  const isLost = (s: string) =>
    s === 'Mortgage Lost' ||
    s.toLowerCase().includes('lost') ||
    s.toLowerCase().includes('cancelled') ||
    s.toLowerCase().includes('declined')

  const funded = deals.filter(d => isFunded(d.Stage ?? ''))
  const active = deals.filter(d => {
    const s = d.Stage ?? ''
    return !isFunded(s) && !isLost(s)
  })

  const totalReferredValue = deals.reduce(
    (sum: number, d: any) => sum + (Number(d.Amount) || 0),
    0,
  )
  const totalFunded = funded.reduce(
    (sum: number, d: any) => sum + (Number(d.Amount) || 0),
    0,
  )
  const leadToClose =
    deals.length > 0 ? Math.round((funded.length / deals.length) * 1000) / 10 : 0

  const stats: RealtorDashboardStats = {
    totalReferrals: deals.length,
    activeMonitoring: active.length,
    closedMortgages: funded.length,
    fundedVolume: totalFunded,
    leadToClose,
    savingsYTD: 0,
    mortgagesUnderMgmt: totalReferredValue,
  }

  const recent: RealtorDashboardRecent[] = deals.slice(0, 8).map((d: any) => {
    const contactName =
      typeof d.Contact_Name === 'object'
        ? (d.Contact_Name?.name ?? '')
        : (d.Contact_Name ?? '')
    return {
      client: contactName || d.Deal_Name || '(untitled)',
      dealId: d.id,
      stage: d.Stage ?? '',
      lastActivity: null,
      savingsIdentified: null,
    }
  })

  return { stats, recent }
}

// ─── Lawyer Portal — CRM API calls ───────────────────────────────────────────
// Mirror of the Realtor block above (which is itself a mirror of FP). The
// Potentials module exposes a `Lawyer` Lookup-to-Partners alongside
// `Realtor` and `Referral_Partner` — verified live by Mike on 2026-05-28.
// Same Potentials module, same Stage picklist, same Notes pipeline. We
// keep LawyerClient distinct from RealtorClient / FPClient so call-site
// routing is unambiguous and a shared type can never drop a role check
// and surface the wrong portal's data.
//
// Lawyer messaging workflow does NOT exist yet (see build brief §2).
// getLawyerMessages and the per-client message filter are wired against
// LAWYER_*_NOTE_TITLE_PREFIX so when the workflow ships its Note_Title
// values must match those constants for the read path to populate.

const LAWYER_DEAL_FIELDS = [
  'Deal_Name',
  'Contact_Name',
  'Amount',
  'Mortgage_Rate',
  'Stage',
  'Closing_Date',
  'Modified_Time',
  'Mortgage_Type',
  'Application_Type',
  'Transaction_Type',
  'Street',
  'City',
  'Province',
  'Postal_Code',
  'Country',
  'LTV',
  'Total_Loan_Amount',
  'Purchase_Price_Value',
  'Lawyer',
].join(',')

export interface LawyerClient {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: number | null
  stage: string
  stageModifiedTime: string | null
  city: string | null
  province: string | null
  location: string | null
  mortgageType: string | null
  type: string | null
  termYears: string | null
  paymentFrequency: string | null
  closingDate: string | null
  lastActivity: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  ltv: number | null
  totalLoanAmount: number | null
  purchasePriceValue: number | null
  lawyerId: string | null
  lawyerName: string | null
  description: string | null
}

export interface LawyerNote {
  id: string
  body: string
  createdTime: string
  createdBy: string
  noteType: string | null
  noteTitle: string
}

export interface LawyerClientDetail extends LawyerClient {
  messages: LawyerNote[]
  timeline: LawyerNote[]
}

function normalizeLawyerClient(r: any): LawyerClient {
  const street   = r.Street      || ''
  const city     = r.City        || ''
  const province = r.Province    || ''
  const postal   = r.Postal_Code || ''
  const location = [street, city, province, postal].filter(Boolean).join(', ') || null

  const rawType =
    r.Mortgage_Type ||
    r.Application_Type ||
    r.Transaction_Type ||
    null
  const type = rawType ? capitalize(String(rawType)) : null

  return {
    id: r.id,
    dealName: r.Deal_Name ?? '',
    contactName: typeof r.Contact_Name === 'object' ? (r.Contact_Name?.name ?? '') : (r.Contact_Name ?? ''),
    amount: r.Amount != null ? Number(r.Amount) : null,
    mortgageRate: r.Mortgage_Rate != null ? Number(r.Mortgage_Rate) : null,
    stage: r.Stage ?? '',
    stageModifiedTime: r.Modified_Time ?? null,
    city: r.City ?? null,
    province: r.Province ?? null,
    location,
    mortgageType: r.Mortgage_Type ?? null,
    type,
    termYears: null,
    paymentFrequency: null,
    closingDate: r.Closing_Date ?? null,
    lastActivity: null,
    nextReviewDate: null,
    savingsIdentified: null,
    ltv: r.LTV != null ? Number(r.LTV) : null,
    totalLoanAmount: r.Total_Loan_Amount != null ? Number(r.Total_Loan_Amount) : null,
    purchasePriceValue: r.Purchase_Price_Value != null ? Number(r.Purchase_Price_Value) : null,
    lawyerId: typeof r.Lawyer === 'object' ? (r.Lawyer?.id ?? null) : null,
    lawyerName: typeof r.Lawyer === 'object' ? (r.Lawyer?.name ?? null) : null,
    description: null,
  }
}

export async function getLawyerClients(lawyerZohoId: string): Promise<LawyerClient[]> {
  const token = await getZohoToken()
  const criteria = encodeURIComponent(`(Lawyer:equals:${lawyerZohoId})`)
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${LAWYER_DEAL_FIELDS}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (res.status === 204) return []
  if (!res.ok) {
    const text = await res.text()
    console.error('[zoho] getLawyerClients error:', res.status, 'url:', url, 'body:', text.substring(0, 500))
    throw new ZohoError(res.status, text)
  }
  const data = await res.json()
  return (data.data ?? []).map(normalizeLawyerClient)
}

export async function getLawyerClientDetail(dealId: string): Promise<LawyerClientDetail | null> {
  const token = await getZohoToken()

  const dealRes = await fetch(`${ZOHO_API}/Potentials/${dealId}?fields=${LAWYER_DEAL_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!dealRes.ok) {
    const text = await dealRes.text()
    console.error('[zoho] getLawyerClientDetail deal error:', dealRes.status, text.substring(0, 300))
    return null
  }
  const dealData = await dealRes.json()
  const r = dealData.data?.[0]
  if (!r) return null

  const client = normalizeLawyerClient(r)

  let allNotes: LawyerNote[] = []
  try {
    const notesRes = await fetch(
      `${ZOHO_API}/Potentials/${dealId}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (notesRes.ok && notesRes.status !== 204) {
      const notesData = await notesRes.json()
      allNotes = (notesData.data ?? []).map((n: any): LawyerNote => ({
        id: n.id,
        body: n.Note_Content ?? '',
        createdTime: n.Created_Time ?? '',
        createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
        noteType: n.Note_Type ?? null,
        noteTitle: n.Note_Title ?? '',
      }))
    }
  } catch (err) {
    console.error('[zoho] getLawyerClientDetail notes error:', err)
  }

  return {
    ...client,
    messages: allNotes.filter(n => n.noteTitle.startsWith(LAWYER_CLIENT_NOTE_TITLE_PREFIX)),
    timeline: allNotes.filter(n => !n.noteTitle.startsWith(LAWYER_CLIENT_NOTE_TITLE_PREFIX)),
  }
}

/**
 * Lawyer messages thread. Direct GET against /Partners/{id}/Notes — same
 * corrected pattern as getRealtorMessages, not the original FP detour.
 *
 * Caveat: the lawyer messaging n8n workflow does NOT exist yet (build
 * brief §2 flags this as a decision: reuse the realtor workflow with a
 * `context=lawyer` param, or build a sibling). Until that ships, this
 * function will return [] for every lawyer — no notes are being written
 * with the LAWYER_GENERAL prefix today. The read path is still correct
 * and will populate the instant the workflow lands.
 */
export async function getLawyerMessages(partnerId: string): Promise<LawyerNote[]> {
  const cacheKey = `lawyer-messages:${partnerId}`
  const cached = lawyerMessagesCache.get(cacheKey) as LawyerNote[] | undefined
  if (cached !== undefined) return cached

  const token = await getZohoToken()

  const notesRes = await fetch(
    `${ZOHO_API}/Partners/${partnerId}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  )
  if (!notesRes.ok || notesRes.status === 204) return []
  const notesData = await notesRes.json()

  const messages: LawyerNote[] = (notesData.data ?? [])
    .filter((n: any) => (n.Note_Title ?? '').startsWith(LAWYER_GENERAL_NOTE_TITLE_PREFIX))
    .map((n: any): LawyerNote => ({
      id: n.id,
      body: n.Note_Content ?? '',
      createdTime: n.Created_Time ?? '',
      createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
      noteType: n.Note_Type ?? null,
      noteTitle: n.Note_Title ?? '',
    }))

  lawyerMessagesCache.set(cacheKey, messages)
  return messages
}

export interface LawyerDashboardStats {
  totalReferrals: number
  activeMonitoring: number
  closedMortgages: number
  fundedVolume: number
  leadToClose: number
  savingsYTD: number
  mortgagesUnderMgmt: number
}

export interface LawyerDashboardRecent {
  client: string
  dealId: string
  stage: string
  lastActivity: string | null
  savingsIdentified: string | null
}

export interface LawyerDashboardPayload {
  stats: LawyerDashboardStats
  recent: LawyerDashboardRecent[]
  warning?: string
}

const EMPTY_LAWYER_STATS: LawyerDashboardStats = {
  totalReferrals: 0,
  activeMonitoring: 0,
  closedMortgages: 0,
  fundedVolume: 0,
  leadToClose: 0,
  savingsYTD: 0,
  mortgagesUnderMgmt: 0,
}

/**
 * Dashboard data for a single lawyer. Mirror of getRealtorDashboardPayload —
 * single minimal-field Zoho query, never throws, returns zeros + warning on
 * any failure so the UI keeps rendering.
 */
export async function getLawyerDashboardPayload(lawyerZohoId: string): Promise<LawyerDashboardPayload> {
  const criteria = encodeURIComponent(`(Lawyer:equals:${lawyerZohoId})`)
  const fields = 'Deal_Name,Contact_Name,Amount,Stage,Closing_Date,Lawyer'
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${fields}&per_page=200`

  let token: string
  try {
    token = await getZohoToken()
  } catch (err) {
    console.error('[zoho] getLawyerDashboardPayload token error:', err)
    return { stats: EMPTY_LAWYER_STATS, recent: [], warning: 'zoho-token-failed' }
  }

  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } })
  } catch (err) {
    console.error('[zoho] getLawyerDashboardPayload fetch error:', err, 'url:', url)
    return { stats: EMPTY_LAWYER_STATS, recent: [], warning: 'zoho-network-error' }
  }

  if (res.status === 204) {
    return { stats: EMPTY_LAWYER_STATS, recent: [] }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(
      '[zoho] getLawyerDashboardPayload non-ok:',
      res.status,
      'url:', url,
      'body:', text.substring(0, 500),
    )
    return {
      stats: EMPTY_LAWYER_STATS,
      recent: [],
      warning: `zoho-${res.status}: ${text.substring(0, 200)}`,
    }
  }

  let body: any
  try {
    body = await res.json()
  } catch (err) {
    console.error('[zoho] getLawyerDashboardPayload JSON parse error:', err)
    return { stats: EMPTY_LAWYER_STATS, recent: [], warning: 'zoho-parse-error' }
  }

  const deals: any[] = Array.isArray(body?.data) ? body.data : []
  if (deals.length === 0) {
    return { stats: EMPTY_LAWYER_STATS, recent: [] }
  }

  const isFunded = (s: string) =>
    s === 'Mortgage Funded' || s.toLowerCase().includes('funded')
  const isLost = (s: string) =>
    s === 'Mortgage Lost' ||
    s.toLowerCase().includes('lost') ||
    s.toLowerCase().includes('cancelled') ||
    s.toLowerCase().includes('declined')

  const funded = deals.filter(d => isFunded(d.Stage ?? ''))
  const active = deals.filter(d => {
    const s = d.Stage ?? ''
    return !isFunded(s) && !isLost(s)
  })

  const totalReferredValue = deals.reduce(
    (sum: number, d: any) => sum + (Number(d.Amount) || 0),
    0,
  )
  const totalFunded = funded.reduce(
    (sum: number, d: any) => sum + (Number(d.Amount) || 0),
    0,
  )
  const leadToClose =
    deals.length > 0 ? Math.round((funded.length / deals.length) * 1000) / 10 : 0

  const stats: LawyerDashboardStats = {
    totalReferrals: deals.length,
    activeMonitoring: active.length,
    closedMortgages: funded.length,
    fundedVolume: totalFunded,
    leadToClose,
    savingsYTD: 0,
    mortgagesUnderMgmt: totalReferredValue,
  }

  const recent: LawyerDashboardRecent[] = deals.slice(0, 8).map((d: any) => {
    const contactName =
      typeof d.Contact_Name === 'object'
        ? (d.Contact_Name?.name ?? '')
        : (d.Contact_Name ?? '')
    return {
      client: contactName || d.Deal_Name || '(untitled)',
      dealId: d.id,
      stage: d.Stage ?? '',
      lastActivity: null,
      savingsIdentified: null,
    }
  })

  return { stats, recent }
}

// ─── SMM Enrollment — CASL Consent Write ─────────────────────────────────────
// Searches Contacts by email. If found, updates the 4 CASL fields on the
// existing record. If not found, creates a new Contact with the CASL fields.
// Never throws — logs errors and returns a result descriptor.

export interface SmmCaslParams {
  email: string
  firstName: string
  lastName: string
  phone: string
  caslConsentDate: string     // ISO-8601 UTC (e.g. 2026-05-11T13:47:00.000Z)
  caslConsentMethod: string   // "Express"
  caslConsentSource: string   // "foxmortgage.ca/smm — enrollment wizard"
  caslConsentLanguage: string // exact opt-in text shown to user
}

export async function upsertSmmContactWithCasl(
  params: SmmCaslParams,
): Promise<{ action: 'updated' | 'created' | 'error'; id?: string }> {
  let token: string
  try {
    token = await getZohoToken()
  } catch (err) {
    console.error('[zoho] upsertSmmContactWithCasl token error:', err)
    return { action: 'error' }
  }

  // Zoho datetime expects yyyy-MM-dd'T'HH:mm:ssXXX — strip milliseconds from ISO string
  const caslDate = params.caslConsentDate.replace(/\.\d{3}Z$/, '+00:00')

  const caslFields = {
    CASL_Consent_Date: caslDate,
    CASL_Consent_Method: params.caslConsentMethod,
    CASL_Consent_Source: params.caslConsentSource,
    CASL_Consent_Language: params.caslConsentLanguage,
  }

  // Search for an existing Contact by email
  try {
    const searchRes = await fetch(
      `${ZOHO_API}/Contacts/search?criteria=${encodeURIComponent(`(Email:equals:${params.email})`)}&fields=id&per_page=1`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } },
    )
    if (searchRes.ok && searchRes.status !== 204) {
      const searchData = await searchRes.json()
      const existing = searchData.data?.[0]
      if (existing?.id) {
        const updateRes = await fetch(`${ZOHO_API}/Contacts`, {
          method: 'PUT',
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ data: [{ id: existing.id, ...caslFields }] }),
        })
        if (!updateRes.ok) {
          const text = await updateRes.text()
          console.error('[zoho] upsertSmmContactWithCasl update error:', updateRes.status, text.substring(0, 300))
          return { action: 'error', id: existing.id }
        }
        return { action: 'updated', id: existing.id }
      }
    }
  } catch (err) {
    console.error('[zoho] upsertSmmContactWithCasl search error:', err)
    // Fall through to create
  }

  // No existing Contact — create one
  try {
    const createBody: Record<string, string | undefined> = {
      First_Name: params.firstName,
      Last_Name: params.lastName,
      Email: params.email,
      Lead_Source: 'Website',
      ...caslFields,
    }
    if (params.phone) createBody.Phone = params.phone

    const createRes = await fetch(`${ZOHO_API}/Contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [createBody] }),
    })
    if (!createRes.ok) {
      const text = await createRes.text()
      console.error('[zoho] upsertSmmContactWithCasl create error:', createRes.status, text.substring(0, 300))
      return { action: 'error' }
    }
    const createData = await createRes.json()
    const newId: string | undefined = createData.data?.[0]?.details?.id
    return { action: 'created', id: newId }
  } catch (err) {
    console.error('[zoho] upsertSmmContactWithCasl create error:', err)
    return { action: 'error' }
  }
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────
// Live data for app/portal/admin (replaces the old hardcoded tiles). Two
// independent sources:
//   1. partners — grouped from listAllPartners() (shares partnersCache).
//   2. deals    — a SINGLE paginated Potentials records pull; every
//      deal-derived tile (funded volume, in-progress, referrals this month,
//      attribution, recent referrals) is computed from that one fetch.
//
// Why not COQL: the COQL endpoint requires the ZohoCRM.coql.READ scope,
// which the app's refresh token does NOT hold — so COUNT queries 401'd in
// prod and every deal tile fell back to a dash, even though the same query
// works through the separately-authenticated MCP connector. The records API
// (/Potentials, same scope listAllPartners already uses) avoids the scope
// dependency entirely. 205 deals is two pages at 200/page.
//
// Resilience: this function NEVER throws. Partners and deals fail
// independently — a deal-pull failure still renders partner tiles, with
// `deals: null` so the UI shows dashes / Coming Soon for those tiles.

export interface AdminRecentReferral {
  dealId: string
  borrower: string            // from Deal_Name
  partner: string | null      // Referral_Partner lookup display name
  stage: string
  createdTime: string | null  // ISO datetime from Zoho
}

export interface AdminDealMetrics {
  fundedVolume: number        // sum of Amount over funded deals (dollars)
  fundedCount: number
  inProgress: number
  total: number
  referralsThisMonth: number
  totalReferrals: number      // all-time deals with a Referral_Partner
  attributionPct: number      // rounded whole percent of total
  recentReferrals: AdminRecentReferral[]
}

export interface AdminDashboardPayload {
  partners: {
    total: number
    byType: {
      realtor: number
      lawyer: number
      investor: number
      financialPlanner: number
      untyped: number
    }
  }
  deals: AdminDealMetrics | null
  warning?: string
}

const ADMIN_DASHBOARD_TZ = 'America/Toronto'

// Stage classification for deal tiles. Matched case-insensitively against
// the trimmed Stage value so picklist casing drift doesn't silently zero a
// tile. Funded → counts toward funded volume; in-progress → the active
// pipeline count.
const FUNDED_STAGES = new Set(['mortgage funded', 'funded'])
const IN_PROGRESS_STAGES = new Set([
  'qualification',
  'application started',
  'collecting documentation',
  'conditionally approved',
  'options',
  'pending',
])

// Minutes the given instant is offset from UTC in the target zone (negative
// west of UTC, e.g. EDT = -240, EST = -300). Derived from Intl so DST is
// handled by the platform tz database, not a hardcoded offset.
function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value
  const hour = map.hour === '24' ? '00' : map.hour
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second),
  )
  return (asUTC - date.getTime()) / 60000
}

// ISO-8601 start-of-current-month in America/Toronto with the correct DST
// offset for that month (e.g. "2026-05-01T00:00:00-04:00" during EDT). The
// offset is probed at noon UTC on the 1st — safely inside the month's DST
// period — so it reflects EDT vs EST dynamically rather than a frozen value.
function startOfCurrentMonthToronto(now: Date = new Date()): string {
  const ymParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_DASHBOARD_TZ,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = ymParts.find(p => p.type === 'year')!.value
  const month = ymParts.find(p => p.type === 'month')!.value

  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, 1, 12, 0, 0))
  const offsetMin = zoneOffsetMinutes(probe, ADMIN_DASHBOARD_TZ)
  const sign = offsetMin <= 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `${year}-${month}-01T00:00:00${sign}${hh}:${mm}`
}

// Slim deal field list for the admin aggregates — only what the tiles need.
// Created_Time is a Zoho system field (always present on Potentials).
const ADMIN_DEAL_FIELDS = 'Deal_Name,Stage,Amount,Referral_Partner,Created_Time'

// Pulls every Potentials (deal) record via the records API, paging at
// Zoho's 200/page max, newest first. Uses the same scope/token as
// listAllPartners — NO COQL. Throws on a hard failure so the caller can mark
// `deals: null`; callers must wrap in try/catch.
async function fetchAllAdminDeals(): Promise<any[]> {
  const token = await getZohoToken()
  const all: any[] = []
  let page = 1
  // Safety cap: 20 pages × 200 = 4,000 deals, well above the live ~205.
  while (page <= 20) {
    const url = `${ZOHO_API}/Potentials?fields=${ADMIN_DEAL_FIELDS}&per_page=200&page=${page}&sort_by=Created_Time&sort_order=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[zoho] fetchAllAdminDeals error:', res.status, text.substring(0, 300))
      throw new Error(`Zoho Potentials list failed with status ${res.status}`)
    }
    const data = await res.json()
    const rows: any[] = Array.isArray(data?.data) ? data.data : []
    all.push(...rows)
    if (data?.info?.more_records !== true) break
    page += 1
  }
  return all
}

// Referral_Partner is a lookup → { id, name } object when set, null when not.
function referralPartnerName(raw: any): string | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw.name ?? null
  return typeof raw === 'string' ? raw : null
}

// Compute every deal-derived tile from one pull. now is injectable for tests.
function computeAdminDealMetrics(deals: any[], now: Date = new Date()): AdminDealMetrics {
  const monthStart = new Date(startOfCurrentMonthToronto(now)).getTime()

  let fundedVolume = 0
  let fundedCount = 0
  let inProgress = 0
  let totalReferrals = 0
  let referralsThisMonth = 0
  const referredDeals: any[] = []

  for (const d of deals) {
    const stage = String(d.Stage ?? '').trim().toLowerCase()
    if (FUNDED_STAGES.has(stage)) {
      fundedCount += 1
      fundedVolume += Number(d.Amount) || 0
    }
    if (IN_PROGRESS_STAGES.has(stage)) inProgress += 1

    if (d.Referral_Partner != null) {
      totalReferrals += 1
      referredDeals.push(d)
      const created = d.Created_Time ? new Date(d.Created_Time).getTime() : NaN
      if (Number.isFinite(created) && created >= monthStart) referralsThisMonth += 1
    }
  }

  const total = deals.length
  const attributionPct = total > 0 ? Math.round((totalReferrals / total) * 100) : 0

  // referredDeals already newest-first (query sorted desc by Created_Time).
  const recentReferrals: AdminRecentReferral[] = referredDeals.slice(0, 10).map(d => ({
    dealId: d.id,
    borrower: d.Deal_Name ?? '(untitled)',
    partner: referralPartnerName(d.Referral_Partner),
    stage: d.Stage ?? '',
    createdTime: d.Created_Time ?? null,
  }))

  return {
    fundedVolume,
    fundedCount,
    inProgress,
    total,
    referralsThisMonth,
    totalReferrals,
    attributionPct,
    recentReferrals,
  }
}

// Map a raw Partner_Type picklist value onto a dashboard bucket. Unset or
// unrecognized types fall into 'untyped'. Substring match (case-insensitive)
// so picklist label drift like "Financial Planner (FP)" still classifies.
function classifyPartnerType(
  raw: string | null,
): keyof AdminDashboardPayload['partners']['byType'] {
  if (!raw) return 'untyped'
  const s = raw.toLowerCase()
  if (s.includes('realtor')) return 'realtor'
  if (s.includes('lawyer')) return 'lawyer'
  if (s.includes('financial')) return 'financialPlanner'
  if (s.includes('investor')) return 'investor'
  return 'untyped'
}

export async function getAdminDashboardPayload(): Promise<AdminDashboardPayload> {
  const cacheKey = 'all'
  const cached = adminDashboardCache.get(cacheKey) as AdminDashboardPayload | undefined
  if (cached !== undefined) return cached

  let warning: string | undefined

  // 1. Partners — grouped from the shared partner list cache. If this fails
  //    we still return a payload (zeros) so the route never 500s.
  const byType = {
    realtor: 0,
    lawyer: 0,
    investor: 0,
    financialPlanner: 0,
    untyped: 0,
  }
  let total = 0
  try {
    const partners = await listAllPartners()
    total = partners.length
    for (const p of partners) byType[classifyPartnerType(p.partnerType)] += 1
  } catch (err) {
    console.error('[zoho] getAdminDashboardPayload partners error:', err)
    warning = 'partners-failed'
  }

  // 2. Deals — one records pull, all deal tiles computed in code. On failure
  //    deals=null (UI shows dashes) but partner tiles still render.
  let deals: AdminDealMetrics | null = null
  try {
    const rows = await fetchAllAdminDeals()
    deals = computeAdminDealMetrics(rows)
  } catch (err) {
    console.error('[zoho] getAdminDashboardPayload deals error:', err)
    warning = warning ? `${warning},deals-failed` : 'deals-failed'
  }

  const payload: AdminDashboardPayload = {
    partners: { total, byType },
    deals,
    ...(warning ? { warning } : {}),
  }

  // Only cache fully-successful payloads — a degraded one would otherwise
  // freeze the failure for the full TTL (mirrors the .set()-on-success rule
  // the rest of lib/cache.ts follows).
  if (!warning) adminDashboardCache.set(cacheKey, payload)
  return payload
}
