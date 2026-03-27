# Fox Mortgage — foxmortgage.ca

Next.js 14 marketing website for Fox Mortgage.

## Stack
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Vercel deployment

## Local Development

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in values.

For Vercel, add these in Project → Settings → Environment Variables:
- `ZOHO_CLIENT_ID`
- `ZOHO_CLIENT_SECRET`
- `ZOHO_REFRESH_TOKEN`

## Deploy to Vercel

```bash
# First time
npx vercel

# Production deploy
npx vercel --prod
```

Or connect this repo to Vercel for automatic deploys on push to main.

## Zoho CRM Integration

API routes are in `app/api/`. Currently they `console.log` submissions.
To activate Zoho:
1. Add env vars above
2. Uncomment the Zoho calls in `app/api/contact/route.ts` and `app/api/smm-enroll/route.ts`

## Phase 2 (coming)
- Realtor portal (`/portal/realtor`) — Clerk auth + Zoho Leads
- Investor portal (`/portal/investor`) — Clerk auth + Zoho Deals

## Compliance
- Michael Fox · Mortgage Agent, Level 2
- BRX Mortgage Inc. · FSRA #13463
- Never use "broker" or "advisor"
- Never reference "Ownwell" — always "Strategic Mortgage Monitoring"
