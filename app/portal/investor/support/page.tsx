'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Phone, Mail, HelpCircle, FileText, TrendingUp } from 'lucide-react';

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: 'Investment Inquiry',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/portal/investor/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    }
  };

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Support</h1>
      <p className="font-body text-gray-500 text-sm mb-6">Get in touch with your dedicated mortgage agent</p>

      {/* Top Banner */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 font-body text-sm text-navy flex items-center gap-2">
        <span className="text-lg">{'\u26a1'}</span>
        Direct access to Michael Fox — your dedicated mortgage agent. Response within 1 business day.
      </div>

      {/* Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Contact Michael */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-navy rounded-full flex items-center justify-center">
            <span className="font-heading text-white text-xl">MF</span>
          </div>
          <h2 className="font-heading text-navy text-xl mt-3">Michael Fox</h2>
          <p className="text-gray-500 text-sm font-body">Mortgage Agent, Level 2</p>
          <p className="text-gray-400 text-xs font-body">BRX Mortgage &middot; FSRA #13463</p>

          <div className="mt-4 space-y-2 w-full text-left">
            <div className="flex items-center gap-2 font-body text-sm text-navy">
              <Phone className="w-4 h-4 text-lime" />
              (519) 555-0123
            </div>
            <div className="flex items-center gap-2 font-body text-sm text-navy">
              <Mail className="w-4 h-4 text-lime" />
              mfox@foxmortgage.ca
            </div>
          </div>

          <div className="mt-4 space-y-2 w-full">
            <Link
              href="https://calendly.com"
              target="_blank"
              className="block bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold text-sm text-center hover:opacity-90 transition-opacity"
            >
              {'\ud83d\udcc5'} Book a Call
            </Link>
            <a
              href="tel:5195550123"
              className="block border border-navy text-navy w-full py-3 rounded-lg font-heading font-bold text-sm text-center hover:bg-navy/5 transition-colors"
            >
              {'\ud83d\udcde'} Call Now
            </a>
            <a
              href="mailto:mfox@foxmortgage.ca"
              className="block border border-navy text-navy w-full py-3 rounded-lg font-heading font-bold text-sm text-center hover:bg-navy/5 transition-colors"
            >
              {'\u2709\ufe0f'} Send Email
            </a>
          </div>
        </div>

        {/* Send a Message */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-heading text-lg font-bold text-navy mb-4">Send a Message</h2>

          {submitted ? (
            <div className="bg-lime/10 border border-lime/30 rounded-lg p-4 text-center">
              <p className="font-heading text-navy font-bold">Message Sent!</p>
              <p className="font-body text-sm text-gray-500 mt-1">We&apos;ll get back to you within 1 business day.</p>
              <button
                onClick={() => {
                  setSubmitted(false);
                  setFormData({ name: '', email: '', subject: 'Investment Inquiry', message: '' });
                }}
                className="mt-3 text-lime text-sm font-medium hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="font-body text-xs text-gray-500 block mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-navy focus:outline-none focus:border-lime"
                  required
                />
              </div>
              <div>
                <label className="font-body text-xs text-gray-500 block mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-navy focus:outline-none focus:border-lime"
                  required
                />
              </div>
              <div>
                <label className="font-body text-xs text-gray-500 block mb-1">Subject</label>
                <select
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-navy focus:outline-none focus:border-lime"
                >
                  <option>Investment Inquiry</option>
                  <option>Payment Question</option>
                  <option>Document Request</option>
                  <option>Profile Update</option>
                  <option>New Opportunity</option>
                  <option>General Question</option>
                </select>
              </div>
              <div>
                <label className="font-body text-xs text-gray-500 block mb-1">Message</label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-body text-navy focus:outline-none focus:border-lime resize-none"
                  required
                />
              </div>
              <button
                type="submit"
                className="bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold text-sm hover:opacity-90 transition-opacity"
              >
                Send Message &rarr;
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Bottom 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <HelpCircle className="w-8 h-8 text-lime mx-auto mb-3" />
          <h3 className="font-heading text-navy font-bold mb-1">FAQ</h3>
          <p className="font-body text-gray-400 text-sm">Coming Soon</p>
        </div>
        <Link href="/portal/investor/documents" className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:border-lime transition-colors block">
          <FileText className="w-8 h-8 text-lime mx-auto mb-3" />
          <h3 className="font-heading text-navy font-bold mb-1">Document Centre</h3>
          <p className="font-body text-gray-400 text-sm">Access all your documents</p>
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
          <TrendingUp className="w-8 h-8 text-lime mx-auto mb-3" />
          <h3 className="font-heading text-navy font-bold mb-1">Market Updates</h3>
          <p className="font-body text-gray-400 text-sm">Coming Soon</p>
        </div>
      </div>
    </div>
  );
}
