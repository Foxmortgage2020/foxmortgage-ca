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

const FP_DEAL_FIELDS = [
  'Deal_Name', 'Contact_Name', 'Amount', 'Mortgage_Rate', 'Stage',
  'City', 'Province', 'Mortgage_Type', 'Term_Years', 'Payment_Frequency',
  'Closing_Date', 'Last_Activity_Time', 'Next_Review_Date', 'Savings_Identified',
  'FP_Email', 'Description',
].join(',')

export interface FPClient {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: string | null
  stage: string
  city: string | null
  province: string | null
  mortgageType: string | null
  termYears: string | null
  paymentFrequency: string | null
  closingDate: string | null
  lastActivity: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  fpEmail: string | null
  description: string | null
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

function normalizeFPClient(r: any): FPClient {
  return {
    id: r.id,
    dealName: r.Deal_Name ?? '',
    contactName: typeof r.Contact_Name === 'object' ? (r.Contact_Name?.name ?? '') : (r.Contact_Name ?? ''),
    amount: r.Amount ?? null,
    mortgageRate: r.Mortgage_Rate ?? null,
    stage: r.Stage ?? '',
    city: r.City ?? null,
    province: r.Province ?? null,
    mortgageType: r.Mortgage_Type ?? null,
    termYears: r.Term_Years != null ? String(r.Term_Years) : null,
    paymentFrequency: r.Payment_Frequency ?? null,
    closingDate: r.Closing_Date ?? null,
    lastActivity: r.Last_Activity_Time ?? null,
    nextReviewDate: r.Next_Review_Date ?? null,
    savingsIdentified: r.Savings_Identified != null ? String(r.Savings_Identified) : null,
    fpEmail: r.FP_Email ?? null,
    description: r.Description ?? null,
  }
}

export async function getFPClients(fpEmail: string): Promise<FPClient[]> {
  const token = await getZohoToken()
  const criteria = encodeURIComponent(`(FP_Email:equals:${fpEmail})`)
  const url = `${ZOHO_API}/Deals/search?criteria=${criteria}&fields=${FP_DEAL_FIELDS}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (res.status === 204) return []
  if (!res.ok) {
    const text = await res.text()
    console.error('[zoho] getFPClients error:', res.status, text.substring(0, 200))
    return []
  }
  const data = await res.json()
  return (data.data ?? []).map(normalizeFPClient)
}

export async function getFPClientDetail(dealId: string): Promise<FPClientDetail | null> {
  const token = await getZohoToken()

  // Fetch the deal record
  const dealRes = await fetch(`${ZOHO_API}/Deals/${dealId}?fields=${FP_DEAL_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  if (!dealRes.ok) {
    console.error('[zoho] getFPClientDetail deal error:', dealRes.status)
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
      `${ZOHO_API}/Deals/${dealId}/Notes?per_page=50&sort_by=Created_Time&sort_order=asc`,
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

export async function getFPDashboardStats(fpEmail: string) {
  const token = await getZohoToken()

  const criteria = encodeURIComponent(`(FP_Email:equals:${fpEmail})`)
  const fields = 'Stage,Amount,Savings_Identified,Closing_Date'
  const url = `${ZOHO_API}/Deals/search?criteria=${criteria}&fields=${fields}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })

  const empty = {
    totalReferrals: 0, activeMonitoring: 0, closedMortgages: 0,
    fundedVolume: 0, leadToClose: 0, savingsYTD: 0, mortgagesUnderMgmt: 0,
  }

  if (!res.ok || res.status === 204) return empty
  const data = await res.json()
  const deals: any[] = data.data ?? []
  if (deals.length === 0) return empty

  const closedWon = deals.filter(d => (d.Stage ?? '').toLowerCase().includes('closed won'))
  const active = deals.filter(d => !(d.Stage ?? '').toLowerCase().includes('closed'))
  const fundedVolume = closedWon.reduce((sum: number, d: any) => sum + (Number(d.Amount) || 0), 0)
  const mortgagesUnderMgmt = active.reduce((sum: number, d: any) => sum + (Number(d.Amount) || 0), 0)
  const leadToClose = deals.length > 0
    ? Math.round((closedWon.length / deals.length) * 1000) / 10
    : 0

  // Savings_Identified: sum only if numeric values present
  const currentYear = new Date().getFullYear().toString()
  const savingsYTD = deals
    .filter(d => d.Closing_Date?.startsWith(currentYear))
    .reduce((sum: number, d: any) => {
      const val = Number(d.Savings_Identified)
      return sum + (isNaN(val) ? 0 : val)
    }, 0)

  return {
    totalReferrals: deals.length,
    activeMonitoring: active.length,
    closedMortgages: closedWon.length,
    fundedVolume,
    leadToClose,
    savingsYTD,
    mortgagesUnderMgmt,
  }
}
