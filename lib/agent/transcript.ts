// Transcript normalization for Call Review (unit-tested in
// tests/agent.test.ts). Accepts a Dialpad CSV export or plain pasted
// text and produces one normalized speaker-labeled transcript string.
//
// The parser is deliberately tolerant: Dialpad's export shape has varied
// (and the Jul 10 reference CSV lives on Michael's machine, not this
// repo), so instead of hard-coding column positions it sniffs the header
// row for name-, time-, and content-shaped columns. Anything that does
// not look like a CSV with a usable header passes through as plain text,
// so a paste never fails.

export interface TranscriptLine {
  speaker: string | null
  time: string | null
  text: string
}

export interface ParsedTranscript {
  kind: 'csv' | 'text'
  lines: TranscriptLine[]
  /** One speaker-labeled line per utterance, ready for the prompt. */
  normalized: string
}

// Minimal CSV reader with quote handling (RFC-4180-ish). Good enough for
// transcript exports; not a general CSV library.
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && raw[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.length > 1 || row[0] !== '') rows.push(row)
  return rows
}

const norm = (s: string) => s.trim().toLowerCase()

function findColumn(header: string[], candidates: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i])
    if (candidates.some(c => h === c || h.includes(c))) return i
  }
  return -1
}

export function parseTranscript(raw: string): ParsedTranscript {
  const trimmed = raw.trim()
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? ''

  // CSV detection: a comma-bearing first line whose columns include a
  // content-shaped header. Otherwise treat the paste as plain text.
  if (firstLine.includes(',')) {
    const rows = parseCsv(trimmed)
    if (rows.length >= 2) {
      const header = rows[0]
      const contentIdx = findColumn(header, ['content', 'text', 'transcript', 'message', 'utterance'])
      if (contentIdx >= 0) {
        const speakerIdx = findColumn(header, ['name', 'speaker', 'contact', 'participant', 'who'])
        const timeIdx = findColumn(header, ['time', 'date', 'timestamp', 'start'])
        const typeIdx = findColumn(header, ['type', 'event'])
        const lines: TranscriptLine[] = []
        for (const r of rows.slice(1)) {
          const text = (r[contentIdx] ?? '').trim()
          if (!text) continue
          // Dialpad exports carry non-speech rows (call started, hold,
          // recording notices) under a type column; keep transcript rows
          // and anything untyped.
          if (typeIdx >= 0) {
            const t = norm(r[typeIdx] ?? '')
            if (t && !t.includes('transcript') && !t.includes('speech') && !t.includes('message')) continue
          }
          lines.push({
            speaker: speakerIdx >= 0 ? (r[speakerIdx] ?? '').trim() || null : null,
            time: timeIdx >= 0 ? (r[timeIdx] ?? '').trim() || null : null,
            text,
          })
        }
        if (lines.length > 0) {
          return { kind: 'csv', lines, normalized: normalize(lines) }
        }
      }
    }
  }

  const lines: TranscriptLine[] = trimmed
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(text => ({ speaker: null, time: null, text }))
  return { kind: 'text', lines, normalized: normalize(lines) }
}

function normalize(lines: TranscriptLine[]): string {
  return lines
    .map(l => {
      const speaker = l.speaker ? `${l.speaker}: ` : ''
      const time = l.time ? ` [${l.time}]` : ''
      return `${speaker}${l.text}${time}`
    })
    .join('\n')
}
