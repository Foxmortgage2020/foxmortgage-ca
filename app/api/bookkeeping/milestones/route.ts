import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { getMilestones, createMilestone } from '@/lib/zoho-creator'

function adminOnly(roles: string[]): boolean {
  return roles.includes('admin')
}

// GET /api/bookkeeping/milestones?projectId=123
export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const projectId = req.nextUrl.searchParams.get('projectId') ?? undefined
    const records = await getMilestones(projectId)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('[GET /api/bookkeeping/milestones]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}

// POST /api/bookkeeping/milestones — record a project milestone
// Body: { Project_ID, Milestone_Date, Milestone_Description,
//         Completion_Percent_At_Milestone, Revenue_Recognized_This_Milestone, Notes? }
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const roles = (user.publicMetadata as { roles?: string[] })?.roles || []
    if (!adminOnly(roles)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await req.json()
    if (!body.Project_ID) return NextResponse.json({ error: 'Project_ID required' }, { status: 400 })

    const result = await createMilestone(body)
    return NextResponse.json({ result }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/bookkeeping/milestones]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Server error' }, { status: 500 })
  }
}
