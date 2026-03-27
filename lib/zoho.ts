// Server-side only — never import in client components
// Wire up by adding env vars to Vercel:
//   ZOHO_CLIENT_ID
//   ZOHO_CLIENT_SECRET
//   ZOHO_REFRESH_TOKEN

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

async function getZohoToken(): Promise<string> {
  const res = await fetch(
    `https://accounts.zoho.com/oauth/v2/token?refresh_token=${process.env.ZOHO_REFRESH_TOKEN}&client_id=${process.env.ZOHO_CLIENT_ID}&client_secret=${process.env.ZOHO_CLIENT_SECRET}&grant_type=refresh_token`,
    { method: 'POST' }
  )
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to get Zoho token')
  return data.access_token
}

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
