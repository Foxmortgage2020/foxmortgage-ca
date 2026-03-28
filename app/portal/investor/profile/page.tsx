'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Shield, ChevronRight, LogOut } from 'lucide-react';

export default function ProfilePage() {
  const personalInfo = [
    { label: 'Full Legal Name', value: 'Michael Fox' },
    { label: 'Email', value: 'mfox@foxmortgage.ca' },
    { label: 'Phone', value: '(519) 555-0123' },
    { label: 'Date of Birth', value: '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' },
    { label: 'Mailing Address', value: 'Fergus, Ontario' },
    { label: 'SIN', value: '\u2022\u2022\u2022-\u2022\u2022\u2022-\u2022\u2022\u2022' },
    { label: 'Residency Status', value: 'Canadian Citizen' },
    { label: 'Entity Type', value: 'Personal Account' },
  ];

  const complianceDocs = [
    { type: 'KYC Verification', status: 'Verified', statusColor: 'bg-green-100 text-green-700', date: 'Jan 15, 2024', actions: ['View', 'Replace'] },
    { type: 'AML Compliance', status: 'Verified', statusColor: 'bg-green-100 text-green-700', date: 'Jan 15, 2024', actions: ['View', 'Replace'] },
    { type: 'Accredited Investor', status: 'Pending', statusColor: 'bg-yellow-100 text-yellow-700', date: 'N/A', actions: ['Upload'] },
    { type: 'Subscription Agreement', status: 'Verified', statusColor: 'bg-green-100 text-green-700', date: 'Jan 17, 2024', actions: ['View'] },
    { type: 'Risk Disclosure', status: 'Verified', statusColor: 'bg-green-100 text-green-700', date: 'Jan 17, 2024', actions: ['View'] },
  ];

  const signatureHistory = [
    { doc: 'Subscription Agreement', date: 'Jan 17, 2024', method: 'In-Portal' },
    { doc: 'Risk Disclosure', date: 'Jan 17, 2024', method: 'In-Portal' },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Investor Profile</h1>
      <p className="font-body text-gray-500 text-sm mb-6">Manage your personal information, compliance documents, and preferences</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold text-navy">Personal Information</h2>
              <button className="text-lime text-sm font-medium hover:underline">&#9997;&#65039; Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {personalInfo.map((field) => (
                <div key={field.label}>
                  <p className="text-gray-500 text-xs font-body">{field.label}</p>
                  <p className="text-navy font-medium text-sm font-body">{field.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance & Documents */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-heading text-lg font-bold text-navy mb-4">Compliance & Documents</h2>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-400 font-body uppercase tracking-wider border-b">
                  <th className="pb-3">Document Type</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Uploaded Date</th>
                  <th className="pb-3">Action</th>
                </tr>
              </thead>
              <tbody className="font-body text-sm">
                {complianceDocs.map((doc) => (
                  <tr key={doc.type} className="border-b last:border-b-0">
                    <td className="py-3 text-navy font-medium">{doc.type}</td>
                    <td className="py-3">
                      <span className={`${doc.statusColor} px-2 py-0.5 rounded-full text-xs font-medium`}>
                        {doc.status === 'Verified' ? '\u2713 ' : '\u26a0 '}{doc.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-500">{doc.date}</td>
                    <td className="py-3">
                      <div className="flex gap-2">
                        {doc.actions.map((action) => (
                          <button key={action} className="text-lime text-sm hover:underline">{action}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Banking Information */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold text-navy">Banking Information</h2>
              <button className="text-lime text-sm font-medium hover:underline">{'\ud83d\udee1\ufe0f'} Update Banking Info</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-500 text-xs font-body">Bank</p>
                <p className="text-navy font-medium text-sm font-body">TD Canada Trust</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Account</p>
                <p className="text-navy font-medium text-sm font-body">{'\u2022\u2022\u2022-\u2022\u2022\u2022-4521'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Transit</p>
                <p className="text-navy font-medium text-sm font-body">{'\u2022\u2022\u2022\u2022\u2022'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Institution</p>
                <p className="text-navy font-medium text-sm font-body">004</p>
              </div>
            </div>
            <p className="text-gray-400 text-xs font-body">Last updated: January 10, 2024</p>
            <p className="text-gray-400 text-xs font-body mt-1">Changes to banking information require identity verification and may take 1-2 business days to process.</p>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-1 space-y-6">
          {/* Investor Preferences */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-heading text-lg font-bold text-navy mb-1">Investor Preferences</h2>
            <p className="font-body text-gray-500 text-xs mb-4">Communication Preferences</p>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 font-body text-sm text-navy">
                <input type="checkbox" defaultChecked className="accent-lime w-4 h-4" /> Email notifications
              </label>
              <label className="flex items-center gap-2 font-body text-sm text-navy">
                <input type="checkbox" className="accent-lime w-4 h-4" /> SMS alerts
              </label>
              <label className="flex items-center gap-2 font-body text-sm text-navy">
                <input type="checkbox" defaultChecked className="accent-lime w-4 h-4" /> Portal notifications only
              </label>
            </div>
            <p className="font-body text-gray-500 text-xs mb-1">Update Frequency</p>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-navy font-body mb-4">
              <option>Monthly Portfolio Snapshot</option>
            </select>
            <p className="font-body text-gray-500 text-xs mb-2">Notification Settings</p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-body text-sm text-navy">
                <input type="checkbox" defaultChecked className="accent-lime w-4 h-4" /> Payment alerts
              </label>
              <label className="flex items-center gap-2 font-body text-sm text-navy">
                <input type="checkbox" defaultChecked className="accent-lime w-4 h-4" /> New deal availability
              </label>
            </div>
          </div>

          {/* Risk Profile Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-heading text-lg font-bold text-navy mb-4">Risk Profile Summary</h2>
            <div className="space-y-3 font-body text-sm">
              <div>
                <p className="text-gray-500 text-xs">Profile Type</p>
                <p className="text-navy font-medium">Moderate</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Net Worth</p>
                <p className="text-navy font-medium">$500K - $1M</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Jurisdiction</p>
                <p className="text-navy font-medium">Ontario</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Investment Restrictions</p>
                <p className="text-navy font-medium">Max LTV 75%</p>
              </div>
            </div>
            <button
              onClick={() => alert('Suitability survey will be available soon. Contact mfox@foxmortgage.ca')}
              className="mt-4 w-full border border-navy text-navy rounded-lg py-2 text-sm font-medium hover:bg-navy/5 transition-colors"
            >
              Retake Suitability Survey
            </button>
          </div>

          {/* Digital Signature History */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-heading text-lg font-bold text-navy mb-4">Digital Signature History</h2>
            <div>
              {signatureHistory.map((sig) => (
                <div key={sig.doc} className="flex justify-between border-b py-2 last:border-b-0">
                  <div>
                    <p className="font-body text-sm text-navy font-medium">{sig.doc}</p>
                    <p className="font-body text-xs text-gray-400">{sig.date}</p>
                  </div>
                  <span className="font-body text-xs text-gray-500 self-center">{sig.method}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Security Information */}
          <div className="bg-navy text-white rounded-xl p-5">
            <h2 className="font-heading text-lg font-bold mb-3 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security Information
            </h2>
            <div className="space-y-2 font-body text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Last Login</span>
                <span>Today, 8:09 PM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Device</span>
                <span>Chrome on macOS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">IP</span>
                <span>192.168.1.{'\u2022\u2022\u2022'}</span>
              </div>
            </div>
            <button
              onClick={() => alert('All other sessions have been logged out.')}
              className="bg-red-600 hover:bg-red-700 text-white w-full rounded-lg py-2 mt-3 text-sm font-medium transition-colors"
            >
              Log Out All Devices
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
