'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Shield } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useUser();

  const fullName = user?.fullName || 'Investor';
  const email = user?.primaryEmailAddress?.emailAddress || '—';
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;

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

  const completionItems = [
    { label: 'Personal Information', done: true },
    { label: 'KYC Verification', done: true },
    { label: 'AML Compliance', done: true },
    { label: 'Accredited Investor', done: false },
    { label: 'Subscription Agreement', done: true },
  ];
  const completionPct = Math.round((completionItems.filter(i => i.done).length / completionItems.length) * 100);

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Investor Profile</h1>
      <p className="font-body text-gray-500 text-sm mb-6">Manage your personal information, compliance documents, and preferences</p>

      {/* Account Status Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Investor Status', value: 'Active', icon: '✅', color: 'bg-green-50 border-green-200', valueColor: 'text-green-700' },
          { label: 'Compliance Status', value: 'Action Required', icon: '⚠️', color: 'bg-yellow-50 border-yellow-200', valueColor: 'text-yellow-700' },
          { label: 'Last Review', value: 'Jan 15, 2024', icon: '📋', color: 'bg-gray-50 border-gray-200', valueColor: 'text-navy' },
        ].map((item, i) => (
          <div key={i} className={`border rounded-xl p-4 ${item.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{item.icon}</span>
              <p className="text-gray-500 text-xs font-body">{item.label}</p>
            </div>
            <p className={`font-heading font-bold text-base ${item.valueColor}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Profile Completion */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="font-heading text-navy font-semibold text-sm">Profile Completion</p>
            <p className="text-gray-400 text-xs font-body mt-0.5">Complete your profile to unlock full platform access</p>
          </div>
          <span className="font-heading text-navy text-2xl font-bold">{completionPct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full mb-3">
          <div className="h-full bg-lime rounded-full transition-all duration-500" style={{ width: `${completionPct}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {completionItems.map((item, i) => (
            <span key={i} className={`text-xs font-body px-2.5 py-1 rounded-full flex items-center gap-1 ${item.done ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {item.done ? '✓' : '!'} {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold text-navy">Personal Information</h2>
              <button className="text-lime text-sm font-medium hover:underline">✏️ Edit</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-gray-500 text-xs font-body">Full Legal Name</p>
                <p className="text-navy font-medium text-sm font-body">
                  {fullName}
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-body">✓ Verified</span>
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Email</p>
                <p className="text-navy font-medium text-sm font-body">
                  {email}
                  <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-body">✓ Verified</span>
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Phone</p>
                <p className="text-navy font-medium text-sm font-body">(519) 654-8173</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Date of Birth</p>
                <p className="text-navy font-medium text-sm font-body">••••••••••</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Mailing Address</p>
                <p className="text-navy font-medium text-sm font-body">Fergus, Ontario</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">SIN</p>
                <div className="flex items-center gap-2">
                  <span className="text-navy font-semibold font-body">••••••••••</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-body">🔒 Secured</span>
                </div>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Residency Status</p>
                <p className="text-navy font-medium text-sm font-body">Canadian Citizen</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs font-body">Entity Type</p>
                <p className="text-navy font-medium text-sm font-body">Personal Account</p>
              </div>
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
                  <tr key={doc.type} className={`border-b last:border-b-0 transition-colors ${doc.status === 'Pending' ? 'bg-yellow-50/50' : 'hover:bg-gray-50'}`}>
                    <td className="py-3 text-navy font-medium">{doc.type}</td>
                    <td className="py-3">
                      <span className={`${doc.statusColor} px-2 py-0.5 rounded-full text-xs font-medium`}>
                        {doc.status === 'Verified' ? '✓ ' : '⚠ '}{doc.status}
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
            <h2 className="font-heading text-lg font-bold text-navy">Risk Profile Summary</h2>
            <p className="text-gray-400 text-xs font-body mt-0.5 mb-4">Based on your completed suitability assessment</p>
            <div className="space-y-3 font-body text-sm">
              <div><p className="text-gray-500 text-xs">Profile Type</p><p className="text-navy font-medium">Moderate</p></div>
              <div><p className="text-gray-500 text-xs">Net Worth</p><p className="text-navy font-medium">$500K - $1M</p></div>
              <div><p className="text-gray-500 text-xs">Jurisdiction</p><p className="text-navy font-medium">Ontario</p></div>
              <div><p className="text-gray-500 text-xs">Investment Restrictions</p><p className="text-navy font-medium">Max LTV 75%</p></div>
            </div>
            <button onClick={() => alert('Suitability survey will be available soon. Contact mfox@foxmortgage.ca')}
              className="mt-4 w-full border border-navy text-navy rounded-lg py-2 text-sm font-medium hover:bg-navy/5 transition-colors">
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
              <Shield className="w-5 h-5" /> Security Information
            </h2>
            <div className="space-y-2 font-body text-sm">
              <div className="flex justify-between"><span className="text-gray-300">Last Login</span><span>Today, 8:09 PM</span></div>
              <div className="flex justify-between"><span className="text-gray-300">Device</span><span>Chrome on macOS</span></div>
              <div className="flex justify-between"><span className="text-gray-300">IP</span><span>192.168.1.•••</span></div>
            </div>
            <div className="mt-4 space-y-2">
              <button className="w-full text-sm font-body text-gray-300 border border-white/20 rounded-lg py-2 hover:border-white/40 hover:bg-white/5 transition-colors">
                Manage Sessions
              </button>
              <button onClick={() => alert('All other sessions have been logged out.')}
                className="w-full text-sm font-body text-red-300 border border-red-400/30 rounded-lg py-2 hover:bg-red-500/10 transition-colors">
                Log Out All Devices
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
