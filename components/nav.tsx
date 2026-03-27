'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white shadow-sm border-b border-gray-100' : 'bg-white'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-heading font-bold text-xl text-navy">
              Fox <span className="text-lime">Mortgage</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="font-body text-sm font-medium text-navy hover:text-lime transition-colors">
              Home
            </Link>
            <Link href="/about" className="font-body text-sm font-medium text-navy hover:text-lime transition-colors">
              About
            </Link>
            <Link href="/services" className="font-body text-sm font-medium text-navy hover:text-lime transition-colors">
              Services
            </Link>
            <Link href="/smm" className="font-body text-sm font-medium text-navy hover:text-lime transition-colors">
              Monitoring
            </Link>
            <Link href="/contact" className="font-body text-sm font-medium text-navy hover:text-lime transition-colors">
              Contact
            </Link>
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center space-x-3">
            <Link
              href="/smm"
              className="bg-lime text-navy font-heading font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-lime-dark transition-colors"
            >
              Start Monitoring
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-navy"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-5 h-0.5 bg-navy mb-1 transition-all"></div>
            <div className="w-5 h-0.5 bg-navy mb-1"></div>
            <div className="w-5 h-0.5 bg-navy"></div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-3">
          {[
            { href: '/', label: 'Home' },
            { href: '/about', label: 'About' },
            { href: '/services', label: 'Services' },
            { href: '/smm', label: 'Monitoring' },
            { href: '/contact', label: 'Contact' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="block font-body text-sm font-medium text-navy py-2"
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link
            href="/smm"
            className="block bg-lime text-navy font-heading font-bold text-sm px-5 py-3 rounded-lg text-center mt-2"
            onClick={() => setMenuOpen(false)}
          >
            Start Monitoring
          </Link>
        </div>
      )}
    </nav>
  )
}
