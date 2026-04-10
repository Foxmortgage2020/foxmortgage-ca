// Server-side only — never import in client components
// Wire up by adding env vars to Vercel:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN
//   ZOHO_ORG_ID

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

// ─── Token Management ─────────────────────────────────────────────────────

export async function getZohoToken(): Promise<string> {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Zoho token error: ${JSON.stringify(data)}`)
  return data.access_token
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

export async function getInvestorOpportunities() {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/Deals/search?criteria=(Deal_Status_Investor:equals:Available)&fields=${DEAL_FIELDS}&per_page=50`
  const response = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!response.ok) {
    const text = await response.text()
    console.error('[zoho] getInvestorOpportunities error:', response.status, text.substring(0, 200))
    return []
  }
  const data = await response.json()
  return data.data || []
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

export async function getFPMessages(fpEmail: string): Promise<FPNote[]> {
  const token = await getZohoToken()

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

  return (notesData.data ?? [])
    .filter((n: any) => n.Note_Type === 'FP_General_Message')
    .map((n: any): FPNote => ({
      id: n.id,
      body: n.Note_Content ?? '',
      createdTime: n.Created_Time ?? '',
      createdBy: typeof n.Created_By === 'object' ? (n.Created_By?.name ?? 'Michael Fox') : (n.Created_By ?? 'Michael Fox'),
      noteType: n.Note_Type ?? null,
    }))
}

export async function getFPDashboardStats(fpZohoId: string) {
  const token = await getZohoToken()

  const criteria = encodeURIComponent(`(Referral_Partner:equals:${fpZohoId})`)
  const fields = 'Stage,Amount,Closing_Date'
  const url = `${ZOHO_API}/Potentials/search?criteria=${criteria}&fields=${fields}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })

  const empty = {
    totalReferrals: 0, activeMonitoring: 0, closedMortgages: 0,
    fundedVolume: 0, leadToClose: 0, savingsYTD: 0, mortgagesUnderMgmt: 0,
  }

  if (res.status === 204) return empty
  if (!res.ok) {
    const text = await res.text()
    console.error('[zoho] getFPDashboardStats error:', res.status, 'url:', url, 'body:', text.substring(0, 500))
    throw new ZohoError(res.status, text)
  }
  const data = await res.json()
  const deals: any[] = data.data ?? []
  if (deals.length === 0) return empty

  // Stage-based classification — exact Zoho picklist values.
  // Funded = Stage is "Mortgage Funded"
  // Lost = Stage is "Mortgage Lost" (or legacy cancelled/declined)
  // Active = everything else (all stages 1-8 in progress)
  const isFunded = (s: string) => s === 'Mortgage Funded' || s.toLowerCase().includes('funded')
  const isLost   = (s: string) =>
    s === 'Mortgage Lost' ||
    s.toLowerCase().includes('lost') ||
    s.toLowerCase().includes('cancelled') ||
    s.toLowerCase().includes('declined')

  const funded = deals.filter(d => isFunded(d.Stage ?? ''))
  const active = deals.filter(d => {
    const s = d.Stage ?? ''
    return !isFunded(s) && !isLost(s)
  })

  // Total Funded = sum Amount of Mortgage Funded deals (scoped to this FP via criteria)
  const totalFunded = funded.reduce((sum: number, d: any) => sum + (Number(d.Amount) || 0), 0)

  // Total Referred Value = sum Amount across ALL of this FP's referred files
  // (criteria=(Referral_Partner:equals:fpZohoId) already scopes the query)
  const totalReferredValue = deals.reduce((sum: number, d: any) => sum + (Number(d.Amount) || 0), 0)

  // Lead-to-Close % = funded / total referrals (0 if none funded yet — correct for Ben)
  const leadToClose = deals.length > 0
    ? Math.round((funded.length / deals.length) * 1000) / 10
    : 0

  return {
    totalReferrals: deals.length,
    activeMonitoring: active.length,     // now "Files In Progress" in UI
    closedMortgages: funded.length,      // now "Funded Mortgages" in UI
    fundedVolume: totalFunded,           // now "Total Funded" in UI
    leadToClose,
    savingsYTD: 0,                        // Savings_Identified field not on Potentials module
    mortgagesUnderMgmt: totalReferredValue, // now "Total Referred Value" in UI
  }
}
