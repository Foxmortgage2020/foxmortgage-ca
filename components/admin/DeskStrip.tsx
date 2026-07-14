// The Desk (2026-07-14 shell redesign): a navy strip that states, in one
// plain sentence, everything waiting on a human. Each fragment deep-links to
// the queue it names. An empty Desk is the system's proudest state, so the
// empty line says so plainly rather than showing an empty screen. Server
// component; the counts arrive computed (lib/desk.ts).
//
// LIME RULE: this strip is enumerated decision territory — the fragment
// links carry the decision underline. Everything else in it is navy/white.

import Link from 'next/link'
import { DESK_EMPTY_LINE, DESK_RUNNING_LINE, type DeskFragment } from '@/lib/desk'

export default function DeskStrip({ fragments }: { fragments: DeskFragment[] }) {
  return (
    <section
      aria-label="Waiting on you"
      className="rounded-[10px] bg-ink-navy px-5 py-4 shadow-card"
    >
      <p className="font-ui text-[10px] font-bold uppercase tracking-[1.6px] text-white/40">
        Waiting on you
      </p>
      {fragments.length === 0 ? (
        <p className="mt-1.5 font-ui text-[15px] leading-relaxed text-white">
          {DESK_EMPTY_LINE}{' '}
          <span className="text-white/50 italic">Everything is running on its own.</span>
        </p>
      ) : (
        <p className="mt-1.5 font-ui text-[15px] leading-relaxed text-white">
          {fragments.map((f, i) => (
            <span key={f.href + f.label}>
              {i > 0 && <span className="text-white/30 px-1.5">·</span>}
              <Link
                href={f.href}
                className="font-semibold underline decoration-decision decoration-2 underline-offset-4 hover:text-decision focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-decision rounded-sm"
              >
                {f.label}
              </Link>
            </span>
          ))}
          <span className="text-white/50 italic"> {DESK_RUNNING_LINE}</span>
        </p>
      )}
    </section>
  )
}
