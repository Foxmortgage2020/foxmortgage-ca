'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Phone, Mail } from 'lucide-react';

export default function SupportPage() {
  const { user } = useUser();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('Investment Question');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.fullName || '');
      setEmail(user.primaryEmailAddress?.emailAddress || '');
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailtoUrl = `mailto:mfox@foxmortgage.ca?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`From: ${name} (${email})\n\nSubject: ${subject}\n\n${message}`)}`;
    window.location.href = mailtoUrl;
    setSubmitted(true);
  };

  const quickActions = [
    {
      icon: '📊', title: 'Request a Report',
      sub: 'Get your monthly or annual earnings summary',
      action: () => {
        setSubject('Documents / Reporting');
        setMessage('Hi Michael,\n\nCould you please send me my latest earnings report?\n\nThank you');
        setSubmitted(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    {
      icon: '🔄', title: 'Renewal Question',
      sub: 'Ask about your upcoming mortgage renewal',
      action: () => {
        setSubject('Renewal / Existing Deal');
        setMessage('Hi Michael,\n\nI have a question about an upcoming renewal on one of my investments.\n\n');
        setSubmitted(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    {
      icon: '💼', title: 'New Opportunity',
      sub: 'Express interest in deploying more capital',
      action: () => {
        setSubject('New Opportunity Inquiry');
        setMessage('Hi Michael,\n\nI\'m interested in discussing new investment opportunities. I\'d like to learn more about what\'s currently available.\n\n');
        setSubmitted(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">Support</h1>
      <p className="font-body text-gray-500 text-sm mb-6">Get in touch with your dedicated mortgage agent</p>

      {/* Top Banner */}
      <div className="bg-lime/10 border border-lime/20 rounded-xl p-4 mb-6 flex items-start gap-3">
        <span className="text-lime text-lg">⚡</span>
        <div>
          <p className="text-navy font-heading font-semibold text-sm">Direct access to your dedicated mortgage advisor</p>
          <p className="text-gray-600 text-sm font-body mt-0.5">Get answers on your investments, renewals, or new opportunities — response within 1 business day</p>
        </div>
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
          <p className="text-gray-400 text-xs font-body">BRX Mortgage · FSRA #13463</p>
          <p className="text-gray-400 text-xs font-body mt-2">Available Mon–Fri, 9am–6pm EST</p>
          <p className="text-lime text-xs font-body font-semibold mt-0.5">Best way to reach me: Book a call →</p>

          <div className="mt-4 space-y-2 w-full text-left">
            <div className="flex items-center gap-2 font-body text-sm text-navy">
              <Phone className="w-4 h-4 text-lime" /> (519) 654-8173
            </div>
            <div className="flex items-center gap-2 font-body text-sm text-navy">
              <Mail className="w-4 h-4 text-lime" /> mfox@foxmortgage.ca
            </div>
          </div>

          <div className="mt-4 space-y-2 w-full">
            <Link href="https://calendly.com" target="_blank"
              className="block bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold text-sm text-center hover:opacity-90 transition-opacity">
              📅 Book a Call
            </Link>
            <a href="tel:5196548173"
              className="block border border-navy text-navy w-full py-3 rounded-lg font-heading font-bold text-sm text-center hover:bg-navy/5 transition-colors">
              📞 Call Now
            </a>
            <a href="mailto:mfox@foxmortgage.ca"
              className="block border border-navy text-navy w-full py-3 rounded-lg font-heading font-bold text-sm text-center hover:bg-navy/5 transition-colors">
              ✉️ Send Email
            </a>
          </div>
        </div>

        {/* Send a Message */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-heading text-lg font-bold text-navy mb-4">Send a Message</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-body text-xs text-gray-500 block mb-1">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm text-navy bg-gray-50 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors" />
            </div>
            <div>
              <label className="font-body text-xs text-gray-500 block mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm text-navy bg-gray-50 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors" />
            </div>
            <div>
              <label className="font-body text-xs text-gray-500 block mb-1">Subject</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm text-navy bg-gray-50 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors">
                <option>Investment Question</option>
                <option>Renewal / Existing Deal</option>
                <option>New Opportunity Inquiry</option>
                <option>Documents / Reporting</option>
                <option>General Support</option>
              </select>
            </div>
            <div>
              <label className="font-body text-xs text-gray-500 block mb-1">Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 font-body text-sm text-navy bg-gray-50 focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime transition-colors resize-none" />
            </div>
            <button type="submit"
              className="bg-lime text-navy w-full py-3 rounded-lg font-heading font-bold text-sm hover:opacity-90 transition-opacity">
              Send Message →
            </button>
          </form>

          {submitted && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
              <div className="flex items-start gap-3">
                <span className="text-green-600 text-lg">✅</span>
                <div>
                  <p className="text-green-800 font-body font-semibold text-sm">Message sent — Michael will respond within 1 business day</p>
                  <p className="text-green-600 text-xs font-body mt-0.5">A copy has been sent to {email}</p>
                  <button onClick={() => { setSubmitted(false); setMessage('') }}
                    className="text-green-700 text-xs font-body underline mt-2">Send another message</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <p className="font-body text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Quick Actions</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((item, i) => (
            <button key={i} onClick={item.action}
              className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:border-lime hover:shadow-md transition-all duration-200 cursor-pointer group">
              <span className="text-2xl mb-3 block">{item.icon}</span>
              <p className="font-heading text-navy font-semibold text-sm group-hover:text-lime transition-colors">{item.title}</p>
              <p className="text-gray-400 text-xs font-body mt-1 leading-relaxed">{item.sub}</p>
              <p className="text-lime text-xs font-body font-semibold mt-3">Pre-fill message →</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
