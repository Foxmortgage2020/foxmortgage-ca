// The pre-approval letter PDF (B8b Task 3). It must render a valid document
// carrying the terms Michael entered, and be reproducible from the frozen
// snapshot alone (same snapshot → same visible text). Set PREAPPROVAL_PDF_OUT
// to also write the artifact for eyes-on review.

import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib'
import { generatePreapprovalPdf, preapprovalPdfFilename } from '@/lib/preapproval-pdf'
import { buildLetterSnapshot } from '@/lib/client-presentation'

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

const SNAP = buildLetterSnapshot({
  inputs: {
    maxPurchasePrice: 720000,
    ratePct: 4.59,
    rateHoldExpiry: '2026-12-31',
    conditions: 'Down payment and income confirmation, and a satisfactory property appraisal.',
  },
  clientFirstName: 'Sofia',
  fileRef: 'FOX-1004',
  mintedBy: 'michael@foxmortgage.ca',
  mintedAt: '2026-07-15T14:00:00Z',
})

describe('the pre-approval letter PDF', () => {
  it('renders a valid PDF carrying the terms', async () => {
    const bytes = await generatePreapprovalPdf(SNAP)
    expect(Buffer.from(bytes.slice(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(bytes.length).toBeGreaterThan(1000)
    if (process.env.PREAPPROVAL_PDF_OUT) {
      mkdirSync(process.env.PREAPPROVAL_PDF_OUT, { recursive: true })
      writeFileSync(join(process.env.PREAPPROVAL_PDF_OUT, 'preapproval.pdf'), bytes)
    }
    const text = await extractPdfText(bytes)
    expect(text).toContain('Dear Sofia')
    expect(text).toContain('720,000')
    expect(text).toContain('4.59%')
    expect(text).toContain('Michael Fox')
    expect(text).toContain('FSRA 13463')
    expect(text).toContain('December 31, 2026') // the validity date
  })

  it('is reproducible from the snapshot alone (same snapshot → same visible text)', async () => {
    const t1 = await extractPdfText(await generatePreapprovalPdf(SNAP))
    const t2 = await extractPdfText(await generatePreapprovalPdf(SNAP))
    expect(t1).toBe(t2)
  })

  it('falls back to a generic salutation when no first name was captured', async () => {
    const noName = buildLetterSnapshot({ ...SNAP, clientFirstName: null })
    const text = await extractPdfText(await generatePreapprovalPdf(noName))
    expect(text).toContain('Dear Client')
  })

  it('names the file in the download filename, or a generic one', () => {
    expect(preapprovalPdfFilename('FOX-1004')).toBe('preapproval-FOX-1004.pdf')
    expect(preapprovalPdfFilename(null)).toBe('preapproval-letter.pdf')
  })
})
