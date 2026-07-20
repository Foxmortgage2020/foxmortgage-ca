'use client'

// The Contacts section on the lender detail page (P1). Approved BDM /
// underwriter contacts render with tap-to-call (the workbench's pre-built tel
// href, extension and all) and tap-to-email. When the user can manage
// contacts, an add form, an inline edit (supersede), and a retire-with-reason
// confirm sit alongside. Contacts are reference data, not a decision queue, so
// there is NO lime and NO decision token here: calm navy and cool grays only,
// action buttons navy or outline. Writes mint a fresh gates token per action
// and post to the gated proxy; the workbench is authoritative and a refusal
// never renders as saved.

import { useState } from 'react'
import { Mail, Phone } from 'lucide-react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import {
  validateContactDraft,
  type ContactDraft,
  type LenderContactCard,
} from '@/lib/lender-contacts'

const inputCls =
  'w-full border border-cool-200 rounded-lg px-2.5 py-1.5 text-sm font-ui focus:outline-none focus:border-navy'
const btnNavy =
  'rounded-lg bg-navy text-white text-xs font-ui font-semibold px-3 py-1.5 hover:bg-navy/90 disabled:opacity-50'
const btnOutline =
  'rounded-lg border border-cool-300 text-navy text-xs font-ui font-semibold px-3 py-1.5 hover:border-navy disabled:opacity-50'

export default function LenderContacts({
  slug,
  contacts,
  loading,
  error,
  canManage,
  onRefetch,
}: {
  slug: string
  contacts: LenderContactCard[]
  loading: boolean
  error: string | null
  canManage: boolean
  onRefetch: () => void
}) {
  const mint = useGatesToken()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [retiringId, setRetiringId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function closeForms() {
    setAdding(false)
    setEditingId(null)
    setRetiringId(null)
    setFormError(null)
  }
  function openAdd() {
    closeForms()
    setAdding(true)
  }
  function openEdit(id: string) {
    closeForms()
    setEditingId(id)
  }
  function openRetire(id: string) {
    closeForms()
    setRetiringId(id)
  }

  async function runWrite(path: string, body: Record<string, unknown>) {
    setBusy(true)
    setFormError(null)
    try {
      const token = await mint()
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { [GATES_TOKEN_HEADER]: token } : {}) },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        closeForms()
        onRefetch()
        return
      }
      setFormError(json?.message ?? `The contacts service did not answer (HTTP ${res.status}).`)
    } catch {
      setFormError('Could not reach the server. Check your connection and retry.')
    } finally {
      setBusy(false)
    }
  }

  function submitAdd(draft: ContactDraft) {
    const invalid = validateContactDraft(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }
    runWrite('/api/portal/admin/gates/lender-contacts/create', { lender_slug: slug, ...draft })
  }
  function submitEdit(id: string, draft: ContactDraft) {
    const invalid = validateContactDraft(draft)
    if (invalid) {
      setFormError(invalid)
      return
    }
    runWrite(`/api/portal/admin/gates/lender-contacts/${id}/decision`, { action: 'supersede', ...draft })
  }
  function submitRetire(id: string, reason: string) {
    if (reason.trim().length < 5) {
      setFormError('Give a short reason of at least 5 characters.')
      return
    }
    runWrite(`/api/portal/admin/gates/lender-contacts/${id}/decision`, { action: 'retire', reason })
  }

  const showEmpty = !loading && !error && contacts.length === 0

  return (
    <div className="mt-4" data-testid="lender-contacts">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-heading text-navy font-bold text-sm">Contacts</h3>
        {canManage && !adding && (
          <button onClick={openAdd} className={btnOutline} data-testid="contact-add">
            Add contact
          </button>
        )}
      </div>

      {error && (
        <div className="bg-white border border-cool-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-cool-600 font-ui">{error}</p>
          <button onClick={onRefetch} className={btnOutline}>
            Retry
          </button>
        </div>
      )}

      {loading && contacts.length === 0 && !error && (
        <p className="text-xs text-cool-500 font-ui">Loading contacts.</p>
      )}

      {showEmpty && (
        <p className="text-sm text-cool-500 font-ui bg-white border border-cool-200 rounded-lg p-4">
          No contacts saved for this lender yet.{' '}
          {canManage ? 'Add the BDM or underwriter you work with.' : 'Ask an admin to add the BDM or underwriter.'}
        </p>
      )}

      <div className="space-y-2">
        {contacts.map(c =>
          editingId === c.id ? (
            <ContactForm
              key={c.id}
              initial={c}
              busy={busy}
              error={formError}
              submitLabel="Save changes"
              onSubmit={draft => submitEdit(c.id, draft)}
              onCancel={closeForms}
            />
          ) : (
            <div key={c.id}>
              <ContactRow
                c={c}
                canManage={canManage}
                onEdit={() => openEdit(c.id)}
                onRetire={() => openRetire(c.id)}
              />
              {retiringId === c.id && (
                <RetirePanel busy={busy} error={formError} onConfirm={reason => submitRetire(c.id, reason)} onCancel={closeForms} />
              )}
            </div>
          ),
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <ContactForm busy={busy} error={formError} submitLabel="Save contact" onSubmit={submitAdd} onCancel={closeForms} />
        </div>
      )}
    </div>
  )
}

