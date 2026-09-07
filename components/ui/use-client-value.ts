import { useSyncExternalStore } from "react";

/**
 * Reads a value that only exists in the browser, without a hydration mismatch.
 *
 * Three things in this UI depend on the client and cannot be known when the
 * server renders: the reader's local hour, their platform's modifier key, and
 * what they previously dismissed. The obvious implementation - `useState` plus
 * an effect that corrects it - works, but it sets state synchronously inside an
 * effect, which causes a second render pass for every one of them and is what
 * `react-hooks/set-state-in-effect` exists to catch.
 *
 * `useSyncExternalStore` is the supported answer. React renders `serverValue`
 * on the server and during hydration, then swaps to `getClientValue()` in the
 * same commit - no cascading render, no mismatch warning, and no flash of the
 * wrong value written into the HTML.
 *
 * `getClientValue` must return a primitive, or a reference that is stable
 * between calls. React invokes it on every render and compares with `Object.is`,
 * so a function returning a fresh object each time would loop forever.
 */

/** These values do not change under us, so there is nothing to subscribe to. */
const noopSubscribe = () => () => {};

export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, getClientValue, () => serverValue);
}
