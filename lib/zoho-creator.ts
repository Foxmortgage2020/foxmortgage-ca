// Server-side only — never import in client components
// Zoho Creator API utilities for the bookkeeping app
//
// Prerequisites:
//   1. Create Zoho Creator app named "bookkeeping" at creator.zoho.com
//   2. Create forms: Bookkeeping_Review and Production_Projects (see FOX-105)
//   3. Ensure ZOHO_REFRESH_TOKEN includes Creator scopes:
//      ZohoCreator.report.READ,ZohoCreator.form.CREATE,ZohoCreator.report.UPDATE
//
// Env vars (same as Zoho CRM — same OAuth app, needs Creator scopes added):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN

const CREATOR_BASE = 'https://creator.zoho.com/api/v2/2802551ontarioinc/bookkeeping'

// ─── Token ────────────────────────────────────────────────────────────────

async function getCreatorToken(): Promise<string> {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Zoho Creator token error: ${JSON.stringify(data)}`)
  return data.access_token
}

function creatorHeaders(token: string) {
  return {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json',
  }
}

// ─── Bookkeeping_Review form ───────────────────────────────────────────────
// Field API names (link names) — must match Zoho Creator form field link names exactly:
//   Transaction_ID, Transaction_Date, Vendor_Name, Amount,
//   Suggested_Account, Suggested_Memo_Tag, Confidence_Score, Match_Method,
//   AI_Notes, Status, Reviewer_Notes, Final_Account, Final_Memo_Tag, Reviewed_At

export async function getReviewQueue(status?: string) {
  const token = await getCreatorToken()
  let url = `${CREATOR_BASE}/report/All_Bookkeeping_Review`
  if (status) {
    url += `?criteria=Status=="${status}"`
  }
  const res = await fetch(url, { headers: creatorHeaders(token) })
  if (!res.ok) throw new Error(`Creator GET review queue failed: ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export async function createReviewRecord(record: Record<string, unknown>) {
  const token = await getCreatorToken()
  const res = await fetch(`${CREATOR_BASE}/form/Bookkeeping_Review/record`, {
    method: 'POST',
    headers: creatorHeaders(token),
    body: JSON.stringify({ data: record }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Creator POST review record failed: ${res.status} — ${JSON.stringify(data)}`)
  return data
}

export async function updateReviewRecord(rowId: string, updates: Record<string, unknown>) {
  const token = await getCreatorToken()
  const res = await fetch(`${CREATOR_BASE}/report/All_Bookkeeping_Review/${rowId}`, {
    method: 'PATCH',
    headers: creatorHeaders(token),
    body: JSON.stringify({ data: updates }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Creator PATCH review record failed: ${res.status} — ${JSON.stringify(data)}`)
  return data
}

// ─── Production_Projects form ──────────────────────────────────────────────
// Field API names:
//   Project_Name, Customer_Name, Contract_Value, Payment_Received_Date,
//   Payment_Received_Amount, Project_Start_Date, Project_End_Date,
//   Recognition_Method, Current_Completion_Percent, Revenue_Recognized_To_Date,
//   QBO_Deferred_Revenue_Ref, Status, Notes

export async function getProjects(status?: string) {
  const token = await getCreatorToken()
  let url = `${CREATOR_BASE}/report/All_Production_Projects`
  if (status) {
    url += `?criteria=Status=="${status}"`
  }
  const res = await fetch(url, { headers: creatorHeaders(token) })
  if (!res.ok) throw new Error(`Creator GET projects failed: ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export async function createProject(record: Record<string, unknown>) {
  const token = await getCreatorToken()
  const res = await fetch(`${CREATOR_BASE}/form/Production_Projects/record`, {
    method: 'POST',
    headers: creatorHeaders(token),
    body: JSON.stringify({ data: record }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Creator POST project failed: ${res.status} — ${JSON.stringify(data)}`)
  return data
}

export async function updateProject(rowId: string, updates: Record<string, unknown>) {
  const token = await getCreatorToken()
  const res = await fetch(`${CREATOR_BASE}/report/All_Production_Projects/${rowId}`, {
    method: 'PATCH',
    headers: creatorHeaders(token),
    body: JSON.stringify({ data: updates }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Creator PATCH project failed: ${res.status} — ${JSON.stringify(data)}`)
  return data
}

// ─── Production_Milestones form ────────────────────────────────────────────
// Field API names:
//   Project_ID, Milestone_Date, Milestone_Description,
//   Completion_Percent_At_Milestone, Revenue_Recognized_This_Milestone, Notes

export async function getMilestones(projectId?: string) {
  const token = await getCreatorToken()
  let url = `${CREATOR_BASE}/report/All_Production_Milestones`
  if (projectId) {
    url += `?criteria=Project_ID=="${projectId}"`
  }
  const res = await fetch(url, { headers: creatorHeaders(token) })
  if (!res.ok) throw new Error(`Creator GET milestones failed: ${res.status}`)
  const data = await res.json()
  return data.data || []
}

export async function createMilestone(record: Record<string, unknown>) {
  const token = await getCreatorToken()
  const res = await fetch(`${CREATOR_BASE}/form/Production_Milestones/record`, {
    method: 'POST',
    headers: creatorHeaders(token),
    body: JSON.stringify({ data: record }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Creator POST milestone failed: ${res.status} — ${JSON.stringify(data)}`)
  return data
}
