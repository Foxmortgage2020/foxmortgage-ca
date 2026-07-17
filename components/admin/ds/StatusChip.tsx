// Design system (B3): the status chip — four semantic tones on the cool
// scale. Extracted from the B2b deal room byte-for-byte. Green = good,
// amber = attention, red = failed, gray = neutral. Never lime: lime is a
// queued decision, and a chip states, it never queues.

export type ChipTone = 'green' | 'amber' | 'red' | 'gray'

const TONES: Record<ChipTone, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-cool-100 text-cool-700',
}

export default function StatusChip({
  tone,
  children,
  title,
}: {
  tone: ChipTone
  children: React.ReactNode
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${TONES[tone]}`}
    >
      {children}
    </span>
  )
}