function ContactRow({
  c,
  canManage,
  onEdit,
  onRetire,
}: {
  c: LenderContactCard
  canManage: boolean
  onEdit: () => void
  onRetire: () => void
}) {
  return (
    <div className="bg-white border border-cool-200 rounded-lg p-3" data-testid={`contact-${c.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-ui font-semibold text-navy">{c.name}</p>
          {c.title && <p className="text-xs text-cool-500 font-ui">{c.title}</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={onEdit} className="text-xs font-ui font-semibold text-navy hover:text-ink" data-testid={`contact-edit-${c.id}`}>
              Edit
            </button>
            <button onClick={onRetire} className="text-xs font-ui text-cool-500 hover:text-navy" data-testid={`contact-retire-${c.id}`}>
              Retire
            </button>
          </div>
        )}
      </div>
      {(c.tel || c.email) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {c.tel && (
            <a
              href={c.tel}
              className="inline-flex items-center gap-1.5 text-sm font-ui text-navy hover:text-ink"
              data-testid={`contact-tel-${c.id}`}
            >
              <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden />
              <span className="tabular-nums">{c.phone_display}</span>
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="inline-flex items-center gap-1.5 text-sm font-ui text-navy hover:text-ink break-all"
              data-testid={`contact-email-${c.id}`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
              {c.email}
            </a>
          )}
        </div>
      )}
      {c.note && <p className="mt-1.5 text-xs text-cool-600 font-ui">{c.note}</p>}
    </div>
  )
}

function ContactForm({
  initial,
  busy,
  error,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: LenderContactCard
  busy: boolean
  error: string | null
  submitLabel: string
  onSubmit: (draft: ContactDraft) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [extension, setExtension] = useState(initial?.phone_ext ?? '')
  const [note, setNote] = useState(initial?.note ?? '')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name: name.trim(),
      title: title.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      extension: extension.trim() || undefined,
      note: note.trim() || undefined,
    })
  }

  return (
    <form onSubmit={submit} className="bg-white border border-cool-200 rounded-lg p-3 space-y-2.5" data-testid="contact-form">
      <div>
        <label className="block text-xs font-ui font-semibold text-cool-600 mb-1">
          Name <span className="text-cool-400 font-normal">(required)</span>
        </label>
        <input value={name} onChange={e => setName(e.target.value)} className={inputCls} autoComplete="off" data-testid="contact-field-name" />
      </div>
      <div>
        <label className="block text-xs font-ui font-semibold text-cool-600 mb-1">Role</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="BDM, underwriter, and so on" autoComplete="off" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2.5">
        <div>
          <label className="block text-xs font-ui font-semibold text-cool-600 mb-1">Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} inputMode="tel" autoComplete="off" data-testid="contact-field-phone" />
        </div>
        <div>
          <label className="block text-xs font-ui font-semibold text-cool-600 mb-1">Extension</label>
          <input value={extension} onChange={e => setExtension(e.target.value)} className={inputCls} inputMode="numeric" autoComplete="off" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-ui font-semibold text-cool-600 mb-1">Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} inputMode="email" autoComplete="off" data-testid="contact-field-email" />
      </div>
      <div>
        <label className="block text-xs font-ui font-semibold text-cool-600 mb-1">Notes</label>
        <input value={note} onChange={e => setNote(e.target.value)} className={inputCls} placeholder="What this contact is good for" autoComplete="off" />
      </div>
      <p className="text-[11px] text-cool-400 font-ui">Add a phone number or an email so you can reach them.</p>
      {error && <p className="text-xs text-red-600 font-ui" data-testid="contact-form-error">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className={btnNavy} data-testid="contact-submit">
          {busy ? 'Saving.' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={btnOutline}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function RetirePanel({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean
  error: string | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="mt-1.5 bg-white border border-cool-200 rounded-lg p-3 space-y-2" data-testid="contact-retire-panel">
      <p className="text-xs text-cool-600 font-ui">
        Retire this contact? It stops showing on the card. Add a short reason for the record.
      </p>
      <input
        value={reason}
        onChange={e => setReason(e.target.value)}
        className={inputCls}
        placeholder="Left the desk, changed lenders, and so on"
        autoComplete="off"
        data-testid="contact-retire-reason"
      />
      {error && <p className="text-xs text-red-600 font-ui">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={() => onConfirm(reason)} disabled={busy} className={btnNavy} data-testid="contact-retire-confirm">
          {busy ? 'Retiring.' : 'Retire contact'}
        </button>
        <button onClick={onCancel} disabled={busy} className={btnOutline}>
          Cancel
        </button>
      </div>
    </div>
  )
}
