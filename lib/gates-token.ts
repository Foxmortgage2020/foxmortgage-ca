'use client'

// The gates-template token mint — the only browser-side module that mints
// gates tokens. Backend-minted template tokens carry no azp claim and the
// Gates API refuses them (verified live 2026-07-09), so the mint happens
// in the browser on the signed-in session and the portal route forwards
// it, exactly as docs/gates-api.md describes ("forwards the signed-in
// user's session token"). Tokens live 60 seconds: mint per action, right
// before the POST, never cache, never log, never store.

import { useAuth } from '@clerk/nextjs'
import { useCallback } from 'react'

export const GATES_TOKEN_HEADER = 'x-gates-token'

export function useGatesToken(): () => Promise<string | null> {
  const { getToken } = useAuth()
  return useCallback(async () => {
    try {
      return await getToken({ template: 'gates' })
    } catch {
      return null
    }
  }, [getToken])
}
