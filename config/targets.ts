// Business targets and command-center constants. Tune values here; the
// pacing math itself lives in lib/pacing.ts (pure, unit-tested).

// Annual funded-volume target for the goal pacing widget, in dollars.
export const ANNUAL_FUNDED_TARGET = 12_000_000

// The practice this command center reads. The fox-underwriting workbench is
// tenant-scoped by agent row; today the practice has exactly one agent
// (Michael, row 1 of the agents table), resolved by email match and cached.
// When staff and recruited agents arrive, per-user agent mapping replaces
// this constant.
export const WORKBENCH_AGENT_EMAIL = 'mfox@foxmortgage.ca'

// All date arithmetic on the admin surface anchors to the practice timezone.
export const ADMIN_TZ = 'America/Toronto'

// Needs Attention thresholds.
export const CONDITIONS_DUE_SOON_DAYS = 7
export const CLOSINGS_ATTENTION_DAYS = 10
export const INTAKE_STALE_HOURS = 24

// Closings strip window on the Home page.
export const CLOSINGS_STRIP_DAYS = 7

// Audit viewer CSV export row cap (stated in the UI next to the button).
export const AUDIT_EXPORT_CAP = 5000
