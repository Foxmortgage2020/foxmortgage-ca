// Authority matrix — the single versioned source of who may do what in the
// admin command center. Session 2's gates API (fox-underwriting repo) will
// enforce the SAME permission keys server-side, so treat key names as a
// contract: additive changes only; renames require a CLAUDE.md note.
//
// This module is intentionally pure and isomorphic (no Clerk, no next/*
// imports) so both server layouts and client nav components can consume it.
// Server-side permission checks live in lib/authz.ts (can, requirePermission).

export const ROLES = ['admin', 'ops', 'underwriting-reviewer', 'agent'] as const

export type Role = (typeof ROLES)[number]

// ── Session 8 shipped role baselines ──────────────────────────────────────
// The default grants Michael reviews and edits later; recorded here as the
// deliberate day-one surface for each role:
//   ops                    — deals.view, compliance.view, knowledge.view,
//                            status.view, roadmap.view. Sees conditions
//                            inside deal rooms but holds no decide keys.
//   underwriting-reviewer  — everything ops has, PLUS approvals.view (sees
//                            the queues, cannot decide) and agent.use
//                            (Ask Fox reads; agent.execute stays admin so
//                            confirm cards never execute under this role).
//   agent                  — their own scope: deals.view, knowledge.view,
//                            agent.use, roadmap.view.
// Decision keys (statement/ratesheet/flags/shadow/conditions decide,
// agent.execute, compliance.manage, status.acknowledge) and provisioning
// keys (people.manage, agents.provision, partners.provision,
// portals.view-as) stay admin-only.
export const PERMISSIONS = {
  'approvals.statement.decide': ['admin'],
  'approvals.ratesheet.decide': ['admin'],
  'approvals.offer.decide': ['admin'],
  'flags.disposition': ['admin'],
  'shadow.score': ['admin'],
  // Session 4, matching the gates API contract (micro-session 2):
  'conditions.decide': ['admin'],
  'deals.view': ['admin', 'ops', 'underwriting-reviewer', 'agent'],
  // Session 8: underwriting-reviewer joins ops on the compliance view
  // (baseline rule: UR is a superset of ops).
  'compliance.view': ['admin', 'ops', 'underwriting-reviewer'],
  // Session 6: compliance records live in this repo's own FOXCA project;
  // writing them (credentials, complaints, policies, acknowledgments) is
  // admin only. Records never delete; they retire with history.
  'compliance.manage': ['admin'],
  // Agent session: Ask Fox. agent.use gates the chat; Session 8 widened it
  // to underwriting-reviewer and agent per the shipped baseline.
  // agent.execute gates confirm-card execution (the Zoho writes) and stays
  // admin even though agent.use has widened.
  'agent.use': ['admin', 'underwriting-reviewer', 'agent'],
  'agent.execute': ['admin'],
  'audit.view': ['admin'],
  'partners.provision': ['admin'],
  'portals.view-as': ['admin'],
  'settings.manage': ['admin'],
  // Session 8: provisioning and offboarding people (the wizard, the people
  // list, disable-and-checklist). Admin only, two-tap confirmed in the UI.
  'people.manage': ['admin'],
  // Session 8: the workbench half of agent provisioning — POST
  // /api/gates/agents (fox-underwriting micro-session 4). Key name is a
  // CONTRACT with that API; admin only on both sides.
  'agents.provision': ['admin'],
  // Session 9: demo mode — swaps the command center to bundled fictional
  // fixtures (zero real reads) for recruiting. Admin only, and additionally
  // fenced by the DEMO_MODE_ENABLED env flag so it cannot be turned on in a
  // project where the flag is unset.
  'demo.mode': ['admin'],
  // ── Additive view keys (Session 1) ─────────────────────────────────────
  // Nav and page gating for sections the original matrix carries no key
  // for. All seeded admin-only except where a broader default is safe.
  // Session 8: underwriting-reviewer gains approvals visibility (the
  // queues render; every decide control stays behind the decide keys).
  'approvals.view': ['admin', 'underwriting-reviewer'],
  'rates.view': ['admin'],
  'intel.view': ['admin'],
  // Widened Session 4 to every internal role, matching the gates API
  // contract (knowledge is reference material, not tenant data).
  'knowledge.view': ['admin', 'ops', 'underwriting-reviewer', 'agent'],
  'revenue.view': ['admin'],
  // Session (Renewal Radar): the renewals page carries client PII (names,
  // rates, balances), so it stays admin-only. renewals.decide gates the
  // enumerated status writes (same admin-only posture as the other decide
  // keys), written through the confirmed-action Zoho write path.
  'renewals.view': ['admin'],
  'renewals.decide': ['admin'],
  // Session (SMM Opportunities): the opportunities board carries client PII
  // (monitored mortgages), so it stays admin-only. opportunities.manage gates
  // the CSV upload, the Zoho backfill proposals/executes, and the portal-side
  // opportunity status writes.
  'opportunities.view': ['admin'],
  'opportunities.manage': ['admin'],
  // Session (lender eligibility + constraints): per-client lender constraints
  // and restricted-product pin confirmations are client-facing decisions, so
  // admin only. Reads are gated on rates.view (the surfaces that show them).
  'constraints.manage': ['admin'],
  'status.view': ['admin', 'ops', 'underwriting-reviewer'],
  // Session 4: acknowledging a triaged form-intake failure is a write on
  // this repo's own FOXCA project; admin only.
  'status.acknowledge': ['admin'],
  'bookkeeping.view': ['admin'],
  'roadmap.view': ['admin', 'ops', 'underwriting-reviewer', 'agent'],
} as const satisfies Record<string, readonly Role[]>

