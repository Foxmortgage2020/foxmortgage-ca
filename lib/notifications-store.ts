// FOXCA notifications store client (Session 9, Part 2). Server-only: talks
// to the foxmortgage-ca Supabase project through the narrow
// security-definer functions from migration 20260710220000; the key holds
// no direct table privileges (RLS on, table grants revoked). Twin of
// lib/people-store.ts. Nothing deletes: notifications append (deduped),
// reads append, prefs upsert in place.

import type { NotificationCategory, NotificationInput } from '@/lib/notifications'
import { foxcaOperatorSecret } from '@/lib/foxca-secret'

export type NotificationStoreResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function foxcaEnv(): { url: string; key: string } | null {
  const url = process.env.FOXCA_SUPABASE_URL
  const key = process.env.FOXCA_SUPABASE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''), key }
}

export function notificationsStoreConfigured(): boolean {
  return foxcaEnv() !== null
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<NotificationStoreResult<T>> {
  const env = foxcaEnv()
  if (!env) return { configured: false }
  const started = Date.now()
  try {
    const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      // Function name and status only; error bodies may quote inputs.
      console.error(`[notifications-store] ${fn} HTTP ${res.status} ms=${ms}`)
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      return {
        configured: true,
        ok: false,
        error: body?.message
          ? String(body.message).slice(0, 200)
          : `Store query failed (HTTP ${res.status})`,
      }
    }
    const data = (await res.json().catch(() => null)) as T
    console.log(`[notifications-store] ${fn} ok ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[notifications-store] ${fn} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Notifications store unreachable' }
  }
}

// ─── Types (rows as the functions return them) ──────────────────────────────

export interface NotificationRow {
  id: string
  dedupKey: string
  category: NotificationCategory
  title: string
  body: string
  href: string
  createdAt: string
  read: boolean
}

export interface NotificationPref {
  clerkUserId: string
  category: string
  enabled: boolean
}

// ─── Upsert ──────────────────────────────────────────────────────────────────

export async function upsertNotification(
  input: NotificationInput,
): Promise<NotificationStoreResult<string>> {
  return rpc<string>('notification_upsert', {
    p_dedup_key: input.dedupKey,
    p_category: input.category,
    p_title: input.title,
    p_body: input.body,
    p_href: input.href,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

// ─── List ────────────────────────────────────────────────────────────────────

export async function listNotificationsForUser(
  clerkUserId: string,
): Promise<NotificationStoreResult<NotificationRow[]>> {
  const res = await rpc<any[]>('notifications_list_for_user', { p_clerk_user_id: clerkUserId })
  if (!res.configured || !res.ok) return res as NotificationStoreResult<NotificationRow[]>
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    configured: true,
    ok: true,
    data: rows.map(r => ({
      id: r.id,
      dedupKey: r.dedup_key,
      category: r.category as NotificationCategory,
      title: r.title,
      body: r.body,
      href: r.href,
      createdAt: r.created_at,
      read: r.read === true,
    })),
  }
}

// ─── Read state ──────────────────────────────────────────────────────────────

export async function markRead(
  id: string,
  clerkUserId: string,
): Promise<NotificationStoreResult<boolean>> {
  return rpc<boolean>('notification_mark_read', {
    p_id: id,
    p_clerk_user_id: clerkUserId,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

export async function markAllRead(
  clerkUserId: string,
): Promise<NotificationStoreResult<number>> {
  return rpc<number>('notification_mark_all_read', {
    p_clerk_user_id: clerkUserId,
    p_operator_secret: foxcaOperatorSecret(),
  })
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function getPrefs(
  clerkUserId: string,
): Promise<NotificationStoreResult<NotificationPref[]>> {
  const res = await rpc<any[]>('notification_prefs_get', { p_clerk_user_id: clerkUserId })
  if (!res.configured || !res.ok) return res as NotificationStoreResult<NotificationPref[]>
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    configured: true,
    ok: true,
    data: rows.map(r => ({
      clerkUserId: r.clerk_user_id,
      category: r.category,
      enabled: r.enabled === true,
    })),
  }
}

export async function setPref(
  clerkUserId: string,
  category: string,
  enabled: boolean,
): Promise<NotificationStoreResult<boolean>> {
  return rpc<boolean>('notification_pref_set', {
    p_clerk_user_id: clerkUserId,
    p_category: category,
    p_enabled: enabled,
    p_operator_secret: foxcaOperatorSecret(),
  })
}
