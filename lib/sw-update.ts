// Version-toast detection (B2b, Task 8) — pure, so it unit-tests without a
// browser. A NEW version is ready when a service worker reaches 'installed'
// while an existing controller runs this page (no controller = the very
// first install, nothing new to refresh into), or when the controller
// changes under a page that already had one. The component NEVER reloads on
// its own: it shows the quiet toast and the human presses Refresh.

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
 * install claiming clients is not new code to refresh into.
 */
export function controllerChangeMeansUpdate(hadControllerAtStart: boolean): boolean {
  return hadControllerAtStart
}
