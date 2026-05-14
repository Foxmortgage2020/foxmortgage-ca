import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { updatePartner } from '@/lib/zoho'
import { ONBOARDING_STEPS } from '@/lib/onboarding'

// POST /api/onboard/advance-step
//
// Auth: Clerk user with role=investor. Body:
//   { completionValue: string }  // one of the Last_Onboarding_Step picklist values
//
// Writes Last_Onboarding_Step on the Partner record. If the
// completion value is the final step's ("Submitted for Review"),
// also advances Onboarding_Stage to "Awaiting Review".
//
// Returns { ok: true, lastOnboardingStep } on success.
export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const metadata = (user.publicMetadata ?? {}) as {
      roles?: string[] | string
      role?: string
      zoho_partner_id?: string
    }
    let roles: string[] = []
    if (Array.isArray(metadata.roles)) roles = metadata.roles
    else if (typeof metadata.roles === 'string') roles = [metadata.roles]
    else if (typeof metadata.role === 'string') roles = [metadata.role]
    if (!roles.includes('investor')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const partnerId = metadata.zoho_partner_id
    if (!partnerId) {
      return NextResponse.json({ error: 'No Zoho Partner linked.' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
    }
    const { completionValue } = (body ?? {}) as { completionValue?: unknown }
    if (typeof completionValue !== 'string') {
      return NextResponse.json({ error: 'completionValue required.' }, { status: 400 })
    }
    // Whitelist: only the picklist values we know about can be written.
    const validValues = new Set(ONBOARDING_STEPS.map(s => s.completionValue))
    if (!validValues.has(completionValue)) {
      return NextResponse.json({ error: 'Invalid onboarding step value.' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {
      Last_Onboarding_Step: completionValue,
    }
    // If the investor completed the final "Submit for Review" step,
    // also bump Onboarding_Stage so admin's Partners list/detail
    // surfaces the submission for review.
    if (completionValue === 'Submitted for Review') {
      patch.Onboarding_Stage = 'Awaiting Review'
    }

    await updatePartner(partnerId, patch)

    return NextResponse.json({ ok: true, lastOnboardingStep: completionValue })
  } catch (error) {
    console.error('[POST /api/onboard/advance-step]', new Date().toISOString(), error)
    return NextResponse.json(
      { error: "We couldn't save your progress. Please try again in a moment.", code: 'ZOHO_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
