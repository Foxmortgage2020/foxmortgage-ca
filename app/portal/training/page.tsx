'use client'

import { useState } from 'react'
import { Play, Clock, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react'

const modules = [
  {
    number: 1,
    title: 'What Is Strategic Mortgage Monitoring?',
    description:
      'Learn the fundamentals of mortgage monitoring, how the system works, and why it creates value for your clients and your practice.',
    duration: '8 min',
  },
  {
    number: 2,
    title: 'How to Identify Monitoring Candidates',
    description:
      'Discover the ideal client profile for mortgage monitoring and learn how to identify opportunities within your existing book of business.',
    duration: '6 min',
  },
  {
    number: 3,
    title: 'The Referral Process Step by Step',
    description:
      'Walk through the complete referral workflow from initial client conversation to submission, onboarding, and ongoing communication.',
    duration: '5 min',
  },
  {
    number: 4,
    title: 'Handling Common Objections',
    description:
      'Practice responding to the most common client questions and concerns about mortgage monitoring with confidence and clarity.',
    duration: '10 min',
  },
]

const faqs = [
  {
    question: 'How does the mortgage monitoring program work?',
    answer:
      'Our system continuously monitors your clients\u2019 mortgages against current market conditions. When a savings opportunity is detected \u2014 such as a rate drop or a better product match \u2014 we alert you and the client so action can be taken promptly.',
  },
  {
    question: 'Is there a cost to my clients?',
    answer:
      'No. The mortgage monitoring service is completely free for your clients. There is no cost, no obligation, and no impact on their existing mortgage unless they choose to take action on a savings opportunity.',
  },
  {
    question: 'How are referral commissions structured?',
    answer:
      'You receive a referral fee for every client you refer who proceeds with a mortgage through Fox Mortgage. Commission details are outlined in your partner agreement. Contact support for your specific tier.',
  },
  {
    question: 'What information do I need to submit a referral?',
    answer:
      'At minimum, you need the client\u2019s name, email, and phone number. Additional details like property type, estimated purchase price, and closing date help us serve the client faster.',
  },
  {
    question: 'How long does the onboarding process take?',
    answer:
      'Once a referral is submitted, the client is typically contacted within 24 hours. The full onboarding \u2014 including initial consultation and monitoring setup \u2014 is usually completed within 3\u20135 business days.',
  },
]

export default function TrainingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index)
  }

  return (
    <div>
      {/* Hero */}
      <div className="bg-navy text-white rounded-xl p-8 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <GraduationCap className="w-6 h-6 text-lime" />
          <h2 className="font-heading font-bold text-xl">Partner Training Academy</h2>
        </div>
        <p className="font-body text-gray-300 max-w-2xl">
          Complete the modules below to master the mortgage monitoring referral process. Each module
          is designed to be concise and actionable so you can start referring clients with
          confidence.
        </p>
      </div>

      {/* Modules */}
      <h3 className="font-heading font-bold text-navy text-lg mb-4">Training Modules</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        {modules.map((mod) => (
          <div
            key={mod.number}
            className="bg-white border border-gray-100 rounded-xl p-6 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-lime text-navy rounded-full flex items-center justify-center font-heading font-bold text-sm shrink-0">
                {mod.number}
              </div>
              <div className="flex-1">
                <h4 className="font-heading font-semibold text-navy text-base mb-1">
                  {mod.title}
                </h4>
                <p className="font-body text-sm text-gray-500 mb-4">{mod.description}</p>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-body text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {mod.duration}
                  </span>
                  <button className="flex items-center gap-2 bg-navy text-white font-heading font-semibold text-sm px-4 py-2 rounded-lg hover:bg-navy/90 transition-colors">
                    <Play className="w-3 h-3" />
                    Start Module
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ Section */}
      <h3 className="font-heading font-bold text-navy text-lg mb-4">
        Frequently Asked Questions
      </h3>
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {faqs.map((faq, i) => (
          <div key={i} className={i < faqs.length - 1 ? 'border-b border-gray-100' : ''}>
            <button
              onClick={() => toggleFaq(i)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors"
            >
              <span className="font-heading font-semibold text-navy text-sm pr-4">
                {faq.question}
              </span>
              {openFaq === i ? (
                <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              )}
            </button>
            {openFaq === i && (
              <div className="px-6 pb-4">
                <p className="font-body text-sm text-gray-600 leading-relaxed">{faq.answer}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
