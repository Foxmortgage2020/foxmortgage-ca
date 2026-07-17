// Design system (B3): the table treatment — the B2b Deals list's card
// frame, header row, hairline rows, and the tabular-nums cell styles for
// money, refs, and dates, extracted byte-for-byte as shared class
// constants. Grids stay per-table (column widths are the page's own); the
// treatment is the system's.

// The white card that frames a desktop table (hidden at phone width, where
// rows become cards).
export const TABLE_CARD = 'hidden overflow-hidden rounded-[9px] border border-cool-200 bg-white md:block'

// The column-header row (Poppins, tracking, cool-600).
export const TABLE_HEADER_ROW =
  'px-5 py-2.5 font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600'

// A data row on the hairline track.
export const TABLE_ROW = 'border-t border-cool-100 px-5 py-3'

// Cell styles: money, file refs, and dates render tabular so columns scan
// vertically (verified to hold on Montserrat).
export const CELL_MONEY = 'font-ui text-[13.5px] font-semibold text-navy tabular-nums'
export const CELL_REF = 'font-ui text-[10.5px] tracking-[0.04em] text-cool-500 tabular-nums'
export const CELL_DATE = 'font-ui text-[13px] tabular-nums'
