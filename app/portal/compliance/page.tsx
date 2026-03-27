'use client'

import { useState } from 'react'
import { Shield, CheckCircle2, FileText, Lock, AlertTriangle } from 'lucide-react'

const dataStatements = [
  'Client data is encrypted at rest and in transit using AES-256 encryption.',
  'All data is stored on Canadian servers in compliance with PIPEDA requirements.',
  'Client information is only shared between authorized partners with documented consent.',
  'Data retention follows a strict 7-year policy aligned with mortgage industry standards.',
]

const bottomCards = [
  {
    icon: Shield,
    title: 'PIPEDA Compliant',
    description:
      'All data handling follows the Personal Information Protection and Electronic Documents Act.',
    color: 'bg-green-100 text-green-600',
  },
  {
    icon: FileText,
    title: 'Mortgage Regulations',
    description:
      'Operations comply with FSRA and provincial mortgage brokerage licensing requirements.',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: Lock,
    title: 'Data Security',
    description:
      'SOC 2 Type II certified infrastructure with continuous monitoring and penetration testing.',
    color: 'bg-purple-100 text-purple-600',
  },
]

export default function CompliancePage() {
  const [toggles, setToggles] = useState({
    dataProcessing: true,
    email: true,
    marketing: false,
  })

  const handleToggle = (key: keyof typeof toggles) => {
    setToggles({ ...toggles, [key]: !toggles[key] })
  }

  return (
    <div>
      {/* PIPEDA Banner */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center gap-3">
        <Shield className="w-5 h-5 text-lime-dark shrink-0" />
        <p className="font-body text-sm text-gray-700">
          <span className="font-semibold text-navy">PIPEDA Compliance</span> — Fox Mortgage
          adheres to Canada&apos;s Personal Information Protection and Electronic Documents Act. All
          partner data handling is audited quarterly.
        </p>
      </div>

      {/* Compliance Status Card */}
      <div className="bg-white border border-gray-100 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-semibold text-navy text-base">Compliance Status</h3>
          <span className="flex items-center gap-1.5 bg-green-100 text-green-700 font-body text-xs font-semibold px-3 py-1 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Compliant
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
            <FileText className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-body text-xs text-gray-500">Data Processing Agreement</div>
              <div className="font-body text-sm font-medium text-navy">
                Accepted on Jan 15, 2026
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
            <FileText className="w-4 h-4 text-gray-400" />
            <div>
              <div className="font-body text-xs text-gray-500">Agreement Version</div>
              <div className="font-body text-sm font-medium text-navy">v3.2 — March 2026</div>
            </div>
          </div>
        </div>
      </div>

      {/* Two Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Data Sharing Statement */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-navy text-base mb-4">
            Data Sharing Statement
          </h3>
          <div className="space-y-3">
            {dataStatements.map((statement, i) => (
              <div key={i} className="flex gap-3 border-l-2 border-lime pl-4">
                <p className="font-body text-sm text-gray-600">{statement}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Consent Management */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-navy text-base mb-4">
            Consent Management
          </h3>
          <div className="space-y-4 mb-6">
            {/* Data Processing */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body text-sm font-medium text-navy">Data Processing</div>
                <div className="font-body text-xs text-gray-500">
                  Allow processing of client referral data
                </div>
              </div>
              <button
                onClick={() => handleToggle('dataProcessing')}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  toggles.dataProcessing ? 'bg-lime' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    toggles.dataProcessing ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Email Communications */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body text-sm font-medium text-navy">
                  Email Communications
                </div>
                <div className="font-body text-xs text-gray-500">
                  Receive email updates about clients
                </div>
              </div>
              <button
                onClick={() => handleToggle('email')}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  toggles.email ? 'bg-lime' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    toggles.email ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Marketing */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-body text-sm font-medium text-navy">Marketing</div>
                <div className="font-body text-xs text-gray-500">
                  Receive marketing and promotional content
                </div>
              </div>
              <button
                onClick={() => handleToggle('marketing')}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  toggles.marketing ? 'bg-lime' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    toggles.marketing ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="flex-1 bg-lime text-navy font-heading font-bold text-sm px-4 py-3 rounded-lg hover:bg-lime-dark transition-colors">
              Save Preferences
            </button>
            <button className="flex items-center gap-2 border border-red-200 text-red-600 font-body text-sm px-4 py-3 rounded-lg hover:bg-red-50 transition-colors">
              <AlertTriangle className="w-4 h-4" />
              Request Data Deletion
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bottomCards.map((card) => (
          <div
            key={card.title}
            className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow"
          >
            <div
              className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center mb-3`}
            >
              <card.icon className="w-5 h-5" />
            </div>
            <h4 className="font-heading font-semibold text-navy text-sm mb-1">{card.title}</h4>
            <p className="font-body text-xs text-gray-500">{card.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
