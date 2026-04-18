import Nav from '@/components/nav'
import Footer from '@/components/footer'

export const metadata = {
  title: 'Terms of Service | Fox Mortgage',
  description: 'Terms of Service for Fox Mortgage — 2802551 Ontario Inc.',
}

export default function TermsOfService() {
  return (
    <main className="min-h-screen">
      <Nav />
      <div className="pt-24">
        {/* Hero */}
        <section className="py-20 bg-navy text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="font-body text-lime text-sm font-medium uppercase tracking-wider mb-4">Legal</p>
              <h1 className="font-heading font-bold text-4xl md:text-5xl mb-6">Terms of Service</h1>
              <p className="font-body text-gray-300 text-lg">Effective: April 18, 2026</p>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="py-20 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">1. About Fox Mortgage</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                foxmortgage.ca is operated by 2802551 Ontario Inc., carrying on business under the trade name Fox
                Mortgage. Michael Fox is a Mortgage Agent, Level 2, brokered by BRX Mortgage Inc. (FSRA Licence
                #13463, FSRA Agent Licence #[FSRA AGENT LICENCE #]). Fox Mortgage is regulated by the Financial
                Services Regulatory Authority of Ontario (FSRA).
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">2. Services</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">
                Through this website and authenticated portal, Fox Mortgage provides:
              </p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li>Mortgage agent services — sourcing and arranging mortgages from 50+ lenders</li>
                <li>Strategic Mortgage Monitoring — ongoing rate and renewal monitoring for existing clients</li>
                <li>Investor portal — dashboard and reporting for private lending investors</li>
                <li>Financial Planner referral platform — tools for referring Financial Planner partners</li>
                <li>Authenticated portal access for clients, investors, and partner professionals</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">3. Not Financial or Legal Advice</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                Information on this website is provided for general informational purposes only and does not
                constitute mortgage advice, financial advice, or legal advice. Mortgage suitability depends on
                your individual financial circumstances. Always seek qualified professional advice before making
                mortgage or financial decisions.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">4. No Guarantee of Approval</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                Mortgage approval, rates, and products are subject to lender underwriting criteria and are not
                guaranteed. Rates and product availability are subject to change without notice. Pre-qualification
                estimates are not commitments to lend.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">5. Compensation</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                Fox Mortgage is typically compensated by the lending institution upon successful mortgage
                placement, not directly by the borrower. Full compensation disclosure is available upon request.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">6. User Responsibilities</h2>
              <p className="font-body text-gray-600 leading-relaxed mb-4">By using this website and portal, you agree to:</p>
              <ul className="space-y-2 font-body text-gray-600 list-disc list-inside leading-relaxed">
                <li>Provide accurate and complete information in all applications and forms</li>
                <li>Use the portal and website for lawful purposes only</li>
                <li>Not share your portal credentials with any other person</li>
                <li>Notify us promptly of any unauthorized access to your account</li>
              </ul>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">7. Intellectual Property</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                All content on this website, including the Fox Mortgage name, logo, written content, and brand
                assets, is owned by 2802551 Ontario Inc. No reproduction, distribution, or use of any content is
                permitted without our prior written permission.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">8. Electronic Communications (CASL)</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                We only send commercial electronic messages with your express or implied consent, as required
                under Canada&apos;s Anti-Spam Legislation (CASL). You may withdraw your marketing consent and
                unsubscribe at any time. Unsubscribe requests will be honoured within 10 business days.
                Transactional messages — including application confirmations, document requests, and account
                notifications — are exempt from CASL marketing consent requirements.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">9. Limitation of Liability</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                To the maximum extent permitted by applicable law, Fox Mortgage and 2802551 Ontario Inc. shall
                not be liable for any indirect, incidental, special, or consequential damages arising from your
                use of this website, our services, or your reliance on information contained herein. This
                limitation does not apply to gross negligence, willful misconduct, or any liability that cannot
                be excluded by law.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">10. Third-Party Links</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                This website may contain links to third-party websites. Fox Mortgage is not responsible for
                the content, accuracy, or privacy practices of any linked third-party site.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">11. Changes to Terms</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                We may update these Terms of Service from time to time. Changes will be posted on this page
                with an updated effective date. Continued use of this website after changes are posted
                constitutes your acceptance of the updated terms.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">12. Governing Law</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                These Terms of Service are governed by the laws of the Province of Ontario, Canada. Any
                disputes arising from these terms or your use of this website are subject to the exclusive
                jurisdiction of the courts of Ontario.
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">13. Contact</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                <a href="mailto:mfox@foxmortgage.ca" className="text-lime hover:underline">mfox@foxmortgage.ca</a>
                <br />
                Fox Mortgage<br />
                Fergus, Ontario
              </p>
            </div>

            <div>
              <h2 className="font-heading font-bold text-xl text-navy mb-4">14. Effective Date</h2>
              <p className="font-body text-gray-600 leading-relaxed">
                These Terms of Service are effective as of April 18, 2026.
              </p>
            </div>

          </div>
        </section>
      </div>
      <Footer />
    </main>
  )
}
