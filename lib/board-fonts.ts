// The Deals (Beta) board's two faces (handoff 58).
//
// THE EXPORT USES TWO FACES AND THE PAIRING IS DELIBERATE. Hanken Grotesk
// carries interface text; IBM Plex Mono carries every number. The monospace
// face on figures is the point: tabular digits align down a column, so a stack
// of sixty-six amounts reads as a column of numbers rather than as ragged text.
//
// LOADED THROUGH next/font/google, WHICH SELF-HOSTS THEM. Next downloads both
// families at build time and serves them from this origin, so there is no
// runtime request to Google, no third-party connection from a signed-in admin
// page, and no layout shift from a late stylesheet.
//
// SCOPED TO THIS SURFACE ON PURPOSE. These are not registered in the root
// layout, because every other page in the portal renders in Poppins and
// Montserrat and has no use for them. The board applies the two CSS variables
// on its own <main>, so the faces exist exactly where they are used.
//
// IF A FONT FAILS. `display: 'swap'` means text paints immediately in the
// fallback and swaps when the file arrives, so a slow or blocked font never
// leaves the board blank. next/font also computes a size-adjusted local
// fallback for each family, so the pre-swap render is close to the same
// proportions and the swap is not a jump. The fallback chains themselves live
// in lib/design-tokens.ts FONT: a system sans for the interface and the
// platform monospace for figures, so numbers stay monospaced and keep aligning
// even if the webfont never arrives at all.

import { Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google'

export const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  // The export uses all four. Nothing heavier than 700 appears in it.
  weight: ['400', '500', '600', '700'],
  variable: '--font-hanken',
  display: 'swap',
})

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  // The export uses 400, 500 and 600 on figures. 700 is never used in mono.
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

/** The class that puts both variables in scope. Applied once, on the board's
 *  own <main>, so nothing outside this surface changes face. */
export const BOARD_FONT_CLASS = `${hanken.variable} ${plexMono.variable}`
