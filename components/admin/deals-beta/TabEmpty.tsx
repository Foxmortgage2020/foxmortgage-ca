// The honest empty state for the seven tabs not yet built (handoff 42).
//
// The convention this build already uses everywhere: an empty state names what
// the thing is FOR and where that work happens today, in plain language, rather
// than showing a shrug. A broker who has never run a file should be able to read
// this tab row and learn the process from it.
//
// The link out is conditional on the file actually having a workbench room.
// Roughly 150 of the 160 rec deals have no room — they are the historical book —
// and offering "open it on the Deals file page" for a file that has no such page
// would strand exactly the person this copy is written for.

import Link from 'next/link'
import type { TabDef } from '@/lib/beta-file'

export default function TabEmpty({
  tab,
  roomHref,
}: {
  tab: TabDef
  /** The live deal room for this file, when one exists. Null is the normal
   *  case for a historical record-layer file. */
  roomHref: string | null
}) {
  return (
    <section
      data-testid={`beta-file-empty-${tab.key}`}
      className="mt-4 rounded-[9px] border border-cool-200 bg-white p-5"
    >
      <h2 className="font-heading text-sm font-semibold text-navy">{tab.label}</h2>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
        {tab.purpose}
      </p>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-cool-600 font-ui">
        {roomHref ? (
          <>
            {tab.today}{' '}
            <Link href={roomHref} className="font-semibold text-navy underline hover:opacity-80">
              Open the Deals file page
            </Link>
            .
          </>
        ) : (
          // No workbench room: say why rather than offering a link to nowhere.
          <>
            This file has no Deals file page — it is in the record layer but has
            never been opened for underwriting, so there is nothing to link to yet.
          </>
        )}
      </p>
    </section>
  )
}
