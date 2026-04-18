#!/usr/bin/env npx ts-node --skip-project
/**
 * seed-bookkeeping-rules.ts
 *
 * Loads the initial 10 bookkeeping rules into Master_Bookkeeping_Rules
 * in the Zoho Creator bookkeeping app.
 *
 * Usage:
 *   ZOHO_CREATOR_CLIENT_ID=... ZOHO_CREATOR_CLIENT_SECRET=... ZOHO_CREATOR_REFRESH_TOKEN=... \
 *     npx ts-node --skip-project scripts/seed-bookkeeping-rules.ts
 *
 * Or copy env vars from Vercel and run:
 *   npx vercel env pull .env.local && source .env.local && npx ts-node --skip-project scripts/seed-bookkeeping-rules.ts
 *
 * Prerequisite: Master_Bookkeeping_Rules form must exist in Zoho Creator
 *   at creator.zoho.com/2802551ontarioinc/bookkeeping
 *   Form fields:
 *     Vendor_Regex (text), Account_Name (text), Memo_Tag (picklist: FOXM/PHUB/FSOC/TLB/OVHD),
 *     Confidence (decimal 0-1), Active (boolean), Hit_Count (decimal)
 */

const CREATOR_BASE = 'https://creator.zoho.com/api/v2/2802551ontarioinc/bookkeeping'

const SEED_RULES = [
  {
    Vendor_Regex: 'BRX Mortgage|BRX MORTGAGE INC',
    Account_Name: 'Fox Mortgage - Commission Income',
    Memo_Tag: 'FOXM',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'stripe.*fox social',
    Account_Name: 'Fox Social - Subscription Revenue',
    Memo_Tag: 'FSOC',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'zoho',
    Account_Name: 'Software Subscriptions',
    Memo_Tag: 'OVHD',
    Confidence: 0.9,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'vercel',
    Account_Name: 'Software Subscriptions',
    Memo_Tag: 'OVHD',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'openrouter|anthropic',
    Account_Name: 'Software Subscriptions',
    Memo_Tag: 'OVHD',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'shell|esso|petro-canada|petrocanada',
    Account_Name: 'Gas',
    Memo_Tag: 'FOXM',
    Confidence: 0.8,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'rogers|bell canada',
    Account_Name: 'Telephone',
    Memo_Tag: 'OVHD',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'creatomate|elevenlabs|heygen|supadata',
    Account_Name: 'Software Subscriptions',
    Memo_Tag: 'FSOC',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'cloudflare|resend.com',
    Account_Name: 'Software Subscriptions',
    Memo_Tag: 'OVHD',
    Confidence: 1.0,
    Active: true,
    Hit_Count: 0,
  },
  {
    Vendor_Regex: 'google.*workspace|google.*cloud',
    Account_Name: 'Software Subscriptions',
    Memo_Tag: 'OVHD',
    Confidence: 0.95,
    Active: true,
    Hit_Count: 0,
  },
]

async function getCreatorToken(): Promise<string> {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_CREATOR_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CREATOR_CLIENT_ID!,
      client_secret: process.env.ZOHO_CREATOR_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string }
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`)
  return data.access_token
}

async function seedRules() {
  if (!process.env.ZOHO_CREATOR_REFRESH_TOKEN) {
    console.error('❌  Missing ZOHO_CREATOR_REFRESH_TOKEN — load env vars first')
    process.exit(1)
  }

  console.log('🔑  Getting Creator token...')
  const token = await getCreatorToken()
  const headers = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  }

  // Check existing rules to avoid duplicates
  console.log('📋  Fetching existing rules...')
  const existingRes = await fetch(`${CREATOR_BASE}/report/All_Master_Bookkeeping_Rules`, { headers })
  const existingData = await existingRes.json() as { data?: Array<{ Vendor_Regex: string }> }
  const existingRegexes = new Set(
    (existingData.data || []).map((r) => r.Vendor_Regex?.toLowerCase())
  )
  console.log(`   Found ${existingRegexes.size} existing rules`)

  let created = 0
  let skipped = 0

  for (const rule of SEED_RULES) {
    if (existingRegexes.has(rule.Vendor_Regex.toLowerCase())) {
      console.log(`⏭   Skipping (already exists): ${rule.Vendor_Regex}`)
      skipped++
      continue
    }

    const res = await fetch(`${CREATOR_BASE}/form/Master_Bookkeeping_Rules/record`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: rule }),
    })
    const data = await res.json() as { code?: string; message?: string }

    if (res.ok && data.code === '3000') {
      console.log(`✅  Created: ${rule.Vendor_Regex} → ${rule.Account_Name} [${rule.Memo_Tag}]`)
      created++
    } else {
      console.error(`❌  Failed:  ${rule.Vendor_Regex} — ${data.code}: ${data.message}`)
    }

    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log(`\n✨  Done. Created: ${created}, Skipped: ${skipped}`)
}

seedRules().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
