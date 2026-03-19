/** @module SplitPane — draggable vertical splitter between two panes */

import { useState, useRef, useCallback, useEffect } from "react";
import { useDragResize } from "../../hooks/useDragResize";
import styles from "./SplitPane.module.css";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  initialWidthPercent?: number;
  minPaneWidth?: number;
}

const DEFAULT_SPLIT_PERCENT = 50;
const DEFAULT_MIN_PANE_WIDTH = 200;

export function SplitPane({
  left,
  right,
  initialWidthPercent = DEFAULT_SPLIT_PERCENT,
  minPaneWidth = DEFAULT_MIN_PANE_WIDTH,
}: SplitPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);

  // Initialize left width from percentage on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const totalWidth = container.offsetWidth;
    setLeftWidth(Math.round((totalWidth * initialWidthPercent) / 100));
  }, [initialWidthPercent]);

  const handleDrag = useCallback(function handleDrag(deltaX: number): void {
    setLeftWidth((prev) => {
      if (prev === null) return prev;
      const container = containerRef.current;
      if (!container) return prev;
      const totalWidth = container.offsetWidth;
      const splitterWidth = 6;
      const maxLeft = totalWidth - splitterWidth - minPaneWidth;
      const clamped = Math.min(maxLeft, Math.max(minPaneWidth, prev + deltaX));
      return clamped;
    });
  }, [minPaneWidth]);

  const { handlePointerDown, handlePointerMove, handlePointerUp } =
    useDragResize(handleDrag);

  return (
    <div className={styles.splitPane} ref={containerRef}>
      <div
        className={styles.left}
        style={leftWidth !== null ? { width: leftWidth } : { flex: "0 0 50%" }}
      >
        {left}
      </div>
      <div
        className={styles.splitter}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className={styles.right}>
        {right}
      </div>
    </div>
  );
}
