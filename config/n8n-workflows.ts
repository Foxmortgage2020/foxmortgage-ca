// Known n8n workflows the Status page reports on. IDs from CLAUDE.md plus
// the underwriting-department bridges discovered live on 2026-07-09.
// The Status page displays the LIVE name from the n8n API when reachable;
// the label here is a fallback for error rows only.

export interface KnownWorkflow {
  id: string
  label: string
  area: 'bookkeeping' | 'ops' | 'portal' | 'underwriting'
}

export const KNOWN_N8N_WORKFLOWS: KnownWorkflow[] = [
  { id: 'Uu6fsZ2A2gTn0gBs', label: 'Bookkeeping: Nightly Transaction Categorization', area: 'bookkeeping' },
  { id: '1iR3tvhFATxwFnj7', label: 'Bookkeeping: Monthly Deferred Revenue Recognition', area: 'bookkeeping' },
  { id: 'Rupc79GeJ8s6bbJa', label: 'QBO Nightly Categorization (future production)', area: 'bookkeeping' },
  { id: 'dceYGLjOIRQAuS0p', label: 'Daily Briefing and Alerts', area: 'ops' },
  { id: 'CZ1zh0gKvkQuTBMc', label: 'SMM Lead Monitor', area: 'ops' },
  { id: 'dh1qIttAuctSQ7L0', label: 'Daily Deal Briefing', area: 'ops' },
  { id: 'R26owEsG07d1a4Mq', label: 'Investor Deals Monitor', area: 'ops' },
  { id: 'j17v139rGek6tjAC', label: 'FP Portal: Referral Submission', area: 'portal' },
  { id: '1jl45sF4HfvxO5L8', label: 'FP Portal: Messaging', area: 'portal' },
  { id: 'j40F8SNCamVCNG1o', label: 'UW Finmo Intake Capture', area: 'underwriting' },
  { id: 'idGnmBroVCaPMrxT', label: 'UW Zoho Mirror Bridge', area: 'underwriting' },
  { id: 'vpaP0iCAXCj8MSdN', label: 'Dialpad Underwriting Transcripts', area: 'underwriting' },
  { id: 'FMSk74R5GBuIb6mk', label: 'Outlook Deal Correspondence', area: 'underwriting' },
  { id: 'kxubMZWW4xqXnMJJ', label: 'Dialpad Number Directory Learner', area: 'underwriting' },
  { id: 'IFDRp2BGHAbzKpHH', label: 'Finmo Sync v2', area: 'ops' },
]

// The bookkeeping dry-run workflow the Status page reads WRITE_TO_QBO from.
export const BOOKKEEPING_NIGHTLY_WORKFLOW_ID = 'Uu6fsZ2A2gTn0gBs'
