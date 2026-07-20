'use client'

// A numeric input that COMMITS on blur or Enter, never per keystroke (the house
// rule: no keystroke triggers a network call or heavy recompute). While the
// person types, only local text state changes — nothing navigates, fetches, or
// recomputes. onCommit fires the parsed value once, on blur or Enter.
//
// It resyncs to the committed `value` when that changes from OUTSIDE (a recalled
// scenario, a prefill, a reset), using React's store-information-from-a-previous
// -render pattern so there is no effect flash.

import { useState } from 'react'
import { commitNumericInput } from '@/lib/input-commit'

const fmt = (v: number | null) => (v === null ? '' : String(v))

export default function CommittedNumberField({
  value,
  onCommit,
  className,
  placeholder,
  min,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  className?: string
  placeholder?: string
  min?: number
  'data-testid'?: string
  'aria-label'?: string
}) {
  const [text, setText] = useState(() => fmt(value))
  const [committed, setCommitted] = useState(value)
  if (value !== committed) {
    // The committed value changed externally; resync the field to it.
    setCommitted(value)
    setText(fmt(value))
  }

  const commit = () => onCommit(commitNumericInput(text))

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      value={text}
      placeholder={placeholder}
      className={className}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          e.currentTarget.blur()
        }
      }}
      data-testid={testId}
      aria-label={ariaLabel}
    />
  )
}
