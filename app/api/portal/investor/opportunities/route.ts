import { currentUser } from '@clerk/nextjs/server'
import { getZohoToken } from '@/lib/zoho'

export async function GET() {
  try {
    const user = await currentUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = await getZohoToken()

    const fields = [
      'Deal_Name', 'Amount', 'Mortgage_Type', 'Mortgage_Rate',
      'Investor_Rate', 'Payment_Amount', 'City', 'Province',
      'Street', 'LTV', 'Purchase_Price_Value', 'Maturity_Date',
      'Exit_Strategy', 'Lender_Notes', 'Rate_Type', 'Term_Type',
      'Deal_Status_Investor', 'Stage', 'Closing_Date'
    ].join(',')

    const url = `https://www.zohoapis.com/crm/v2/Deals/search?criteria=(Deal_Status_Investor:equals:Available)&fields=${fields}&per_page=10`

    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })

    // Zoho returns 204 No Content when no records match
    if (res.status === 204 || res.status === 404) {
      return Response.json({ data: [] })
    }

    if (!res.ok) {
      const text = await res.text()
      console.error('Zoho opportunities error:', res.status, text)
      return Response.json({ data: [] })
    }

    const text = await res.text()
    if (!text || text.trim() === '') {
      return Response.json({ data: [] })
    }

    const json = JSON.parse(text)
    const records = json.data || []

    return Response.json({ data: records })
  } catch (error) {
    console.error('Opportunities error:', error)
    return Response.json({ data: [] })
  }
}
