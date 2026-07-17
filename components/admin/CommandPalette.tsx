'use client'

// Global command palette (cmd-K) for the admin command center.
//
// Renders two things the shell drops into its top bar:
//   1. A trigger button (magnifier + "Search" + a ⌘K hint on desktop),
//      tappable on mobile too.
//   2. The modal itself — a centered panel on desktop, a full-screen sheet
//      on mobile. The modal subtree only mounts while open, so the knowledge
//      fetch (which mints a gates token) never fires on a page the user
//      never searches from.
//
// Sources render independently and honestly. "Go to" (navigation) is
// filtered locally from the nav items the shell already permission-filtered,
// so it is instant with zero fetch. Deals / Contacts / Partners come from
// the server search route. Knowledge rides the browser-minted gates token,
// so it is fetched client-side and filtered here. A source that could not be
// reached says so; a source that returned nothing for a real query says "No
// matches" rather than pretending to be empty-by-default.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  FolderOpen,
  MessageSquareText,
  Search,
  User,
  Users,
  X,
} from 'lucide-react'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import {
  filterNav,
  type NavItemLike,
  type SearchGroup,
  type SearchResult,
  type SearchResultType,
} from '@/lib/search'

interface KnowledgeLenderSummary {
  slug: string
  name: string
  as_of: string | null
  has_profile: boolean
  draft: boolean
}

const RECENT_KEY = 'fox_search_recent'
const RECENT_CAP = 6
const DEBOUNCE_MS = 180

const TYPE_ICON: Record<SearchResultType, typeof Search> = {
  nav: ArrowRight,
  deal: FolderOpen,
  contact: User,
  partner: Users,
  knowledge: BookOpen,
  askfox: MessageSquareText,
}

interface RecentItem {
  title: string
  href: string
  type: SearchResultType
}

function readRecent(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (r): r is RecentItem =>
          r && typeof r.title === 'string' && typeof r.href === 'string' && typeof r.type === 'string',
      )
      .slice(0, RECENT_CAP)
  } catch {
    return []
  }
}

function pushRecent(item: RecentItem): RecentItem[] {
  const existing = readRecent().filter(r => r.href !== item.href)
  const next = [item, ...existing].slice(0, RECENT_CAP)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* private mode / quota — recents are a convenience, never load-bearing */
  }
  return next
}

// A rendered section: navigable results plus an optional honesty message
// (degraded / no-matches) that is not itself selectable.
interface Section {
  key: string
  label: string
  results: SearchResult[]
  message?: string
}

