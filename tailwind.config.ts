import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#032133',
          light: '#0a3a52',
          dark: '#021929',
        },
        lime: {
          DEFAULT: '#95D600',
          light: '#aae620',
          dark: '#7ab800',
        },
        // ─── Command Centre shell tokens (2026-07-14 redesign) ──────────
        // The governing rule: `decision` (the new lime) is attention
        // currency — it renders ONLY where a human decision is queued (nav
        // dots, decision badges, the Waiting-on-you strip, the primary
        // action on a decision row). tests/shell.test.ts audits usage.
        ink: {
          DEFAULT: '#17222E', // primary text
          navy: '#0A1B2E', // sidebar, Desk strip, primary buttons
          navy2: '#122A44', // dark hover
          navy3: '#1A3556', // dark active
        },
        fog: '#F4F6F9', // app canvas
        hairline: '#E3E8EE', // card and table borders
        muted: {
          DEFAULT: '#5C6B7D', // slate text
          2: '#8A97A6', // slate-2 text
        },
        decision: {
          DEFAULT: '#C6F53F', // decisions only
          ink: '#3D4F0A', // text on decision lime
        },
        caution: {
          DEFAULT: '#C77D1F', // review / caution text
          bg: '#FBF3E6',
        },
        danger: '#B0413E', // destructive and failures only
      },
      boxShadow: {
        card: '0 1px 2px rgba(10,27,46,.06), 0 4px 16px rgba(10,27,46,.05)',
      },
      fontFamily: {
        heading: ['var(--font-poppins)', 'sans-serif'],
        body: ['var(--font-montserrat)', 'sans-serif'],
        // Shell UI face (Archivo variable) and the single serif moment
        // (Fraunces, the Home greeting only — the same face clients see on
        // Fox Mortgage documents).
        ui: ['Archivo Variable', 'Archivo', 'sans-serif'],
        greeting: ['Fraunces Variable', 'Fraunces', 'Georgia', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.6s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
