// POST /api/portal/admin/people/provision (Session 8)
//
// The wizard's one write path. Gated on people.manage (admin-only
// baseline); the agent flow additionally checks agents.provision (the
// gates contract key). Order is fixed and honest:
//   1. Validate (lib/provisioning.ts, pure and unit-tested). Partner ids
//      are re-checked against the live Zoho partner list — the id was
//      picked, never typed, and we verify it still resolves to the
//      chosen kind.
//   2. Create the Clerk user with roles stamped (lib/people.ts).
//   3. Agent only: the workbench half through POST /api/gates/agents,
//      with the browser-minted token forwarded (x-gates-token). A gates
//      failure does NOT roll back the Clerk half — the response says
//      exactly which half exists.
//   4. Send the invitation email (Resend, noreply@app.foxmortgage.ca)
//      when asked to.
//   5. Record who provisioned whom in FOXCA (people_provisioning).
// Nothing here logs tokens or metadata payloads.

import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { apiPermission, can } from '@/lib/authz'
import {
  validateProvisionInput,
  clerkMetadataFor,
  rolesFor,
} from '@/lib/provisioning'
import { createProvisionedUser } from '@/lib/people'
import { provisionWorkbenchAgent, type AgentSetupRemainingItem } from '@/lib/gates'
import { recordProvisioning } from '@/lib/people-store'
import { getPartnerConfigByZohoType, getPartnerConfigByKind } from '@/lib/partner-types'
import { listAllPartners } from '@/lib/zoho'

export const dynamic = 'force-dynamic'

async function sendInviteEmail(input: {
  to: string
  name: string
}): Promise<boolean> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const firstName = input.name.trim().split(/\s+/)[0] || 'there'
    const { error } = await resend.emails.send({
      from: 'Fox Mortgage <noreply@app.foxmortgage.ca>',
      to: input.to,
      subject: 'Your Fox Mortgage portal access',
      text: [
        `Hi ${firstName},`,
        '',
        'Your Fox Mortgage portal account is ready.',
        '',
        'To sign in the first time:',
        '1. Go to https://www.foxmortgage.ca/portal/sign-in',
        '2. Choose "Forgot password" and enter this email address to set your password.',
        '3. Sign in.',
        '',
        'If anything looks off, reply to mfox@foxmortgage.ca.',
        '',
        'Michael Fox',
        'Mortgage Agent, Level 2 · BRX Mortgage · FSRA 13463',
      ].join('\n'),
    })
    if (error) {
      console.error('[people/provision] invite email failed')
      return false
    }
    return true
  } catch {
    console.error('[people/provision] invite email threw')
    return false
  }
}

export async function POST(req: Request) {
  const gate = await apiPermission('people.manage')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 })
  }

  const validated = validateProvisionInput(body)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message }, { status: 422 })
  }
  const input = validated.value

  // Agent flow rides the agents.provision contract key as well.
  if (input.personType === 'agent' && !can(gate.user, 'agents.provision')) {
    return NextResponse.json(
      { error: 'You do not have permission to provision agents.' },
      { status: 403 },
    )
  }

  // Partner: re-verify the picked id against live Zoho (exists + type
  // matches the chosen kind). The picker made the id un-typeable; this
  // makes it un-spoofable.
  if (input.personType === 'partner') {
    let partners
    try {
      partners = await listAllPartners()
    } catch {
      return NextResponse.json(
        { error: 'Could not verify the partner against Zoho right now. Try again in a moment.' },
        { status: 503 },
      )
    }
    const record = partners.find(p => p.id === input.zohoPartnerId)
    const config = record ? getPartnerConfigByZohoType(record.partnerType) : null
    if (!record || !config || config.kind !== input.partnerKind) {
      return NextResponse.json(
        { error: 'That Zoho partner does not exist or is not the selected partner type.' },
        { status: 422 },
      )
    }
  }

  // 2. Clerk half.
  const nameParts = input.name.trim().split(/\s+/)
  const created = await createProvisionedUser({
    email: input.email,
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' '),
    publicMetadata: clerkMetadataFor(input),
  })
  if (!created.ok) {
    return NextResponse.json({ error: created.message }, { status: created.status })
  }

  // 3. Workbench half (agent only). Failure is reported, never hidden,
  // and never rolls back the Clerk half.
  let workbenchAgentId: string | null = null
  let setupRemaining: AgentSetupRemainingItem[] | null = null
  let workbenchError: string | null = null
  if (input.personType === 'agent') {
    const result = await provisionWorkbenchAgent(
      {
        name: input.name,
        email: input.email,
        fsraLicence: input.fsraLicence,
        officePhone: input.officePhone,
      },
      req.headers.get('x-gates-token'),
    )
    if (result.ok) {
      workbenchAgentId = result.data.agentId
      setupRemaining = result.data.setup_remaining ?? []
    } else {
      workbenchError =
        result.kind === 'conflict'
          ? 'A workbench agents row with this email already exists — the Clerk half was created; reconcile workbench-side.'
          : result.message
    }
  }

  // 4. Invitation.
  let inviteSent = false
  if (input.sendInvite) {
    inviteSent = await sendInviteEmail({ to: input.email, name: input.name })
  }

  // 5. FOXCA record. A store outage is reported but does not undo the
  // provisioning that already happened.
  const recorded = await recordProvisioning({
    actor: gate.user.email,
    clerkUserId: created.clerkUserId,
    email: input.email,
    name: input.name,
    personType: input.personType,
    roles: rolesFor(input),
    zohoPartnerId: input.personType === 'partner' ? input.zohoPartnerId : null,
    workbenchAgentId,
    setupRemaining,
    inviteSent,
  })
  const recordId = recorded.configured && recorded.ok ? recorded.data : null
  if (!recordId) {
    console.error('[people/provision] FOXCA record did not land')
  }

  return NextResponse.json({
    ok: true,
    clerkUserId: created.clerkUserId,
    roles: rolesFor(input),
    portalDashboard:
      input.personType === 'partner'
        ? getPartnerConfigByKind(input.partnerKind).portalDashboard
        : '/portal/admin',
    workbenchAgentId,
    setupRemaining,
    workbenchError,
    inviteSent,
    recordId,
    recordWarning: recordId ? null : 'The provisioning record did not land in FOXCA — note this manually.',
  })
}
