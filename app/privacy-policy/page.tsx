import Nav from '@/components/nav'
import Footer from '@/components/footer'

export const metadata = {
  title: 'Privacy Policy | Fox Mortgage',
  description: 'Privacy Policy for Fox Mortgage — 2802551 Ontario Inc.',
}

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        {/* Hero */}
        <section className="py-20 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="font-body text-lime text-sm font-medium uppercase tracking-wider mb-4">Legal</p>
              <h1 className="font-heading font-bold text-4xl md:text-5xl mb-6">Privacy Policy</h1>
              <p className="font-body text-gray-300 text-lg">Last Updated: April 18, 2026</p>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-20 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">1. About This Policy</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                This Privacy Policy describes how 2802551 Ontario Inc., operating under the trade name Fox Mortgage
                (&quot;Fox Mortgage&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), collects, uses, and
                discloses personal information in the course of our mortgage agent activities and related services.
              </p>
              <p className="font-body text-gray-600 leading-relaxed mt-4">
                We are governed by the Personal Information Protection and Electronic Documents Act (PIPEDA) and
                applicable provincial privacy legislation. Questions or requests regarding your personal information
                may be directed to our Privacy Officer at{' '}
                <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a>.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">2. Privacy Officer</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                <strong>Privacy Officer:</strong> Fox Mortgage<br />
                <strong>Email:</strong>{' '}
                <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a>
              </p>
              <p className="font-body text-gray-600 leading-relaxed mt-4">
                We will respond to written privacy requests within 30 days of receipt. If you are unsatisfied with
                our response, you may file a complaint with the Office of the Privacy Commissioner of Canada (OPC)
                at{' '}
                <a href="https://www.priv.gc.ca" target="_blank" rel="noopener noreferrer" className="text-lime hover:underline">
                  www.priv.gc.ca
                </a>.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">3. Information We Collect</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                Depending on the services you use, we may collect the following categories of personal information:
              </p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li>Contact information (name, address, phone number, email address)</li>
                <li>Financial information (income, assets, debts, employment history)</li>
                <li>Credit information (credit scores and bureau reports)</li>
                <li>Government-issued identification</li>
                <li>Social Insurance Number (SIN) — collected for FINTRAC anti-money laundering compliance only, with your express consent</li>
                <li>Property information (address, purchase price, current value, mortgage details)</li>
                <li>Website technical data (IP address, cookies, device type, browser)</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">4. How We Collect It</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                We collect personal information through the following means:
              </p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li>Web forms and authenticated portal interactions on foxmortgage.ca</li>
                <li>Direct communication (phone, email, in-person meetings)</li>
                <li>Referrals from Financial Planner partners</li>
                <li>Bank transaction data via QuickBooks Online — for internal bookkeeping of 2802551 Ontario Inc. only</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">5. Why We Collect It</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                We use your personal information for the following purposes:
              </p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li>Mortgage arrangement and placement with lending institutions</li>
                <li>Strategic Mortgage Monitoring — ongoing rate and renewal monitoring</li>
                <li>Investor portal services and reporting</li>
                <li>Financial Planner referral platform operations</li>
                <li>Regulatory compliance, including FINTRAC anti-money laundering obligations, FSRA licensing requirements, and the Mortgage Brokerages, Lenders and Administrators Act (MBLAA)</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">6. Consent</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                We obtain <strong>express consent</strong> before collecting sensitive personal information, including
                your Social Insurance Number, detailed financial information, and credit bureau access.
              </p>
              <p className="font-body text-gray-600 leading-relaxed mt-4">
                <strong>Implied consent</strong> applies when you submit a mortgage application or engage us for
                services, as providing information in that context indicates acceptance of its use for the stated purpose.
              </p>
              <p className="font-body text-gray-600 leading-relaxed mt-4">
                You may withdraw consent at any time by contacting us at{' '}
                <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a>.
                Note that withdrawal of consent may limit our ability to complete services on your behalf and does not
                affect our obligations to retain information under FINTRAC, FSRA, or other applicable regulatory requirements.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">7. Third-Party Disclosure</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                We may share your personal information with the following parties, strictly as required to deliver
                our services or meet our regulatory obligations:
              </p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li><strong>BRX Mortgage Inc.</strong> — supervising brokerage</li>
                <li><strong>Mortgage lenders and financial institutions</strong> — for mortgage placement</li>
                <li><strong>Equifax and TransUnion</strong> — credit bureau inquiries</li>
                <li><strong>FINTRAC</strong> — anti-money laundering reporting</li>
                <li><strong>FSRA (Financial Services Regulatory Authority of Ontario)</strong> — regulatory compliance</li>
                <li><strong>Zoho CRM</strong> — client relationship management</li>
                <li><strong>Intuit QuickBooks Online</strong> — internal bookkeeping</li>
                <li><strong>Clerk.dev</strong> — portal authentication</li>
                <li><strong>Vercel Inc.</strong> — website and portal hosting (United States)</li>
                <li><strong>Resend Inc.</strong> — transactional email (United States)</li>
                <li><strong>Dialpad Inc.</strong> — business communications</li>
                <li><strong>Finmo</strong> — mortgage application platform</li>
              </ul>
              <p className="font-body text-gray-600 leading-relaxed mt-4">
                Some of our service providers are located outside Canada, including in the United States. Your
                information may be stored or processed in the United States, subject to that country&apos;s laws.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">8. Data Retention</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                We retain personal information for a minimum of 7 years from the date of last activity, or as
                required by applicable law, whichever is longer. After the retention period, information is
                securely destroyed.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">9. Security</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                We protect personal information using:
              </p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li>HTTPS/TLS encryption for all data in transit</li>
                <li>Access controls and authenticated portals</li>
                <li>Employee confidentiality obligations</li>
                <li>Third-party providers held to appropriate security standards</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">10. Your Rights</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">You have the right to:</p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li><strong>Access</strong> — request a copy of the personal information we hold about you (written request to <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a>; 30-day response)</li>
                <li><strong>Correction</strong> — request that inaccurate information be corrected</li>
                <li><strong>Consent withdrawal</strong> — subject to legal and regulatory obligations, withdraw consent for future use</li>
                <li><strong>Complaint</strong> — file a complaint with our Privacy Officer, and if unsatisfied, with the Office of the Privacy Commissioner of Canada</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">11. Cookies and Tracking</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                Fox Mortgage does not currently use analytics or tracking cookies beyond those technically required
                for portal functionality (Clerk session management). This policy will be updated if tracking
                practices change.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">12. QuickBooks Integration</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                The Fox Bookkeeping Agent integrates with Intuit QuickBooks Online for the internal bookkeeping of
                2802551 Ontario Inc. only. QuickBooks data is accessed via OAuth 2.0 authorization, used solely
                for transaction categorization and financial reporting, and is not sold or shared with any third party.
                QBO access can be revoked at any time through your Intuit account settings.
              </p>
              <p className="font-body text-gray-600 leading-relaxed mt-4">
                For the complete Intuit-specific privacy disclosure, see:{' '}
                <a href="/legal/bookkeeping-agent-privacy" className="text-lime hover:underline">
                  foxmortgage.ca/legal/bookkeeping-agent-privacy
                </a>
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">13. Changes to This Policy</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                We may update this Privacy Policy from time to time. Changes will be posted on this page with an
                updated &quot;Last Updated&quot; date.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">14. Governing Law</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                This Privacy Policy is governed by the laws of the Province of Ontario, Canada.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">15. Contact</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a>
                <br />
                Fox Mortgage<br />
                Fergus, Ontario
              </p>
            </div>

          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
