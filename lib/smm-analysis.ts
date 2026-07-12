// The single per-mortgage analysis used by BOTH the Opportunities board and the
// savings-analysis PDF route, so the document a client receives can never drift
// from the card Michael saw. Pure: parsed row + approved book in, Fox's analysis
// out. The board inlines the same calls today; this is the shared truth for the
// PDF path and anything else that needs one household's analysis.

import { analyzeOpportunity, type FoxAnalysis, type SmmParsedRow } from '@/lib/smm'
import { bestFixedComparable, insuranceToProductClass, type BookQuote } from '@/lib/smm-match'
import { lenderMethodologyFor } from '@/lib/lenders'
import { lenderDisplayName } from '@/config/lenders'

export interface MortgageAnalysis {
  analysis: FoxAnalysis
  classAssumed: boolean
  productClass: string
}

export function analyzeMortgage(row: SmmParsedRow, book: BookQuote[], todayYMD: string): MortgageAnalysis {
  const productClass = insuranceToProductClass(row.insuranceType)
  const { comparable, classAssumed } = bestFixedComparable(book, productClass, lenderDisplayName)
  const methodologyKnown = lenderMethodologyFor(row.lender.display) != null
  const analysis = analyzeOpportunity(row, comparable, methodologyKnown, todayYMD)
  return { analysis, classAssumed, productClass }
}
