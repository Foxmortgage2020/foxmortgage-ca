'use client'

// Rasterizes a target inline <svg> (the export slide) to a high-resolution
// PNG and downloads it. The slide is fully self-contained, so the PNG carries
// the Fox mark, title, chart, and footer with no portal chrome.
//
// Font fidelity: an SVG rasterized through an <img> renders in an isolated
// context that does not see the page's @font-face fonts, so the brand fonts
// are embedded as base64 into a clone before rasterizing. If embedding fails
// for any reason the PNG still renders (with a system sans-serif fallback)
// and never throws — the print view remains the fully faithful path.

import { useState } from 'react'

const SVG_NS = 'http://www.w3.org/2000/svg'

function getVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

// Collect @font-face rules whose family is one of the brand fonts, fetch the
// woff/woff2 (same-origin, so no CORS), and return inline @font-face CSS.
async function collectBrandFontCss(): Promise<string> {
  const wanted = `${getVar('--font-poppins')} ${getVar('--font-montserrat')}`
  const faces: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin stylesheet; skip
    }
    if (!rules) continue
    for (const rule of Array.from(rules)) {
      if (rule.constructor.name !== 'CSSFontFaceRule') continue
      const style = (rule as CSSFontFaceRule).style
      const fam = style.getPropertyValue('font-family').replace(/["']/g, '').trim()
      if (!fam || !wanted.includes(fam)) continue
      const src = style.getPropertyValue('src')
      const m = src.match(/url\(["']?([^"')]+\.woff2?)["']?\)/)
      if (!m) continue
      try {
        const res = await fetch(m[1])
        if (!res.ok) continue
        const buf = await res.arrayBuffer()
        const fmt = m[1].endsWith('woff2') ? 'woff2' : 'woff'
        const weight = style.getPropertyValue('font-weight') || '400'
        faces.push(
          `@font-face{font-family:'${fam}';src:url(data:font/${fmt};base64,${bufToBase64(buf)}) format('${fmt}');font-weight:${weight};font-style:normal;}`,
        )
      } catch {
        // one font failing is not fatal
      }
    }
  }
  return faces.join('')
}

async function svgToPngBlob(svg: SVGSVGElement, scale: number): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const vb = (svg.getAttribute('viewBox') ?? '0 0 1200 828').split(/\s+/).map(Number)
  const w = vb[2] || svg.clientWidth || 1200
  const h = vb[3] || svg.clientHeight || 828
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))

  // Embed fonts and resolve the CSS custom properties the SVG references.
  let fontCss = ''
  try {
    fontCss = await collectBrandFontCss()
  } catch {
    fontCss = ''
  }
  if (fontCss) {
    const styleEl = document.createElementNS(SVG_NS, 'style')
    styleEl.textContent = fontCss
    clone.insertBefore(styleEl, clone.firstChild)
  }

  let markup = new XMLSerializer().serializeToString(clone)
  const poppins = getVar('--font-poppins') || 'sans-serif'
  const montserrat = getVar('--font-montserrat') || 'sans-serif'
  markup = markup
    .split('var(--font-poppins), sans-serif').join(poppins)
    .split('var(--font-montserrat), sans-serif').join(montserrat)

  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('svg image load failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function PngDownloadButton({
  targetId,
  filename,
  scale = 2.5,
}: {
  targetId: string
  filename: string
  scale?: number
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const svg = document.getElementById(targetId) as SVGSVGElement | null
      if (!svg) throw new Error('chart not found')
      // Give any just-loaded fonts a tick to settle before rasterizing.
      if (document.fonts?.ready) await document.fonts.ready
      const blob = await svgToPngBlob(svg, scale)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('PNG export failed. Use Print to PDF instead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-print inline-flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button
          onClick={download}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy/90 disabled:opacity-60"
        >
          {busy ? 'Rendering…' : 'Download PNG'}
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-navy/30 px-4 py-2 text-sm font-semibold text-navy hover:border-navy"
        >
          Print / Save as PDF
        </button>
      </div>
      {error && <p className="text-xs text-red-600 font-ui">{error}</p>}
    </div>
  )
}
