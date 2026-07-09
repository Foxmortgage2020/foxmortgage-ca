// Settings: Session 1 renders the authority matrix read-only. The matrix
// itself lives in config/authority.ts (versioned, additive-only key names);
// Session 2's gates API enforces the same keys server-side.

import { requirePermission } from '@/lib/authz'
import { PERMISSIONS, ROLES } from '@/config/authority'

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

export default async function SettingsPage() {
  const user = await requirePermission('settings.manage')
  const permissionKeys = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Settings</h1>
        <p className="text-gray-500 font-body text-sm mt-1">
          Authority matrix, read-only. Source: config/authority.ts. Roles come from Clerk
          publicMetadata and are assigned in the Clerk dashboard.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Who may do what</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="py-2 pr-4 font-medium">Permission</th>
                {ROLES.map(r => (
                  <th key={r} className="py-2 px-3 font-medium text-center">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissionKeys.map(key => (
                <tr key={key} className="border-t border-gray-100">
                  <td className="py-2 pr-4">
                    <code className="text-xs text-navy">{key}</code>
                    {SESSION_1_ADDITIVE_KEYS.has(key) && (
                      <span className="ml-2 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        added S1
                      </span>
                    )}
                  </td>
                  {ROLES.map(role => {
                    const allowed = (PERMISSIONS[key] as readonly string[]).includes(role)
                    return (
                      <td key={role} className="py-2 px-3 text-center">
                        {allowed ? (
                          <span className="font-bold" style={{ color: '#7ab800' }}>
                            &#10003;
                          </span>
                        ) : (
                          <span className="text-gray-300">&middot;</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-body space-y-1">
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
    </div>
  )
}
