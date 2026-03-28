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
  'Deal_Status_Investor', 'Mortgage_Type', 'Mortgage_Rate', 'Payment_Amount',
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