export default function CommandPalette({
  navItems,
  askFoxHref = null,
}: {
  navItems: NavItemLike[]
  // When the user holds agent.use, anything the search cannot resolve hands
  // to Ask Fox as a question (one box, two talents). Null = row absent.
  askFoxHref?: string | null
}) {
  const [open, setOpen] = useState(false)

  const openPalette = useCallback(() => setOpen(true), [])
  const closePalette = useCallback(() => setOpen(false), [])

  // Global shortcuts: ⌘K / Ctrl-K toggles; "/" opens when not typing into a
  // field; Esc closes. Registered once, independent of the modal subtree.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(o => !o)
        return
      }
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key === '/') {
        const el = document.activeElement as HTMLElement | null
        const typing =
          el &&
          (el.tagName === 'INPUT' ||
            el.tagName === 'TEXTAREA' ||
            el.tagName === 'SELECT' ||
            el.isContentEditable)
        if (!typing) {
          e.preventDefault()
          setOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {/* Trigger — sits in the shell top bar; tappable on mobile. */}
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search"
        className="inline-flex items-center gap-2 rounded-[7px] border border-hairline bg-white px-2.5 py-1.5 text-sm text-muted motion-safe:transition-colors hover:border-muted-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-navy sm:min-w-[16rem] sm:justify-start"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden font-ui sm:inline">Search or ask</span>
        <kbd className="ml-auto hidden items-center gap-0.5 rounded border border-hairline bg-fog px-1.5 py-0.5 font-ui text-[11px] font-medium text-muted-2 sm:inline-flex">
          ⌘K
        </kbd>
      </button>

      {open && <PaletteModal navItems={navItems} askFoxHref={askFoxHref} onClose={closePalette} />}

      <style jsx global>{`
        @keyframes foxPaletteFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes foxPaletteIn {
          from {
            opacity: 0;
            transform: translateY(-6px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  )
}

function PaletteModal({
  navItems,
  askFoxHref,
  onClose,
}: {
  navItems: NavItemLike[]
  askFoxHref: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [serverGroups, setServerGroups] = useState<SearchGroup[]>([])
  const [serverLoading, setServerLoading] = useState(false)
  const [serverErrored, setServerErrored] = useState(false)
  const [recent, setRecent] = useState<RecentItem[]>(() => readRecent())
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Knowledge lenders: fetched once on open (constant path), filtered here.
  const knowledge = useKnowledgeFetch<{ lenders: KnowledgeLenderSummary[] }>(
    '/api/portal/admin/knowledge/lenders',
  )

  // Focus the input on mount.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  // Debounce the query.
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [query])

  // Server fetch for the debounced query. cancelled + AbortController guard
  // against a stale response landing after a newer keystroke.
  useEffect(() => {
    const q = debounced.trim()
    if (!q) {
      setServerGroups([])
      setServerLoading(false)
      setServerErrored(false)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setServerLoading(true)
    setServerErrored(false)
    fetch(`/api/portal/admin/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(res => res.json().catch(() => null))
      .then(json => {
        if (cancelled) return
        if (json?.ok && Array.isArray(json.groups)) setServerGroups(json.groups as SearchGroup[])
        else {
          setServerGroups([])
          setServerErrored(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerGroups([])
          setServerErrored(true)
        }
      })
      .finally(() => {
        if (!cancelled) setServerLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [debounced])

  // Knowledge results (client-filtered).
  const knowledgeResults = useMemo<SearchResult[]>(() => {
    const q = debounced.trim().toLowerCase()
    if (!q) return []
    const lenders = knowledge.data?.lenders ?? []
    return lenders
      .filter(l => l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q))
      .slice(0, 8)
      .map(l => ({
        type: 'knowledge' as const,
        id: l.slug,
        title: l.name,
        subtitle: l.slug,
        href: `/portal/admin/knowledge/${l.slug}`,
        badge: l.draft ? 'draft' : l.as_of ?? undefined,
      }))
  }, [debounced, knowledge.data])

  // Section assembly (render order == flatten order).
  const sections = useMemo<Section[]>(() => {
    const q = debounced.trim()
    const out: Section[] = []

    if (!q) {
      if (recent.length > 0) {
        out.push({
          key: 'recent',
          label: 'Recent',
          results: recent.map(r => ({
            type: r.type,
            id: `recent:${r.href}`,
            title: r.title,
            href: r.href,
          })),
        })
      }
      out.push({
        key: 'nav',
        label: 'Go to',
        results: navItems.map(n => ({
          type: 'nav' as const,
          id: n.href,
          title: n.label,
          subtitle: n.description,
          href: n.href,
        })),
      })
      return out
    }

    // Non-empty query.
    const navResults = filterNav(navItems, q)
    if (navResults.length > 0) out.push({ key: 'nav', label: 'Go to', results: navResults })

    const groupByType = new Map(serverGroups.map(g => [g.type, g]))
    for (const [type, label] of [
      ['deal', 'Deals'],
      ['contact', 'Contacts'],
      ['partner', 'Partners'],
    ] as const) {
      const g = groupByType.get(type)
      if (!g) {
        // Group absent: still loading, the whole route errored, or (partners)
        // the role has no access. Only surface a quiet state once we have a
        // verdict, never while the first response is in flight.
        if (serverErrored) out.push({ key: type, label, results: [], message: `Couldn't reach ${label}.` })
        else if (!serverLoading && type !== 'partner')
          out.push({ key: type, label, results: [], message: 'No matches.' })
        continue
      }
      if (g.status === 'degraded') out.push({ key: type, label, results: [], message: `Couldn't reach ${label}.` })
      else if (g.status === 'empty') out.push({ key: type, label, results: [], message: 'No matches.' })
      else out.push({ key: type, label, results: g.results })
    }

    // Knowledge (client-side).
    if (knowledge.error)
      out.push({ key: 'knowledge', label: 'Knowledge', results: [], message: "Couldn't reach Knowledge." })
    else if (!knowledge.loading)
      out.push({
        key: 'knowledge',
        label: 'Knowledge',
        results: knowledgeResults,
        message: knowledgeResults.length === 0 ? 'No matches.' : undefined,
      })

    // The hand-off: anything unresolved goes to Ask Fox as a question.
    if (askFoxHref) {
      out.push({
        key: 'askfox',
        label: 'Or ask',
        results: [
          {
            type: 'askfox' as const,
            id: 'askfox',
            title: `Ask Fox: "${q}"`,
            subtitle: 'Hand this to the practice agent as a question',
            href: `${askFoxHref}?q=${encodeURIComponent(q)}`,
          },
        ],
      })
    }

    return out
  }, [
    debounced,
    recent,
    navItems,
    serverGroups,
    serverLoading,
    serverErrored,
    knowledge.error,
    knowledge.loading,
    knowledgeResults,
    askFoxHref,
  ])

  // Flatten navigable results for keyboard traversal.
  const flat = useMemo<SearchResult[]>(() => sections.flatMap(s => s.results), [sections])

  // Keep the highlight in range whenever the visible set changes.
  useEffect(() => {
    setHighlight(h => (flat.length === 0 ? 0 : Math.min(h, flat.length - 1)))
  }, [flat.length])

  const navigate = useCallback(
    (result: SearchResult) => {
      pushRecent({ title: result.title, href: result.href, type: result.type })
      onClose()
      if (result.href.startsWith('http')) window.open(result.href, '_blank', 'noopener,noreferrer')
      else router.push(result.href)
    },
    [router, onClose],
  )

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight(h => (flat.length === 0 ? 0 : (h + 1) % flat.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight(h => (flat.length === 0 ? 0 : (h - 1 + flat.length) % flat.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const target = flat[highlight]
        if (target) navigate(target)
      }
    },
    [flat, highlight, navigate],
  )

  // Flat index bookkeeping so each row knows its global position (React
  // renders synchronously top-to-bottom, so this counter is stable).
  let runningIndex = -1

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div
        className="absolute inset-0 bg-ink-navy/40 motion-safe:animate-[foxPaletteFade_120ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:mt-[10vh] sm:h-auto sm:max-h-[70vh] sm:w-full sm:max-w-xl sm:rounded-2xl motion-safe:animate-[foxPaletteIn_140ms_ease-out]">
        {/* Input row */}
        <div className="flex items-center gap-2 border-b border-cool-100 px-4">
          <Search className="h-5 w-5 shrink-0 text-cool-400" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setHighlight(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search deals, contacts, partners, knowledge…"
            className="h-14 flex-1 bg-transparent font-ui text-base text-navy outline-none placeholder:text-cool-400"
            autoComplete="off"
            spellCheck={false}
          />
          {serverLoading && (
            <span className="hidden font-ui text-xs text-cool-400 sm:inline">Searching…</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-md p-1.5 text-cool-400 hover:bg-cool-100 hover:text-cool-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto py-2">
          {sections.length === 0 && (
            <p className="px-4 py-6 text-center font-ui text-sm text-cool-400">Start typing to search.</p>
          )}
          {sections.map(section => (
            <div key={section.key} className="px-2 py-1">
              <p className="px-2 py-1 font-heading text-[11px] font-semibold uppercase tracking-wide text-cool-400">
                {section.label}
              </p>
              {section.results.map(result => {
                runningIndex += 1
                const index = runningIndex
                const active = index === highlight
                const Icon = TYPE_ICON[result.type]
                return (
                  <button
                    key={result.id}
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => navigate(result)}
                    className={`flex w-full items-center gap-3 rounded-[7px] px-2 py-2 text-left motion-safe:transition-colors ${
                      active ? 'bg-fog' : 'hover:bg-fog/60'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                        active ? 'bg-ink-navy text-white' : 'bg-fog text-muted'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-ui text-sm font-medium text-navy">
                        {result.title}
                      </span>
                      {result.subtitle && (
                        <span className="block truncate font-ui text-xs text-cool-400">
                          {result.subtitle}
                        </span>
                      )}
                    </span>
                    {result.badge && (
                      <span className="shrink-0 rounded-full bg-cool-100 px-2 py-0.5 font-ui text-[11px] text-cool-500">
                        {result.badge}
                      </span>
                    )}
                    {active && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-cool-400" aria-hidden="true" />
                    )}
                  </button>
                )
              })}
              {section.message && section.results.length === 0 && (
                <p className="px-2 py-2 font-ui text-xs text-cool-400">{section.message}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
