// Version-toast detection (B2b, Task 8) — pure, so it unit-tests without a
// browser. A NEW version is ready when a service worker reaches 'installed'
// while an existing controller runs this page, or when the controller changes
// under a page that already had one. The component NEVER reloads on its own:
// it shows the quiet toast and the human presses Refresh.
//
// KNOWN GAP, recorded honestly (adversarial review, 2026-07-17). These rules
// use "this page has a controller" as a proxy for "a worker was already
// installed", and that proxy is not sound in one case: a HARD reload
// (Cmd+Shift+R, or DevTools "Bypass for network") loads the page with the
// service worker bypassed, so the document is uncontrolled even though a
// worker is active. Such a tab is read as a first install and stays silent
// through the next deploy. It is bounded and self-healing — the failure is
// silence, not a false toast, and the following deploy toasts normally once
// claim() has given the tab a controller — but it lands on whoever hard-
// reloads, which is usually the person shipping. The fix is to compare worker
// IDENTITY (registration.active at watch time vs the new controller) instead
// of mere presence; deliberately out of this session's scope, which was told
// to leave the decision wiring alone and add the missing triggers. See
// docs/toast-fix-2026-07-17.md.

export interface WorkerLike {
  state: string
}

export interface RegistrationLike {
  waiting: WorkerLike | null
  installing: WorkerLike | null
}

/** A registration already holds an installed worker waiting behind the live one. */
export function updateReadyNow(reg: RegistrationLike, hasController: boolean): boolean {
  return hasController && reg.waiting !== null && reg.waiting.state === 'installed'
}

/** A statechange landed on 'installed' while an existing controller runs the page. */
export function installedBehindController(state: string, hasController: boolean): boolean {
  return state === 'installed' && hasController
}

/**
 * controllerchange means a new worker took the page over. That is an update
 * ONLY when the page already had a controller when it loaded — a first
 * install claiming clients is not new code to refresh into. (An uncontrolled
 * hard-reloaded tab is read as a first install here; see the known gap at the
 * top of this file.)
 */
export function controllerChangeMeansUpdate(hadControllerAtStart: boolean): boolean {
  return hadControllerAtStart
}

// ─── Asking the browser to look (the toast fix, 2026-07-17) ─────────────────
//
// The rules above decide when to toast, but nothing was ever asking the
// browser to CHECK for a new worker: the component never called
// reg.update(), and Next's client-side routing never triggers the browser's
// own check, so an idle tab could sit for up to 24 hours before noticing a
// deploy. These are the missing triggers, kept pure (the host is injected) so
// they unit-test in node without a DOM.

/** How often an open tab asks the browser to look for a new worker. */
export const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000

export interface UpdateCheckHost {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
  addVisibilityListener: (fn: () => void) => void
  removeVisibilityListener: (fn: () => void) => void
  isVisible: () => boolean
}

/**
 * Ask for an update check on a timer and whenever the tab becomes visible
 * (the common case: a laptop wakes, or the human comes back to a tab that has
 * been open since before the deploy). Returns the teardown.
 *
 * A check only ASKS; whether anything is offered is the browser's call, and
 * whether a toast appears is the decision logic above. Nothing here reloads.
 */
export function scheduleUpdateChecks(check: () => void, host: UpdateCheckHost): () => void {
  const timer = host.setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  const onVisibility = () => {
    if (host.isVisible()) check()
  }
  host.addVisibilityListener(onVisibility)
  return () => {
    host.clearInterval(timer)
    host.removeVisibilityListener(onVisibility)
  }
}
