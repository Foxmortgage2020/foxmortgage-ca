import { redirect } from 'next/navigation'

// The Prepayment Penalty calculator now lives under /tools with the rest of the
// suite. Keep this route so existing links keep working; send them to the new home.
export default function PenaltyPage() {
  redirect('/tools/prepayment-penalty')
}
