// Michael's e-signature, in ONE place, in both forms an email needs.
//
// Before this file the booking mail signed off with four short lines built
// inside email-copy.ts. This is his standard signature instead, and it lives
// here so confirmation, reminder, reschedule, and cancel all carry it and it
// never has to be changed in four places again.
//
// THE PHONE AND EMAIL ARE NOT WRITTEN HERE. They come from `lib/contact.ts`,
// which is the single source of truth for both, enforced by
// tests/contact-number.test.ts: a phone-shaped literal anywhere in app, lib,
// components, or config that is not an obvious fake fails the suite. Hardcoding
// the number into a signature is exactly the drift that guard exists to stop.
//
// COPY GATE. Every visible string below passes the client rules: no em dash, no
// en dash, no semicolon, no exclamation point, and never the word "broker". The
// application sentence ends in a PERIOD. The signature Michael supplied ended it
// with an exclamation point, which the gate bans in client mail, so one
// character changed and nothing else.
//
// The application URL carries `brokerName` and `brokerId` query parameters.
// Those are the vendor's parameter names, they are never rendered as visible
// words, and they do not trip the gate's `\bbroker\b` test because the word is
// followed immediately by another letter.

import { CONTACT } from '@/lib/contact'

/** Where the online application lives. The vendor owns this URL shape. */
export const APPLICATION_URL =
  'https://michael-fox.mtg-app.com/signup?brokerName=michael.fox&brokerId=f43d5adf-db9f-4368-b139-7ebc638b64cf'

export const WEBSITE_URL = 'https://www.foxmortgage.ca'
export const WEBSITE_LABEL = 'www.foxmortgage.ca'

export const SIGNATURE_NAME = 'MICHAEL FOX'
export const SIGNATURE_TITLE = 'Mortgage Agent, Level 2'
export const SIGNATURE_LICENCE = 'License M21000367'
export const APPLICATION_SENTENCE = 'Click HERE to start your online application.'

/**
 * The plain-text form.
 *
 * "Click HERE" cannot be a link in plain text, so the text form spells the
 * address out on its own line underneath. A reader on a text-only client would
 * otherwise be told to click a word that does nothing.
 */
export function signatureTextLines(): string[] {
  return [
    SIGNATURE_NAME,
    SIGNATURE_TITLE,
    SIGNATURE_LICENCE,
    `Phone: ${CONTACT.phone.display}`,
    `Email: ${CONTACT.email.address}`,
    `Website: ${WEBSITE_LABEL}`,
    '',
    'Start your online application here:',
    APPLICATION_URL,
  ]
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The HTML form.
 *
 * Inline styles only, because every mail client strips a <style> block. Kept
 * deliberately plain: this is a personal note from one person, not a marketing
 * template, and the signature should not out-shout the message above it.
 */
export function signatureHtml(): string {
  const line = 'margin:0;font-size:14px;line-height:1.5;color:#032133;'
  return [
    '<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e4e9ec;">',
    `<p style="${line}font-weight:700;letter-spacing:0.02em;">${esc(SIGNATURE_NAME)}</p>`,
    `<p style="${line}">${esc(SIGNATURE_TITLE)}</p>`,
    `<p style="${line}">${esc(SIGNATURE_LICENCE)}</p>`,
    `<p style="${line}margin-top:10px;">Phone: ${esc(CONTACT.phone.display)}</p>`,
    `<p style="${line}">Email: <a href="${esc(CONTACT.email.href)}" style="color:#032133;">${esc(CONTACT.email.address)}</a></p>`,
    `<p style="${line}">Website: <a href="${WEBSITE_URL}" style="color:#032133;">${esc(WEBSITE_LABEL)}</a></p>`,
    `<p style="${line}margin-top:10px;">Click <a href="${esc(APPLICATION_URL)}" style="color:#032133;font-weight:700;">HERE</a> to start your online application.</p>`,
    '</div>',
  ].join('')
}

/**
 * A plain-text email body into the HTML alternative part.
 *
 * The body is authored once, as text, in email-copy.ts. This renders that same
 * body as HTML rather than asking anyone to keep two copies of every sentence
 * in step. Blank lines become paragraph breaks, single newlines become <br>,
 * and a bare URL on its own line becomes a link, which is what makes the manage
 * link clickable without the copy having to know it is being rendered as HTML.
 */
export function bodyToHtml(text: string): string {
  const blocks = text.split(/\n{2,}/)
  const rendered = blocks
    .map(block => {
      const inner = block
        .split('\n')
        .map(rawLine => {
          const trimmed = rawLine.trim()
          if (/^https?:\/\/\S+$/.test(trimmed)) {
            return `<a href="${esc(trimmed)}" style="color:#032133;">${esc(trimmed)}</a>`
          }
          return esc(rawLine)
        })
        .join('<br>')
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#032133;">${inner}</p>`
    })
    .join('')
  return rendered
}

/** The whole client email as HTML: the body, then the signature. */
export function wrapHtmlEmail(bodyText: string): string {
  return [
    '<div style="margin:0;padding:0;background:#ffffff;">',
    '<div style="max-width:560px;margin:0 auto;padding:24px 20px;',
    'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">',
    bodyToHtml(bodyText),
    signatureHtml(),
    '</div>',
    '</div>',
  ].join('')
}
