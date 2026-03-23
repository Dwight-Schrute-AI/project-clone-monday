/** @module useScrollSync — syncs vertical scrollTop between two scrollable elements */

import { useEffect, useRef } from "react";

/**
 * Synchronizes vertical scroll position between two elements.
 * Uses requestAnimationFrame for smooth updates and a flag to prevent
 * circular scroll events (A scrolls → sets B → B fires scroll → would set A).
 *
 * The `enabled` parameter allows the caller to signal when the target
 * elements are actually mounted (e.g., after board data loads). Without
 * this, the effect would run once with null refs and never re-attach.
 */
export function useScrollSync(
  refA: React.RefObject<HTMLDivElement | null>,
  refB: React.RefObject<HTMLDivElement | null>,
  enabled: boolean = true,
): void {
  const isSyncingRef = useRef(false);
  const rafIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const elA = refA.current;
    const elB = refB.current;
    if (!elA || !elB) return;

    function handleScrollA(): void {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        if (elB) {
          elB.scrollTop = elA!.scrollTop;
        }
        isSyncingRef.current = false;
      });
    }

    function handleScrollB(): void {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        if (elA) {
          elA.scrollTop = elB!.scrollTop;
        }
        isSyncingRef.current = false;
      });
    }

    elA.addEventListener("scroll", handleScrollA, { passive: true });
    elB.addEventListener("scroll", handleScrollB, { passive: true });

    return () => {
      elA.removeEventListener("scroll", handleScrollA);
      elB.removeEventListener("scroll", handleScrollB);
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [refA, refB, enabled]);
}
