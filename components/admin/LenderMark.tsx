'use client'

// Lender visual identity (Rates v3). Renders /lenders/{slug}.svg, falling
// back to /lenders/{slug}.png, falling back to a generated monogram: the
// lender's initials in a navy circle with a lime accent ring, in the house
// style. The monogram is the DEFAULT state, not an error state — with no
// logo files present it is what every lender shows, and it is meant to look
// deliberate.
//
// No manifest to maintain: the component attempts the file and swaps to the
// monogram on load failure, so a logo dropped into public/lenders/ appears
// with no code change. The slug is the QUOTE slug the rate rows carry
// (config/lenders.ts), so identity resolves from the same key everywhere a
// lender is named.

import { useMemo, useState } from 'react'
import { lenderDisplayName, lenderInitials } from '@/config/lenders'

export default function LenderMark({
  slug,
  name,
  size = 28,
  className = '',
}: {
  slug: string
  /** Display name for the monogram initials and alt text. When omitted the
   * config/lenders name (or a title-cased slug) is used. */
  name?: string | null
  /** Square edge in pixels. */
  size?: number
  className?: string
}) {
  // step 0: try .svg, step 1: try .png, step 2: monogram.
  const [step, setStep] = useState(0)
  const display = name || lenderDisplayName(slug)
  const initials = useMemo(() => lenderInitials(display, slug), [display, slug])

  const box = { width: size, height: size, minWidth: size } as const

  if (step < 2) {
    const ext = step === 0 ? 'svg' : 'png'
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/lenders/${slug}.${ext}`}
        alt={`${display} logo`}
        width={size}
        height={size}
        style={box}
        className={`inline-block rounded-lg object-contain bg-white ${className}`}
        onError={() => setStep(s => s + 1)}
        data-testid={`lender-mark-${slug}`}
      />
    )
  }

  // Monogram: navy squircle, lime accent ring, initials in white. Deliberate,
  // not an error state.
  const fontSize = Math.max(9, Math.round(size * (initials.length >= 3 ? 0.34 : 0.42)))
  return (
    <span
      role="img"
      aria-label={`${display} monogram`}
      title={display}
      style={{ ...box, fontSize }}
      className={`inline-flex items-center justify-center rounded-full bg-navy text-white font-heading font-bold ring-2 ring-lime shrink-0 leading-none tracking-tight ${className}`}
      data-testid={`lender-mark-${slug}`}
    >
      {initials}
    </span>
  )
}
