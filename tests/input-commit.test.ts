// The numeric input-commit parser (the house rule: inputs commit on blur/Enter).
import { describe, expect, it } from 'vitest'
import { commitNumericInput } from '../lib/input-commit'

describe('commitNumericInput', () => {
  it('commits a plain number', () => {
    expect(commitNumericInput('1500000')).toBe(1500000)
    expect(commitNumericInput('0')).toBe(0)
    expect(commitNumericInput('928000')).toBe(928000)
  })

  it('an empty field commits to null (the not-set state)', () => {
    expect(commitNumericInput('')).toBeNull()
    expect(commitNumericInput('   ')).toBeNull()
  })

  it('tolerates the ways a person types a dollar figure', () => {
    expect(commitNumericInput('1,500,000')).toBe(1500000)
    expect(commitNumericInput('$928,000')).toBe(928000)
    expect(commitNumericInput(' 640000 ')).toBe(640000)
    expect(commitNumericInput('1160000.50')).toBe(1160000.5)
  })

  it('rejects nonsense and negatives to null, never NaN', () => {
    expect(commitNumericInput('abc')).toBeNull()
    expect(commitNumericInput('-5')).toBeNull()
    expect(commitNumericInput('12x')).toBeNull()
    expect(commitNumericInput('Infinity')).toBeNull()
    expect(Number.isNaN(commitNumericInput('nope') as number)).toBe(false)
  })

  it('is idempotent on its own output', () => {
    const once = commitNumericInput('1,160,000')
    expect(commitNumericInput(String(once))).toBe(once)
  })
})
