'use client';

// Three fields intentionally deferred from this page:
// - SIN: captured at deal level in Finmo, not in the CRM
//   (PIPEDA / compliance concerns)
// - Compliance Status + Last Review: will be workflow-driven from the
//   Ontario Compliance Checklist Loop 2 work; manual entry would be
//   brittle. Both fields will come from that workflow when it lands.

import { useState, useEffect, useCallback } from 'react'
import PortalErrorState from '@/components/PortalErrorState'

interface PartnerProfile {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  street: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  partnerType: string | null
  partnerStatus: string | null
  dateOfBirth: string | null
  residencyStatus: string | null
  entityType: string | null
  riskProfile: string | null
  investorPreferences: string | null
}

// The 10 fields we measure completion against — matches the 10 fields
// rendered below (address is one logical field even though it's
// composed of four columns in Zoho).
const COMPLETION_FIELD_KEYS = [
  'name',
  'email',
  'phone',
  'dateOfBirth',
  'residencyStatus',
  'partnerType',
  'entityType',
  'riskProfile',
  'investorPreferences',
  'address',
] as const

function isAddressComplete(p: PartnerProfile): boolean {
  return Boolean(p.street && p.city && p.province && p.postalCode)
}

function fieldFilled(p: PartnerProfile, key: typeof COMPLETION_FIELD_KEYS[number]): boolean {
  if (key === 'address') return isAddressComplete(p)
  const v = p[key as keyof PartnerProfile]
  return typeof v === 'string' && v.trim().length > 0
}

function computeCompletion(p: PartnerProfile): number {
  const filled = COMPLETION_FIELD_KEYS.filter(k => fieldFilled(p, k)).length
  const raw = (filled / COMPLETION_FIELD_KEYS.length) * 100
  // Round to nearest 10% per spec.
  return Math.round(raw / 10) * 10
}

function formatDob(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmt(v: string | null | undefined): string {
  if (v == null) return '—'
  const trimmed = String(v).trim()
  return trimmed.length > 0 ? trimmed : '—'
}

function formatAddress(p: PartnerProfile): string {
  const parts = [p.street, p.city, p.province, p.postalCode].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

export default function InvestorProfilePage() {
  const [profile, setProfile] = useState<PartnerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setupPending, setSetupPending] = useState(false)

  const loadProfile = useCallback(() => {
    setLoading(true)
    setError(null)
    setSetupPending(false)
    fetch('/api/portal/investor/profile')
      .then(async (res) => {
        const data = await res.json()
        if (data.setup_pending) { setSetupPending(true); return }
        if (data.error) { setError(data.error); return }
        setProfile(data.profile)
      })
      .catch(err => setError(err.message ?? 'Failed to load profile'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin mb-4" />
      <p className="font-body text-gray-500">Loading your profile...</p>
    </div>
  )
  if (error) return <PortalErrorState message={error} onRetry={loadProfile} />
  if (setupPending) return (
    <div className="bg-lime/10 border border-lime/30 rounded-xl p-6 text-center max-w-xl mx-auto">
      <h2 className="font-heading text-navy text-lg mb-2">Profile Setup Pending</h2>
      <p className="font-body text-gray-600">
        Contact Michael at{' '}
        <a href="mailto:mfox@foxmortgage.ca" className="text-lime font-semibold hover:underline">mfox@foxmortgage.ca</a>{' '}
        to finish setup.
      </p>
    </div>
  )
  if (!profile) return null

  const completion = computeCompletion(profile)
  const address = formatAddress(profile)

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Investor Profile</h1>
      <p className="font-body text-gray-500 text-sm mb-6">
        Your personal information and investor profile. Updates are coordinated through Mike to keep records consistent.
      </p>

      {/* Profile Completion */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="font-heading text-navy font-semibold text-sm">Profile Completion</p>
            {completion < 100 && (
              <p className="text-gray-400 text-xs font-body mt-0.5">
                Contact Mike to update your profile
              </p>
            )}
          </div>
          <span className="font-heading text-navy text-2xl font-bold">{completion}%</span>
        </div>
        <div className="h-2 bg-navy/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-lime rounded-full transition-all duration-500"
            style={{ width: `${completion}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-heading text-lg font-bold text-navy mb-4">Personal Information</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-gray-500 text-xs font-body">Name</dt>
              <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(profile.name)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-body">Email</dt>
              <dd className="text-navy font-medium text-sm font-body mt-0.5 break-all">{fmt(profile.email)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-body">Phone</dt>
              <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(profile.mobile || profile.phone)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-body">Date of Birth</dt>
              <dd className="text-navy font-medium text-sm font-body mt-0.5">{formatDob(profile.dateOfBirth)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-500 text-xs font-body">Residency Status</dt>
              <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(profile.residencyStatus)}</dd>
            </div>
          </dl>
        </section>

        {/* Investor Profile */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-heading text-lg font-bold text-navy mb-4">Investor Profile</h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-gray-500 text-xs font-body">Partner Type</dt>
              <dd className="mt-1">
                {profile.partnerType ? (
                  <span className="inline-block bg-navy text-lime rounded-full px-3 py-1 text-sm font-body font-semibold">
                    {profile.partnerType}
                  </span>
                ) : (
                  <span className="text-navy font-medium text-sm font-body">—</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-gray-500 text-xs font-body">Entity Type</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(profile.entityType)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs font-body">Risk Profile</dt>
                <dd className="text-navy font-medium text-sm font-body mt-0.5">{fmt(profile.riskProfile)}</dd>
              </div>
            </div>
            <div>
              <dt className="text-gray-500 text-xs font-body">Investor Preferences</dt>
              <dd className="mt-1">
                {profile.investorPreferences && profile.investorPreferences.trim().length > 0 ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 max-h-32 overflow-y-auto">
                    <p className="text-navy text-sm font-body whitespace-pre-wrap">{profile.investorPreferences}</p>
                  </div>
                ) : (
                  <span className="text-navy font-medium text-sm font-body">—</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Contact */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <h2 className="font-heading text-lg font-bold text-navy mb-4">Contact</h2>
          <dl>
            <div>
              <dt className="text-gray-500 text-xs font-body">Mailing Address</dt>
              <dd className="text-navy font-medium text-sm font-body mt-0.5 whitespace-pre-line">
                {address === '—' ? '—' : (
                  <>
                    {profile.street && <>{profile.street}<br /></>}
                    {(profile.city || profile.province) && (
                      <>
                        {[profile.city, profile.province].filter(Boolean).join(', ')}
                        {profile.postalCode ? `  ${profile.postalCode}` : ''}
                      </>
                    )}
                  </>
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}
