// The ONE structural test-room predicate (Phase B1 Task 4). A workbench
// room whose file_ref carries the TEST- prefix, or whose status carries a
// test marker (the tenant-isolation battery wrote its marker into status),
// is invisible to every live surface — board, search, counts, Today strip —
// regardless of status. Applied at the FETCHER boundary (lib/underwriting.ts
// getDealsSummary), not remembered per page: one function remembering
// "non-test" is luck, not defense (the test-portal rate-quote lesson).
// Test rooms remain visible to the test suite (which tests this predicate)
// and in demo mode (demo renders fixtures, never live rows).

export function isTestRoom(fileRef: string | null | undefined, status?: string | null): boolean {
  if (fileRef && /^\s*test[-_]/i.test(fileRef)) return true
  if (status && /test[-_]/i.test(status)) return true
  return false
}
