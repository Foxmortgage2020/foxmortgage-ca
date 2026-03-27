import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="font-heading font-bold text-2xl mb-3">
              Fox <span className="text-lime">Mortgage</span>
            </div>
            <p className="font-body text-sm text-gray-300 leading-relaxed mb-4 max-w-xs">
              Strategic Mortgage Monitoring for Ontario homeowners. Your mortgage, watched daily.
            </p>
            <p className="font-body text-xs text-gray-400 leading-relaxed">
              Michael Fox · Mortgage Agent, Level 2<br />
              BRX Mortgage · FSRA #13463
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="font-heading font-bold text-sm text-lime mb-4 uppercase tracking-wider">Navigate</h3>
            <ul className="space-y-2">
              {[
                { href: '/', label: 'Home' },
                { href: '/about', label: 'About' },
                { href: '/services', label: 'Services' },
                { href: '/smm', label: 'Monitoring' },
                { href: '/contact', label: 'Contact' },
                { href: '/apply', label: 'Apply Now' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="font-body text-sm text-gray-300 hover:text-lime transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-heading font-bold text-sm text-lime mb-4 uppercase tracking-wider">Contact</h3>
            <ul className="space-y-2 font-body text-sm text-gray-300">
              <li>Fergus · Guelph</li>
              <li>Wellington County, ON</li>
              <li className="pt-2">
                <Link href="/contact" className="text-lime hover:text-lime-light transition-colors">
                  Book a Call →
                </Link>
              </li>
              <li>
                <Link href="/smm" className="text-lime hover:text-lime-light transition-colors">
                  Start Monitoring →
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 mt-10 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <p className="font-body text-xs text-gray-400">
              © {new Date().getFullYear()} Fox Mortgage. All rights reserved.
            </p>
            <p className="font-body text-xs text-gray-500 max-w-lg leading-relaxed">
              foxmortgage.ca is operated by Michael Fox, Mortgage Agent, Level 2, brokered by BRX Mortgage Inc., FSRA #13463. Not intended to solicit clients already under contract.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
