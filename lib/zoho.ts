// Server-side only — never import in client components
// Wire up by adding env vars to Vercel:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN
//   ZOHO_ORG_ID

import { opportunitiesCache, fpMessagesCache } from '@/lib/cache'

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
  'Name', 'Email', 'Phone', 'Mobile',
  'Street', 'City', 'Province', 'Postal_Code',
  'Partner_Type', 'Partner_Status',
  'Date_of_Birth', 'Residency_Status', 'Entity_Type',
  'Risk_Profile', 'Investor_Preferences',
].join(',')

export interface PartnerProfile {
  id: string
  name: string | null
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
}

function normalizePartnerProfile(r: any): PartnerProfile {
  return {
    id: r.id,
    name: r.Name ?? null,
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
  }
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

/**
 * List Partner_Documents records for a single partner. Optional status
 * filter narrows the result to the investor-visible subset (Approved /
 * Submitted / Expired) — admins fetch unfiltered.
 */
export async function getPartnerDocuments(
  partnerId: string,
  statuses?: string[],
): Promise<PartnerDocument[]> {
  const token = await getZohoToken()
  // criteria: (Partner.id:equals:{id}) AND ((Document_Status:equals:Approved)or(...))
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
    console.error('[zoho] getPartnerDocuments error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho Partner_Documents search failed with status ${res.status}`)
  }
  const data = await res.json()
  return (data?.data ?? []).map(normalizePartnerDocument)
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

export async function getInvestorPositions(zohoPartnerId: string) {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/Deals/search?criteria=(Investor_Name:equals:${zohoPartnerId})&fields=${DEAL_FIELDS}&per_page=50`
  const response = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
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
      }))
    }
  } catch (err) {
    console.error('[zoho] getFPClientDetail notes error:', err)
  }

  return {
    ...client,
    messages: allNotes.filter(n => n.noteType === 'FP_Message'),
    timeline: allNotes.filter(n => n.noteType !== 'FP_Message'),
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
    .filter((n: any) => n.Note_Type === 'FP_General_Message')
    .map((n: any): FPNote => ({
      id: n.id,
      body: n.Note_Content ?? '',
      createdTime: n.Created_Time ?? '',
      createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
      noteType: n.Note_Type ?? null,
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
