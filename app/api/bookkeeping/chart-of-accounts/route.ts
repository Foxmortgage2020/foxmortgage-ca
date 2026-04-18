import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'

// Cached QBO Chart of Accounts for sandbox realm 9341456901231490
// Fetched from QBO on demand and cached in-memory for 1 hour.
// Replace SANDBOX_COA_CACHE with a Zoho Creator fetch once QBO OAuth is live.

let _coaCache: CoAAccount[] | null = null
let _coaCacheExpiry = 0

interface CoAAccount {
  id: string
  name: string
  accountType: string
  accountSubType: string
  active: boolean
  fullyQualifiedName: string
}

// Known sandbox accounts from FOX-106 (seeded manually):
const SEEDED_SANDBOX_ACCOUNTS: CoAAccount[] = [
  { id: '1150040000', name: 'Fox Social - Subscription Revenue',    accountType: 'Income',     accountSubType: 'ServiceFeeIncome',        active: true, fullyQualifiedName: 'Fox Social - Subscription Revenue' },
  { id: '1150040001', name: 'Left Bench - Coaching Revenue',        accountType: 'Income',     accountSubType: 'ServiceFeeIncome',        active: true, fullyQualifiedName: 'Left Bench - Coaching Revenue' },
  { id: '1150040002', name: 'Left Bench - Platform Revenue',        accountType: 'Income',     accountSubType: 'ServiceFeeIncome',        active: true, fullyQualifiedName: 'Left Bench - Platform Revenue' },
  { id: '1150040003', name: 'Deferred Revenue',                     accountType: 'OtherCurrentLiability', accountSubType: 'DeferredRevenue', active: true, fullyQualifiedName: 'Deferred Revenue' },
  { id: '1150040004', name: 'Printhub - Product Revenue',           accountType: 'Income',     accountSubType: 'SalesOfProductIncome',   active: true, fullyQualifiedName: 'Printhub - Product Revenue' },
  { id: '1150040005', name: 'Fox Mortgage - Commission Income',     accountType: 'Income',     accountSubType: 'ServiceFeeIncome',        active: true, fullyQualifiedName: 'Fox Mortgage - Commission Income' },
  // Standard QBO expense accounts
  { id: 'software_subscriptions', name: 'Software Subscriptions',   accountType: 'Expense',    accountSubType: 'OtherMiscellaneousServiceCost', active: true, fullyQualifiedName: 'Software Subscriptions' },
  { id: 'gas',                    name: 'Gas',                      accountType: 'Expense',    accountSubType: 'Fuel',                   active: true, fullyQualifiedName: 'Gas' },
  { id: 'telephone',              name: 'Telephone',                accountType: 'Expense',    accountSubType: 'Telephone',              active: true, fullyQualifiedName: 'Telephone' },
]

async function fetchQBOChartOfAccounts(): Promise<CoAAccount[]> {
  // When QBO OAuth is wired in n8n, this will call:
  //   GET https://sandbox-quickbooks.api.intuit.com/v3/company/9341456901231490/query
  //   ?query=SELECT * FROM Account WHERE Active = true MAXRESULTS 200
  // For now, return the seeded sandbox accounts.
  return SEEDED_SANDBOX_ACCOUNTS
}

// GET /api/bookkeeping/chart-of-accounts
// Returns cached Chart of Accounts (refreshes every 60 minutes)
export async function GET(_req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (_coaCache && Date.now() < _coaCacheExpiry) {
      return NextResponse.json({ accounts: _coaCache, cached: true })
    }

    _coaCache = await fetchQBOChartOfAccounts()
    _coaCacheExpiry = Date.now() + 60 * 60 * 1000 // 1 hour
    return NextResponse.json({ accounts: _coaCache, cached: false })
  } catch (err) {
    console.error('[GET /api/bookkeeping/chart-of-accounts]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/chart-of-accounts/refresh — bust the cache (admin only)
// Called by n8n after adding new QBO accounts
export async function POST(_req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!roles.includes('admin')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    _coaCache = null
    _coaCacheExpiry = 0
    const accounts = await fetchQBOChartOfAccounts()
    _coaCache = accounts
    _coaCacheExpiry = Date.now() + 60 * 60 * 1000
    return NextResponse.json({ accounts, refreshed: true })
  } catch (err) {
    console.error('[POST /api/bookkeeping/chart-of-accounts]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
