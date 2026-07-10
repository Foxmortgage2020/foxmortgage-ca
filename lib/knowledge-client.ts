'use client'

// Client-side fetch hook for the knowledge proxy routes. Knowledge rides
// the same auth posture as the gates (browser-minted token, azp check),
// so these fetches happen in the browser: mint per request, forward via
// the x-gates-token header, never cache or log the token.

import { useCallback, useEffect, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'

export interface KnowledgeFetchState<T> {
  data: T | null
  error: string | null
  loading: boolean
  retry: () => void
}

export function useKnowledgeFetch<T>(path: string): KnowledgeFetchState<T> {
  const mintGatesToken = useGatesToken()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => setAttempt(a => a + 1), [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await mintGatesToken()
        const res = await fetch(path, {
          headers: token ? { [GATES_TOKEN_HEADER]: token } : undefined,
          cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        if (cancelled) return
        if (json?.ok) {
          setData(json.data as T)
        } else {
          setError(json?.message ?? `The knowledge service did not answer (HTTP ${res.status}).`)
        }
      } catch {
        if (!cancelled) setError('Could not reach the server. Check your connection and retry.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [path, attempt, mintGatesToken])

  return { data, error, loading, retry }
}
