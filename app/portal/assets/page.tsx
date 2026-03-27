'use client'

import { useState } from 'react'
import { Mail, Share2, FileText, MessageSquare, Copy, Check, Download } from 'lucide-react'

const categories = [
  { label: 'Email Templates', count: 12, icon: Mail, color: 'bg-blue-100 text-blue-600' },
  { label: 'Social Media', count: 24, icon: Share2, color: 'bg-purple-100 text-purple-600' },
  { label: 'Program Overview', count: 3, icon: FileText, color: 'bg-amber-100 text-amber-600' },
  { label: 'Talking Points', count: 8, icon: MessageSquare, color: 'bg-green-100 text-green-600' },
]

const emailTemplates = [
  {
    emoji: '👋',
    title: 'Client Introduction',
    subtitle: 'Introduce the monitoring program to a new client',
  },
  {
    emoji: '📊',
    title: 'Rate Alert Notification',
    subtitle: 'Notify clients when better rates become available',
  },
  {
    emoji: '🔄',
    title: 'Renewal Reminder',
    subtitle: 'Remind clients about upcoming mortgage renewals',
  },
  {
    emoji: '💰',
    title: 'Savings Opportunity',
    subtitle: 'Share potential savings with monitored clients',
  },
  {
    emoji: '🤝',
    title: 'Referral Thank You',
    subtitle: 'Thank partners for submitting a referral',
  },
  {
    emoji: '📈',
    title: 'Quarterly Review',
    subtitle: 'Quarterly portfolio performance update for clients',
  },
]

const socialPosts = [
  { title: 'Rate Drop Alert', subtitle: 'Instagram / Facebook post' },
  { title: 'Client Success Story', subtitle: 'LinkedIn carousel' },
  { title: 'Monitoring Explainer', subtitle: 'Instagram Reel / TikTok' },
  { title: 'Partner Spotlight', subtitle: 'LinkedIn / Facebook post' },
]

export default function AssetsPage() {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  const handleCopy = (index: number) => {
    const placeholderTexts = [
      'Hi [Client Name],\n\nI wanted to introduce you to a complimentary service we offer through our partnership with Fox Mortgage — Strategic Mortgage Monitoring.\n\nThis program continuously monitors your mortgage against current market conditions to identify potential savings opportunities. There is no cost and no obligation.\n\nWould you be open to a quick chat about how this could benefit you?\n\nBest regards,\n[Your Name]',
      'Hi [Client Name],\n\nGreat news — our monitoring system has detected that current rates may be significantly lower than your existing mortgage rate. This could mean real savings for you.\n\nWould you like us to run a detailed analysis?\n\nBest regards,\n[Your Name]',
      'Hi [Client Name],\n\nYour mortgage renewal is coming up in [X months]. This is a great time to review your options and ensure you get the best possible rate.\n\nLet us help you navigate the renewal process.\n\nBest regards,\n[Your Name]',
      'Hi [Client Name],\n\nOur monitoring system has identified a potential savings opportunity on your mortgage. Based on current market conditions, you could save approximately $[X]/month.\n\nWould you like to explore this further?\n\nBest regards,\n[Your Name]',
      'Hi [Partner Name],\n\nThank you for referring [Client Name] to our mortgage monitoring program. We have begun the onboarding process and will keep you updated on their file.\n\nWe appreciate your trust in our partnership.\n\nBest regards,\nMichael Fox',
      'Hi [Client Name],\n\nHere is your quarterly mortgage monitoring update. Over the past 3 months, we have been actively tracking market conditions for opportunities to optimize your mortgage.\n\nPlease find your summary attached.\n\nBest regards,\n[Your Name]',
    ]

    navigator.clipboard.writeText(placeholderTexts[index] || '')
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div>
      {/* Top Banner */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6">
        <p className="font-body text-sm text-gray-700">
          <span className="font-semibold text-navy">Co-branded marketing assets</span> — All
          materials below are customizable with your branding. Download, copy, and share with your
          clients and network.
        </p>
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {categories.map((cat) => (
          <div
            key={cat.label}
            className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow"
          >
            <div
              className={`w-10 h-10 rounded-lg ${cat.color} flex items-center justify-center mb-3`}
            >
              <cat.icon className="w-5 h-5" />
            </div>
            <div className="font-heading font-bold text-navy text-lg">{cat.count}</div>
            <div className="font-body text-xs text-gray-500">{cat.label}</div>
          </div>
        ))}
      </div>

      {/* Email Templates Section */}
      <h3 className="font-heading font-bold text-navy text-lg mb-4">Email Templates</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {emailTemplates.map((template, i) => (
          <div
            key={template.title}
            className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow"
          >
            <div className="text-2xl mb-3">{template.emoji}</div>
            <h4 className="font-heading font-semibold text-navy text-sm mb-1">
              {template.title}
            </h4>
            <p className="font-body text-xs text-gray-500 mb-4">{template.subtitle}</p>
            <button
              onClick={() => handleCopy(i)}
              className="flex items-center gap-2 text-sm font-body font-medium text-navy bg-gray-50 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors w-full justify-center"
            >
              {copiedIndex === i ? (
                <>
                  <Check className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Email
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Social Media Posts Section */}
      <h3 className="font-heading font-bold text-navy text-lg mb-4">Social Media Posts</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {socialPosts.map((post) => (
          <div
            key={post.title}
            className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
          >
            <div className="bg-navy rounded-xl aspect-video m-3 flex items-center justify-center">
              <Share2 className="w-8 h-8 text-gray-500" />
            </div>
            <div className="px-4 pb-4">
              <h4 className="font-heading font-semibold text-navy text-sm mb-1">{post.title}</h4>
              <p className="font-body text-xs text-gray-500 mb-3">{post.subtitle}</p>
              <button className="flex items-center gap-2 text-sm font-body font-medium text-white bg-navy hover:bg-navy/90 px-3 py-2 rounded-lg transition-colors w-full justify-center">
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
