// The people on a client's team (B5). A LEAF module: it imports nothing but
// lib/contact, and that is the point.
//
// This lives apart from lib/client-file.ts deliberately. client-file reaches
// Zoho, Zoho reaches the demo fixtures, and the fixtures need the agent's
// card — so holding AGENT_MEMBER in client-file created a real import cycle
// (demo-fixtures → client-file → zoho → demo-fixtures) that crashed the page
// at request time while every unit test stayed green. The type and the one
// constant belong somewhere nothing else depends on.

import { CONTACT } from '@/lib/contact'

export interface TeamMember {
  role: 'agent' | 'realtor' | 'lawyer'
  /** What the client calls this person's job, in their words. */
  roleLabel: string
  name: string
  email: string | null
  phone: string | null
  /** Michael's licence line. Only ever set on the agent. */
  licence?: string
}

/**
 * Michael. Always on the team, always first.
 *
 * Contact details come from lib/contact.ts, the single source of truth every
 * support page already reads — never retyped here. A phone number on a
 * client's page is not a detail to improvise.
 */
export const AGENT_MEMBER: TeamMember = {
  role: 'agent',
  roleLabel: 'Your mortgage agent',
  name: 'Michael Fox',
  email: CONTACT.email.address,
  phone: CONTACT.phone.display,
  licence: 'Mortgage Agent Level 2',
}
