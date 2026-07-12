// Savings-analysis PDF tests (Opportunities engine). Two jobs: (1) the same
// compensation guard the rates PDF carries — a borrower's savings report must
// never disclose lender compensation, and the leak vector here is any string
// field (lender name, penalty framing, free-text note) — and (2) the honest
// framing contract: when breaking early costs more than it saves, the document
// tells the client to WAIT for maturity, never a manufactured saving.
// Set SAVINGS_PDF_OUT=/path/dir to also write artifacts for eyes-on review.

import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib'
import { generateSavingsPdf, savingsPdfFilename, type SavingsPdfInput } from '@/lib/savings-pdf'

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  let raw = ''
  for (const page of doc.getPages()) {
    const contents = page.node.get(PDFName.of('Contents'))
    const resolved = doc.context.lookup(contents)
    const refs = resolved instanceof PDFArray ? resolved.asArray() : [contents]
    for (const ref of refs) {
      const stream = doc.context.lookup(ref) as { contents?: Uint8Array } | undefined
      if (!stream?.contents) continue
      let dec: Buffer
      try {
        dec = zlib.inflateSync(Buffer.from(stream.contents))
      } catch {
        dec = Buffer.from(stream.contents)
      }
      raw += dec.toString('latin1')
    }
  }
  let text = ''
  const re = /<([0-9A-Fa-f]+)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const hex = m[1]
    for (let i = 0; i + 1 < hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
  }
  return text
}

function base(over: Partial<SavingsPdfInput> = {}): SavingsPdfInput {
  return {
    generatedDate: '2026-07-12',
    clientName: 'Jenna Easter',
    currentRate: 6.19,
    currentRateType: 'fixed',
    currentLender: 'MCAP',
    balance: 420_000,
    maturity: '2030-10-05',
    comparable: { rate: 4.19, lender: 'Scotiabank', asOf: '2026-07-09' },
    currentPayment: 2750,
    newPayment: 2260,
    monthlySaving: 490,
    penaltyThreeMonthsInterest: 6500,
    penaltyFraming: 'Fixed: the greater of three months of interest and the interest-rate differential.',
    penaltyMethodologyKnown: false,
    breakEvenMonths: 13.3,
    netBenefit: 18000,
    remainingMonths: 51,
    bucket: 'act_now',
    note: null,
    ...over,
  }
}

describe('savings PDF basics', () => {
  it('produces a valid document', async () => {
    const bytes = await generateSavingsPdf(base())
    expect(bytes.length).toBeGreaterThan(1500)
    expect(String.fromCharCode.apply(null, Array.from(bytes.slice(0, 5)))).toBe('%PDF-')
    if (process.env.SAVINGS_PDF_OUT) {
      mkdirSync(process.env.SAVINGS_PDF_OUT, { recursive: true })
      writeFileSync(join(process.env.SAVINGS_PDF_OUT, 'savings-act-now.pdf'), bytes)
    }
  })

  it('names the file by date only, never client data', () => {
    expect(savingsPdfFilename('2026-07-12')).toBe('savings-analysis-2026-07-12.pdf')
  })
})

describe('savings PDF framing is honest', () => {
  it('recommends acting when net benefit is positive', async () => {
    const text = await extractPdfText(await generateSavingsPdf(base({ bucket: 'act_now', netBenefit: 18000 })))
    expect(text).toContain('worth about')
    expect(text).toContain('over the 51 months')
  })

  it('recommends WAITING for maturity when breaking early costs more than it saves', async () => {
    // A low-rate-near-maturity shape: the penalty exceeds the savings over the
    // remaining term, so the document must say wait — never a saving.
    const text = await extractPdfText(
      await generateSavingsPdf(
        base({
          bucket: 'stay_put',
          currentRate: 1.99,
          monthlySaving: 0,
          netBenefit: -6000,
          maturity: '2026-10-01',
          remainingMonths: 3,
        }),
      ),
    )
    expect(text.toLowerCase()).toContain('wait')
    expect(text).toContain('as your term matures')
    // It must NOT claim a saving.
    expect(text.toLowerCase()).not.toContain('worth about')
  })

  it('says so plainly when there is not enough data', async () => {
    const text = await extractPdfText(
      await generateSavingsPdf(base({ bucket: 'insufficient', comparable: null, netBenefit: null })),
    )
    expect(text).toContain('could not run a full comparison')
  })
})

// The compensation guard: a borrower's savings report must never disclose
// lender compensation. Inject a distinctive sentinel into EVERY string field
// and prove none of it — nor "bps", nor "Compensation" — reaches the document.
describe('savings PDF never discloses compensation', () => {
  const SENTINEL = 9137
  const SHAPES: { label: string; input: SavingsPdfInput }[] = [
    {
      label: 'comp in lender names, framing, and the free-text note',
      input: base({
        currentLender: `MCAP (finder fee ${SENTINEL} bps to the broker)`,
        comparable: { rate: 4.19, lender: `Scotiabank -- compensation ${SENTINEL} bps`, asOf: '2026-07-09' },
        penaltyFraming: `Fixed penalty. Bonus compensation of ${SENTINEL} bps paid to the broker on funding.`,
        note: `Great fit. Comp: ${SENTINEL} bps to the broker.`,
      }),
    },
    {
      label: 'comp in the client name field and a stay-put document',
      input: base({
        bucket: 'stay_put',
        netBenefit: -4000,
        monthlySaving: 0,
        clientName: `Test Client -- finder fee ${SENTINEL} bps`,
        currentLender: `RFA (compensation ${SENTINEL} bps)`,
      }),
    },
    {
      label: 'comp in the insufficient-data document',
      input: base({
        bucket: 'insufficient',
        comparable: null,
        currentLender: `Westboro -- ${SENTINEL} bps finder fee`,
        clientName: `Someone (comp ${SENTINEL} bps)`,
      }),
    },
  ]

  for (const shape of SHAPES) {
    it(`omits compensation for: ${shape.label}`, async () => {
      const text = await extractPdfText(await generateSavingsPdf(shape.input))
      // Non-vacuous: a known heading is always present.
      expect(text).toContain('FOX MORTGAGE')
      expect(text).not.toContain(String(SENTINEL))
      expect(text.toLowerCase()).not.toContain('bps')
      expect(text).not.toContain('Compensation')
      expect(text.toLowerCase()).not.toContain('finder fee')
    })
  }
})
