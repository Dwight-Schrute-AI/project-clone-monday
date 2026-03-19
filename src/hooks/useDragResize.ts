/** @module useDragResize — generic pointer-drag hook for splitters, columns, bars */

import { useRef, useCallback } from "react";

interface DragResizeHandlers {
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
}

/**
 * Generic hook for pointer-based drag resizing.
 * Tracks horizontal delta from the initial pointerdown position
 * and calls `onDrag` with cumulative deltaX on each move.
 * Uses pointer capture to ensure smooth dragging even outside the element.
 */
export function useDragResize(onDrag: (deltaX: number) => void): DragResizeHandlers {
  const startXRef = useRef<number | null>(null);

  const handlePointerDown = useCallback(function handlePointerDown(e: React.PointerEvent): void {
    e.preventDefault();
    startXRef.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(function handlePointerMove(e: React.PointerEvent): void {
    if (startXRef.current === null) return;
    const deltaX = e.clientX - startXRef.current;
    startXRef.current = e.clientX;
    onDrag(deltaX);
  }, [onDrag]);

  const handlePointerUp = useCallback(function handlePointerUp(e: React.PointerEvent): void {
    if (startXRef.current === null) return;
    startXRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
