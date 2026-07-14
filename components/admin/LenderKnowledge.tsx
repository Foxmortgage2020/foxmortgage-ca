'use client'

// One lender's knowledge page: the markdown rendered in the house style,
// the profile's structured figures with their as-of dates beside them,
// active offers, and the approved-quote link into the rates browser.
// A draft profile carries its caveat; a withheld profile (MCAP) states
// the withholding instead of inventing figures.
//
// Knowledge-pipeline session: APPROVED claims render above the markdown
// with their citations (document, page, as-of — chip opens the source via
// a per-click signed URL); pending claims appear only as a count pointing
// at the approvals tab; the upload dropzone mints PENDING claims through
// the gates upload endpoint (token minted per action, never cached).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import { isStaleAsOf, KNOWLEDGE_STALE_DAYS, profileFigureRows, profileKnownGaps } from '@/lib/knowledge'
import {
  claimCitation,
  claimStalenessNote,
  documentStatusWording,
  groupApprovedByTopic,
  topicLabel,
  KNOWLEDGE_UPLOAD_KINDS,
  type KnowledgeUploadKind,
} from '@/lib/knowledge-claims'
import type { KnowledgeLenderDetail } from '@/lib/gates'
import type { KnowledgeClaimRow, KnowledgeDocumentRow } from '@/lib/underwriting'
import { lenderDisplayName } from '@/config/lenders'
import PromoCountdowns from '@/components/admin/PromoCountdowns'
import LenderMark from '@/components/admin/LenderMark'

const UPLOAD_KIND_LABELS: Record<KnowledgeUploadKind, string> = {
  broker_guide: 'broker guide',
  comp_schedule: 'comp schedule',
  policy_bulletin: 'policy bulletin',
  rate_guide: 'rate guide',
  other: 'other',
}

// 3 MB decoded. Vercel's ~4.5 MB request-body ceiling rejects a larger
// base64 JSON payload before any of our code runs, and the workbench zod
// cap is 4,200,000 base64 characters — 3 MB decoded (~4.2M chars encoded)
// fits both. Larger documents go through local ingest.
const MAX_UPLOAD_BYTES = 3_145_728

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// House-style markdown mapping: navy headings, readable body, bordered
// GFM tables that scroll inside their own container on phones.
const MD_COMPONENTS = {
  h1: (p: any) => <h2 className="font-heading text-navy font-bold text-lg mt-6 mb-2" {...p} />,
  h2: (p: any) => <h3 className="font-heading text-navy font-bold text-base mt-5 mb-2" {...p} />,
  h3: (p: any) => <h4 className="font-heading text-navy font-bold text-sm mt-4 mb-1.5" {...p} />,
  p: (p: any) => <p className="text-sm font-body text-gray-700 leading-relaxed my-2" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-5 my-2 space-y-1" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-5 my-2 space-y-1" {...p} />,
  li: (p: any) => <li className="text-sm font-body text-gray-700 leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-navy" {...p} />,
  code: (p: any) => <code className="text-[12px] bg-gray-100 rounded px-1 py-0.5" {...p} />,
  a: (p: any) => <a className="text-navy underline hover:text-lime" target="_blank" rel="noreferrer" {...p} />,
  table: (p: any) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm font-body border border-gray-200" {...p} />
    </div>
  ),
  th: (p: any) => (
    <th className="text-left text-xs text-gray-500 uppercase tracking-wide border border-gray-200 bg-gray-50 px-2 py-1.5" {...p} />
  ),
  td: (p: any) => <td className="border border-gray-100 px-2 py-1.5 text-gray-700 align-top" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-lime pl-3 my-2 text-gray-600" {...p} />,
  hr: () => <hr className="my-4 border-gray-200" />,
}

