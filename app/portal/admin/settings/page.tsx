// Settings: Session 1 renders the authority matrix read-only. The matrix
// itself lives in config/authority.ts (versioned, additive-only key names);
// Session 2's gates API enforces the same keys server-side.

import Link from 'next/link'
import { requirePermission, can } from '@/lib/authz'
import { PERMISSIONS, ROLES, type Role } from '@/config/authority'
import { effectiveAccess } from '@/lib/effective-access'
import { isDemoMode, demoModeAvailable } from '@/lib/demo'
import NotificationSettings from '@/components/admin/NotificationSettings'
import CommsSettings from '@/components/admin/CommsSettings'
import DemoToggle from '@/components/admin/DemoToggle'

export const dynamic = 'force-dynamic'

// Keys added in Session 1 beyond the original matrix (nav/page view gates).
const SESSION_1_ADDITIVE_KEYS = new Set([
  'approvals.view',
  'rates.view',
  'intel.view',
  'knowledge.view',
  'revenue.view',
  'status.view',
  'bookkeeping.view',
  'roadmap.view',
])

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { role?: string }
}) {
  const user = await requirePermission('settings.manage')
  const permissionKeys = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]

  // Effective-access role picker: URL is the state (?role=ops). Unknown
  // values fall back to ops — the first non-admin role Michael will hire.
  const pickedRole: Role = (ROLES as readonly string[]).includes(searchParams.role ?? '')
    ? (searchParams.role as Role)
    : 'ops'
  const access = effectiveAccess(pickedRole)
  const reachablePages = access.pages.filter(p => p.allowed)
  const allowedActions = access.actions.filter(a => a.allowed)
  const deniedActions = access.actions.filter(a => !a.allowed)

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Settings</h1>
        <p className="text-cool-500 font-ui text-sm mt-1">
          Authority matrix, read-only. Source: config/authority.ts. Roles come from Clerk
          publicMetadata and are assigned through{' '}
          <Link href="/portal/admin/settings/people" className="text-navy underline hover:text-ink">
            People
          </Link>{' '}
          (Session 8) or the Clerk dashboard.
        </p>
      </div>

      <div className="bg-white border border-cool-200 rounded-[9px] p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-navy font-bold text-base">People</h2>
            <p className="text-cool-500 font-ui text-sm mt-0.5">
              Everyone with access: roles, last sign-in, provisioned-by. Provisioning wizard
              and offboarding live here.
            </p>
          </div>
          <Link
            href="/portal/admin/settings/people"
            className="bg-navy text-white font-heading font-bold text-sm px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors"
          >
            Open People
          </Link>
        </div>
      </div>

      <div className="bg-white border border-cool-200 rounded-[9px] p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Who may do what</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-ui min-w-[560px]">
            <thead>
              <tr className="text-left font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600">
                <th className="py-2 pr-4 font-semibold">Permission</th>
                {ROLES.map(r => (
                  <th key={r} className="py-2 px-3 font-semibold text-center">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionKeys.map(key => (
                <tr key={key} className="border-t border-cool-100">
                  <td className="py-2 pr-4">
                    <code className="text-xs text-navy">{key}</code>
                    {SESSION_1_ADDITIVE_KEYS.has(key) && (
                      <span className="ml-2 text-[10px] bg-cool-100 text-cool-500 px-1.5 py-0.5 rounded">
                        added S1
                      </span>
                    )}
                  </td>
                  {ROLES.map(role => {
                    const allowed = (PERMISSIONS[key] as readonly string[]).includes(role)
                    return (
                      <td key={role} className="py-2 px-3 text-center">
                        {allowed ? (
                          <span className="font-bold text-green-600">&#10003;</span>
                        ) : (
                          <span className="text-cool-300">&middot;</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-cool-100 text-xs text-cool-500 font-ui space-y-1">
          <p>
            Key names are a contract with the Session 2 gates API: additive changes only; renames
            require a CLAUDE.md note.
          </p>
          <p>
            Unknown roles hold no permissions and degrade to no access. Editing grants happens in
            code review, not in this UI.
          </p>
          <p>Signed in as {user.email} with roles: {user.roles.join(', ') || 'none'}.</p>
        </div>
      </div>

      {/* Effective access (Session 8): pick a role, see every page and
          action it can reach — the supervision answer to "what can your
          staff do." Derived live from the matrix + nav; unit-tested. */}
      <div className="bg-white border border-cool-200 rounded-[9px] p-5 mt-6">
        <h2 className="font-heading text-navy font-bold text-base">Effective access</h2>
        <p className="text-cool-500 font-ui text-sm mt-0.5 mb-4">
          Pick a role to see exactly what it reaches. Derived from the matrix above and the
          nav — there is no third source of truth.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {ROLES.map(r => (
            <Link
              key={r}
              href={`/portal/admin/settings?role=${r}`}
              data-testid={`effective-role-${r}`}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                pickedRole === r
                  ? 'bg-navy text-white border-navy'
                  : 'border-cool-200 text-cool-500 hover:border-cool-300'
              }`}
            >
              {r}
            </Link>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6 text-sm font-ui">
          <div>
            <h3 className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600 mb-2">
              Pages ({reachablePages.length} of {access.pages.length})
            </h3>
            <ul className="space-y-1">
              {access.pages.map(p => (
                <li key={p.href} className="flex items-center gap-2">
                  {p.allowed ? (
                    <span className="font-bold text-green-600">&#10003;</span>
                  ) : (
                    <span className="text-cool-300">&middot;</span>
                  )}
                  <span className={p.allowed ? 'text-navy' : 'text-cool-400'}>{p.label}</span>
                  <code className="text-[10px] text-cool-300 ml-auto">{p.permission}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600 mb-2">
              Actions ({allowedActions.length} allowed)
            </h3>
            {allowedActions.length === 0 ? (
              <p className="text-cool-500 text-xs mb-3">
                No decision or write capability — this role sees, it does not decide.
              </p>
            ) : (
              <ul className="space-y-1 mb-3">
                {allowedActions.map(a => (
                  <li key={a.key} className="flex items-start gap-2">
                    <span className="font-bold text-green-600">&#10003;</span>
                    <span className="text-navy">{a.label}</span>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="text-xs text-cool-500 cursor-pointer">
                Denied actions ({deniedActions.length})
              </summary>
              <ul className="space-y-1 mt-2">
                {deniedActions.map(a => (
                  <li key={a.key} className="flex items-start gap-2">
                    <span className="text-cool-300">&middot;</span>
                    <span className="text-cool-400">{a.label}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>

      {/* Session 9: notification category preferences (which categories
          badge the bell). The bell's gear links straight to #notifications. */}
      <div className="mt-6">
        <NotificationSettings />
      </div>

      {/* B7-P: the client-comms master switch, caps, CASL address, and the
          permanent suppression list. Admin-only; read-only in demo. */}
      {can(user, 'comms.decide') && (
        <div className="mt-6">
          <CommsSettings canWrite={!isDemoMode()} />
        </div>
      )}

      {/* Session 9: demo mode — admin only, env-fenced. */}
      {can(user, 'demo.mode') && (
        <div className="bg-white border border-cool-200 rounded-[9px] p-5 mt-6">
          <h2 className="font-heading text-navy font-bold text-base">Demo mode</h2>
          <p className="text-cool-500 font-ui text-sm mt-0.5 mb-4">
            Swaps the command center to bundled fictional fixtures — zero real reads, writes
            disabled — for showing the platform to a prospect with no client on screen.
          </p>
          <DemoToggle active={isDemoMode()} available={demoModeAvailable()} />
        </div>
      )}
    </div>
  )
}
