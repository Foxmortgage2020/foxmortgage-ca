'use client'

import { useState } from 'react'
import {
  Clock,
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  Video,
  BookOpen,
  PlayCircle,
  Activity,
  Send,
} from 'lucide-react'

export default function SupportPage() {
  const [form, setForm] = useState({
    subject: '',
    category: '',
    message: '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
    setForm({ subject: '', category: '', message: '' })
  }

  return (
    <div>
      {/* Fast Response Banner */}
      <div className="bg-lime/10 border border-lime/30 rounded-xl p-4 mb-6 flex items-center gap-3">
        <Clock className="w-5 h-5 text-lime-dark shrink-0" />
        <p className="font-body text-sm text-gray-700">
          <span className="font-semibold text-navy">Average response time: under 2 hours</span> —
          Our support team is available Monday to Friday, 9 AM to 6 PM ET.
        </p>
      </div>

      {/* Two Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Contact Card */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-navy text-base mb-4">
            Contact Your Mortgage Agent
          </h3>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-navy text-lime flex items-center justify-center font-heading font-bold text-lg shrink-0">
              MF
            </div>
            <div>
              <div className="font-heading font-semibold text-navy">Michael Fox</div>
              <div className="font-body text-sm text-gray-500">
                Licensed Mortgage Agent, Level 2
              </div>
            </div>
          </div>
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <Phone className="w-4 h-4 text-gray-400" />
              <span className="font-body text-sm text-gray-700">(416) 555-0199</span>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-gray-400" />
              <span className="font-body text-sm text-gray-700">michael@foxmortgage.ca</span>
            </div>
          </div>
          <div className="space-y-2">
            <button className="w-full flex items-center justify-center gap-2 bg-lime text-navy font-heading font-bold text-sm px-4 py-3 rounded-lg hover:bg-lime-dark transition-colors">
              <Calendar className="w-4 h-4" />
              Book a Strategy Call
            </button>
            <button className="w-full flex items-center justify-center gap-2 bg-navy text-white font-heading font-semibold text-sm px-4 py-3 rounded-lg hover:bg-navy/90 transition-colors">
              <MessageSquare className="w-4 h-4" />
              Send a Message
            </button>
            <button className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-body text-sm px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors">
              <Video className="w-4 h-4" />
              Schedule Video Call
            </button>
          </div>
        </div>

        {/* Help Form */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <h3 className="font-heading font-semibold text-navy text-base mb-4">Need Help?</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Subject
              </label>
              <input
                type="text"
                name="subject"
                value={form.subject}
                onChange={handleChange}
                required
                placeholder="Brief description of your issue"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime"
              />
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime bg-white"
              >
                <option value="">Select a category</option>
                <option value="referral">Referral Issue</option>
                <option value="technical">Technical Support</option>
                <option value="billing">Billing Question</option>
                <option value="training">Training Help</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block font-body text-sm font-medium text-gray-700 mb-1">
                Message
              </label>
              <textarea
                name="message"
                value={form.message}
                onChange={handleChange}
                required
                rows={4}
                placeholder="Describe your issue or question in detail..."
                className="w-full border border-gray-300 rounded-lg px-4 py-3 font-body text-sm focus:outline-none focus:ring-2 focus:ring-lime/50 focus:border-lime resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-lime text-navy font-heading font-bold text-sm px-4 py-3 rounded-lg hover:bg-lime-dark transition-colors"
            >
              {submitted ? (
                'Sent!'
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Submit Request
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
            <BookOpen className="w-5 h-5" />
          </div>
          <h4 className="font-heading font-semibold text-navy text-sm mb-1">Knowledge Base</h4>
          <p className="font-body text-xs text-gray-500">
            Browse articles, guides, and FAQs to find answers to common questions.
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center mb-3">
            <PlayCircle className="w-5 h-5" />
          </div>
          <h4 className="font-heading font-semibold text-navy text-sm mb-1">Video Tutorials</h4>
          <p className="font-body text-xs text-gray-500">
            Watch step-by-step video walkthroughs of portal features and workflows.
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm transition-shadow">
          <div className="w-10 h-10 rounded-lg bg-green-100 text-green-600 flex items-center justify-center mb-3">
            <Activity className="w-5 h-5" />
          </div>
          <h4 className="font-heading font-semibold text-navy text-sm mb-1">System Status</h4>
          <p className="font-body text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 bg-green-500 rounded-full inline-block" />
              All systems operational
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
