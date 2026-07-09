import StubPage from '@/components/admin/StubPage'
import { requirePermission } from '@/lib/authz'
import { ADMIN_NAV } from '@/config/admin-nav'

export const dynamic = 'force-dynamic'

const item = ADMIN_NAV.find(i => i.href === '/portal/admin/intel')!

export default async function IntelStub() {
  await requirePermission(item.permission)
  return (
    <StubPage title={item.label} session={item.arrivesInSession!} description={item.description} />
  )
}
