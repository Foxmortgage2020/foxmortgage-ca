import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getProjects, createProject, updateProject } from '@/lib/zoho-creator'

function adminOnly(roles: string[]): boolean {
  return roles.includes('admin')
}

// GET /api/bookkeeping/projects?status=Active
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const status = req.nextUrl.searchParams.get('status') ?? undefined
    const records = await getProjects(status)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[GET /api/bookkeeping/projects]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/projects — create a new Printhub production project
// Body: { Project_Name, Customer_Name, Contract_Value, Payment_Received_Date,
//         Payment_Received_Amount, Project_Start_Date, Project_End_Date,
//         Recognition_Method, QBO_Deferred_Revenue_Ref?, Notes? }
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    const result = await createProject({
      ...body,
      Status: body.Status ?? 'Active',
      Current_Completion_Percent: body.Current_Completion_Percent ?? 0,
      Revenue_Recognized_To_Date: body.Revenue_Recognized_To_Date ?? 0,
    })
    return NextResponse.json({ result }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bookkeeping/projects]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// PATCH /api/bookkeeping/projects — update project completion / status
// Body: { rowId, Current_Completion_Percent?, Revenue_Recognized_To_Date?, Status?, Notes? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { rowId, ...updates } = await req.json()
    if (!rowId) return NextResponse.json({ error: 'rowId required' }, { status: 400 })

    const result = await updateProject(rowId, updates)
    return NextResponse.json({ result })
  } catch (err) {
    console.error('[PATCH /api/bookkeeping/projects]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
