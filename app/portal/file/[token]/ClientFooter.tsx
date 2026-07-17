// The compliance footer. Brokerage identification and the licence line are
// required on a client-facing surface; the privacy note is here because this
// page holds the client's own information and they deserve to know we know
// that. No marketing nav: this page has one job.

export default function ClientFooter() {
  return (
    <footer className="mt-12 border-t border-navy/10 pt-6">
      <p className="font-body text-xs leading-relaxed text-navy/50">
        Michael Fox · Mortgage Agent Level 2 · BRX Mortgage · FSRA #13463
      </p>
      <p className="mt-2 font-body text-xs leading-relaxed text-navy/40">
        This page is private to you. It only shows your own file, and the link stops working if you
        ask us to turn it off.
      </p>
    </footer>
  )
}