export default function LenderKnowledge({
  slug,
  todayYMD,
  approvedQuoteCount,
  claims,
  documents,
  canUpload,
}: {
  slug: string
  todayYMD: string
  approvedQuoteCount: number | null
  claims: KnowledgeClaimRow[]
  documents: KnowledgeDocumentRow[]
  canUpload: boolean
}) {
  const { data, error, loading, retry } = useKnowledgeFetch<KnowledgeLenderDetail>(
    `/api/portal/admin/knowledge/lenders/${encodeURIComponent(slug)}`,
  )
  const router = useRouter()
  const mintGatesToken = useGatesToken()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<KnowledgeUploadKind>('broker_guide')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadOutcome, setUploadOutcome] = useState<string | null>(null)
  const [docOpenError, setDocOpenError] = useState<string | null>(null)

  const docNameById = new Map(documents.map(d => [d.id, d.docType]))
  const approvedGroups = groupApprovedByTopic(claims)
  const pendingCount = claims.filter(c => c.status === 'pending').length

  // Open the source document via a per-click signed URL. The tab opens
  // synchronously on the click (popup blockers) and navigates once the
  // 60-second URL arrives.
  const openDocument = async (documentId: string) => {
    setDocOpenError(null)
    const tab = window.open('', '_blank', 'noopener')
    try {
      const token = await mintGatesToken()
      const res = await fetch(`/api/portal/admin/knowledge/document-url/${encodeURIComponent(documentId)}`, {
        headers: token ? { [GATES_TOKEN_HEADER]: token } : undefined,
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (json?.ok && typeof json.data?.url === 'string') {
        if (tab) tab.location.href = json.data.url
        else window.open(json.data.url, '_blank', 'noopener')
        return
      }
      tab?.close()
      setDocOpenError(json?.message ?? `Could not open the document (HTTP ${res.status}).`)
    } catch {
      tab?.close()
      setDocOpenError('Could not reach the server. Check your connection and retry.')
    }
  }

  const upload = async () => {
    if (!file || uploading) return
    setUploadError(null)
    setUploadOutcome(null)
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('3 MB limit (larger documents: local ingest)')
      return
    }
    setUploading(true)
    try {
      const contentBase64 = await fileToBase64(file)
      // Fresh 60-second gates token per action, minted on the signed-in
      // session in the browser (backend mints carry no azp claim).
      const token = await mintGatesToken()
      const res = await fetch('/api/portal/admin/knowledge/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
        },
        body: JSON.stringify({
          lender_slug: slug,
          file_name: file.name,
          kind,
          content_base64: contentBase64,
        }),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        const extraction = json.data?.extraction as
          | { outcome?: string; drafted?: number; confirmations?: number; conflicts?: number }
          | null
          | undefined
        const dupOf = json.data?.dupOf
        if (dupOf) {
          setUploadOutcome('This document was already uploaded; nothing new was drafted.')
        } else if (extraction && typeof extraction.drafted === 'number') {
          const parts = [`${extraction.drafted} claim${extraction.drafted === 1 ? '' : 's'} drafted, awaiting approval`]
          if (extraction.confirmations) parts.push(`${extraction.confirmations} confirmation${extraction.confirmations === 1 ? '' : 's'}`)
          if (extraction.conflicts) parts.push(`${extraction.conflicts} conflict${extraction.conflicts === 1 ? '' : 's'}`)
          setUploadOutcome(`Uploaded. ${parts.join(', ')}.`)
        } else {
          setUploadOutcome('Uploaded. Extraction is queued; the status trail below updates as it runs.')
        }
        setFile(null)
        router.refresh()
      } else {
        setUploadError(json?.message ?? `Upload failed (HTTP ${res.status}).`)
      }
    } catch {
      setUploadError('Could not reach the server. Check your connection and retry.')
    } finally {
      setUploading(false)
    }
  }

  // The claims sections stand on their own — they render from the granted
  // workbench tables whether or not a git-versioned knowledge page exists
  // for this slug, so an upload-only lender (registry entry, no markdown)
  // still shows its claims, status trail, and dropzone.
  const approvedKnowledgeSection = (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="font-heading text-navy font-bold text-base mb-3">Approved knowledge</h2>
      {approvedGroups.length === 0 ? (
        <p className="text-sm text-gray-400 font-body">
          No approved claims yet. Upload a lender document below; extraction drafts claims and
          each one waits for approval before it is citable.
        </p>
      ) : (
        <div className="space-y-4">
          {approvedGroups.map(group => (
            <div key={group.topic}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {topicLabel(group.topic)}
              </p>
              <div className="space-y-2">
                {group.claims.map(claim => {
                  const staleness = claimStalenessNote(claim.asOfDate, todayYMD)
                  const docName = claim.sourceDocumentId ? (docNameById.get(claim.sourceDocumentId) ?? null) : null
                  return (
                    <div key={claim.id} className="border border-gray-100 rounded-lg px-3 py-2">
                      <p className="text-sm font-body text-gray-700">{claim.claimText}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {claim.sourceDocumentId ? (
                          <button
                            onClick={() => void openDocument(claim.sourceDocumentId!)}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy hover:bg-navy/20"
                            title="Open the source document (signed URL, minted per click)"
                          >
                            {claimCitation(claim, docName)}
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {claimCitation(claim, docName)}
                          </span>
                        )}
                        {staleness && (
                          <span className="text-[11px] font-body text-amber-700">{staleness}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {pendingCount > 0 && (
        <p className="mt-3 pt-3 border-t border-gray-100 text-sm font-body text-amber-800">
          {pendingCount} claim{pendingCount === 1 ? '' : 's'} awaiting approval{' '}
          <Link href="/portal/admin/approvals?tab=knowledge" className="font-semibold underline text-navy hover:text-lime">
            &rarr; Approvals
          </Link>
        </p>
      )}
      {docOpenError && <p className="mt-2 text-xs text-red-700 font-body">{docOpenError}</p>}
    </div>
  )

  const sourceDocumentsSection = (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h2 className="font-heading text-navy font-bold text-base mb-3">Source documents</h2>
      {canUpload && (
        <div className="border border-dashed border-gray-300 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".pdf,.docx,.doc,.xlsx,.txt,.md"
              onChange={e => {
                setFile(e.target.files?.[0] ?? null)
                setUploadError(null)
                setUploadOutcome(null)
              }}
              className="text-sm font-body text-gray-600"
            />
            <select
              value={kind}
              onChange={e => setKind(e.target.value as KnowledgeUploadKind)}
              className="text-sm font-body border border-gray-200 rounded-lg px-2 py-1.5 text-navy"
            >
              {KNOWLEDGE_UPLOAD_KINDS.map(k => (
                <option key={k} value={k}>
                  {UPLOAD_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <button
              onClick={() => void upload()}
              disabled={!file || uploading}
              className="min-h-[40px] px-4 py-2 rounded-lg text-sm font-semibold font-body bg-lime text-navy hover:bg-lime/80 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 font-body mt-2">
            3 MB limit (larger documents: local ingest). Extraction drafts pending claims; nothing
            becomes citable knowledge until each claim is approved.
          </p>
          {uploadOutcome && <p className="mt-2 text-sm text-green-800 font-body">{uploadOutcome}</p>}
          {uploadError && <p className="mt-2 text-sm text-red-700 font-body">{uploadError}</p>}
        </div>
      )}
      {documents.length === 0 ? (
        <p className="text-sm text-gray-400 font-body">No knowledge documents uploaded for this lender yet.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {documents.map(doc => {
            const pendingForDoc = claims.filter(c => c.sourceDocumentId === doc.id && c.status === 'pending').length
            const approvedForDoc = claims.filter(c => c.sourceDocumentId === doc.id && c.status === 'approved').length
            const status = documentStatusWording(doc, pendingForDoc, approvedForDoc)
            const toneCls = {
              gray: 'text-gray-500',
              amber: 'text-amber-700',
              green: 'text-green-700',
              red: 'text-red-700 font-bold',
            }[status.tone]
            return (
              <div key={doc.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-sm font-body font-semibold text-navy break-words">{doc.docType}</span>
                {doc.knowledgeKind && (
                  <span className="text-[11px] text-gray-400 font-body">{doc.knowledgeKind.replace(/_/g, ' ')}</span>
                )}
                <span className={`text-xs font-body ${toneCls}`}>{status.text}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  if (loading) return <p className="text-sm text-gray-400 font-body py-4">Loading lender knowledge…</p>
  if (error || !data) {
    // A registry lender with no git-versioned knowledge page is a normal
    // state (uploads are accepted for any registry lender): the claims
    // pipeline sections still render, so uploaded claims are viewable and
    // new documents can land. Any other failure keeps the retry banner.
    if (error?.includes('Not found')) {
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <LenderMark slug={slug} name={lenderDisplayName(slug)} size={34} />
            <h1 className="font-heading text-navy text-2xl font-bold">{lenderDisplayName(slug)}</h1>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm text-amber-800 font-body">
              No knowledge page yet — claims only. This lender has no git-versioned notes or
              machine profile; the approved claims and source documents below are the knowledge.
            </p>
          </div>
          {approvedKnowledgeSection}
          {sourceDocumentsSection}
        </div>
      )
    }
    return (
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <p className="text-sm text-amber-800 font-body">
          Lender knowledge unavailable: {error}
        </p>
        <button onClick={retry} className="shrink-0 text-sm font-semibold text-amber-800 underline py-1.5">
          Retry
        </button>
      </div>
    )
  }

  const stale = isStaleAsOf(data.as_of, todayYMD)
  const figures = profileFigureRows(data.profile)
  const gaps = profileKnownGaps(data.profile)

  return (
    <div className="space-y-4">
      {/* Header chips */}
      <div className="flex flex-wrap items-center gap-2">
        <LenderMark slug={data.slug} name={data.name} size={34} />
        <h1 className="font-heading text-navy text-2xl font-bold">{data.name}</h1>
        {data.as_of && <span className="text-xs font-body text-gray-500">profile as of {data.as_of}</span>}
        {stale && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
            stale: older than {KNOWLEDGE_STALE_DAYS} days
          </span>
        )}
      </div>

      {data.draft && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-body">
            Draft profile: the red-pen review is pending. Verify any figure against the source
            before quoting it to a client or lender.
          </p>
        </div>
      )}

      {/* Structured figures with their as-of dates */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Structured figures</h2>
        {data.profile === null ? (
          <p className="text-sm text-gray-500 font-body">
            The machine profile for this lender is deliberately withheld; the notes below are the
            knowledge. No figures are invented here.
          </p>
        ) : figures.length === 0 ? (
          <p className="text-sm text-gray-400 font-body">The profile carries no figure entries yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {figures.map((f, i) => (
              <div key={i} className="py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-xs font-body text-gray-500 capitalize">{f.path}</span>
                <span className="text-sm font-body font-semibold text-navy break-words">{f.value}</span>
                <span className="text-[11px] text-gray-400 ml-auto">
                  {f.asOf ? `as of ${f.asOf}` : 'context'}
                  {f.source ? ` · ${f.source}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {gaps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Known gaps</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {gaps.map((g, i) => (
                <li key={i} className="text-xs font-body text-gray-500">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Offers and rates cross-links */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-navy font-bold text-base">Active offers</h2>
          <Link
            href={`/portal/admin/rates?lender=${encodeURIComponent(data.slug)}`}
            className="text-xs font-semibold text-navy hover:text-lime"
          >
            {approvedQuoteCount !== null ? `${approvedQuoteCount} approved quotes in Rates` : 'Rates'} &rarr;
          </Link>
        </div>
        <PromoCountdowns lenderSlug={data.slug} />
      </div>

      {/* Approved knowledge (Michael-approved claims with citations; pending
          only as the count line) and the source documents with the upload
          dropzone — both render above the markdown. */}
      {approvedKnowledgeSection}
      {sourceDocumentsSection}

      {/* The knowledge markdown, verbatim content in house styling */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-1">Notes</h2>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS as any}>
          {data.markdown}
        </ReactMarkdown>
      </div>

      <p className="text-xs text-gray-400 font-body">
        This content is git-versioned in the workbench repo and updates ship with its deploys.
        Every figure keeps its as-of date; never quote one without it.
      </p>
    </div>
  )
}