// Plain-language label per permission key, used by the Settings
// effective-access view and the provisioning wizard's grant preview.
// Every key in PERMISSIONS must appear here (unit-tested).
export const PERMISSION_LABELS: Record<Permission, string> = {
  'approvals.statement.decide': 'Decide statement reviews (approve / hold / reject)',
  'approvals.ratesheet.decide': 'Decide rate sheet reviews',
  'approvals.offer.decide': 'Decide promotional offers (approve / reject)',
  'flags.disposition': 'Dispose flags',
  'shadow.score': 'Score shadow dimensions',
  'conditions.decide': 'Decide conditions (satisfied / moot / waived)',
  'deals.view': 'See deals, deal rooms, and conditions',
  'compliance.view': 'See the compliance module and per-file compliance cards',
  'compliance.manage': 'Write compliance records (credentials, complaints, policies)',
  'agent.use': 'Use Ask Fox (reads and drafts only)',
  'agent.execute': 'Execute Ask Fox confirm cards (the CRM writes)',
  'audit.view': 'See the audit log and the view-as log',
  'partners.provision': 'Manage partners (directory, invites, documents)',
  'portals.view-as': 'Open any partner portal read-only (view-as)',
  'settings.manage': 'See Settings and the authority matrix',
  'people.manage': 'Provision and offboard people (staff, partners, agents)',
  'agents.provision': 'Create the workbench half of a new agent (Gates API)',
  'demo.mode': 'Switch the command center to fictional demo data',
  'approvals.view': 'See the approval queues',
  'rates.view': 'See rates, scenarios, and the compare tray',
  'intel.view': 'See the lender intel feed',
  'knowledge.view': 'See lender knowledge and the changelog',
  'revenue.view': 'See revenue, forecast, and the comp model',
  'renewals.view': 'See the Renewal Radar (funded deals by maturity window)',
  'renewals.decide': 'Record a renewal status action (writes to Zoho)',
  'opportunities.view': 'See the Strategic Mortgage Monitoring opportunity board',
  'opportunities.manage': 'Upload the monitoring export, backfill Zoho, and set opportunity status',
  'constraints.manage': 'Record and retire per-client lender constraints and restricted-product pin confirmations',
  'status.view': 'See platform status',
  'status.acknowledge': 'Acknowledge form-intake failures',
  'bookkeeping.view': 'See bookkeeping pages',
  'roadmap.view': 'See the roadmap',
}

export type Permission = keyof typeof PERMISSIONS

// Normalize the role shapes that exist in production Clerk publicMetadata.
// Three shapes are live and all must resolve to string[]:
//   1. roles: ['financial-planner']   (plural key, array)
//   2. roles: 'investor'              (plural key, bare string)
//   3. role:  'admin'                 (legacy singular key)
// Unknown values degrade to an empty grant set — never a crash, never access.
export function normalizeRoles(metadata: {
  roles?: unknown
  role?: unknown
}): string[] {
  const raw = metadata?.roles
  if (Array.isArray(raw)) return raw.filter((r): r is string => typeof r === 'string')
  if (typeof raw === 'string' && raw.length > 0) return [raw]
  if (typeof metadata?.role === 'string' && metadata.role.length > 0) return [metadata.role]
  return []
}

// Pure permission check. Roles outside the known matrix simply grant
// nothing; permissions outside the matrix deny by default.
export function roleCan(roles: readonly string[], permission: Permission): boolean {
  const allowed = PERMISSIONS[permission] as readonly string[] | undefined
  if (!allowed) return false
  return roles.some(r => allowed.includes(r))
}
