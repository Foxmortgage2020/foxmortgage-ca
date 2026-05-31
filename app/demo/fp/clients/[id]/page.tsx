// Demo FP client file page. Selects an inline sample file by id and renders the
// read-only DemoClientFile (messagingEnabled hard-false, no fetch, no compose
// box). Mirrors app/portal/fp/clients/[id]/page.tsx, which delegates to the
// shared client-file component — here we delegate to the demo variant instead.

import DemoClientFile from '../../_components/DemoClientFile'
import { getDemoClientDetail } from '../../_data/demo-data'

export default function DemoFPClientDetailPage({ params }: { params: { id: string } }) {
  const client = getDemoClientDetail(params.id)
  return <DemoClientFile client={client} />
}
