/** @module ColumnHeader — column label with resize handle */

import { useRef, useCallback } from "react";
import type { Column } from "../../types";
import styles from "./ColumnHeader.module.css";

interface ColumnHeaderProps {
  column: Column;
  width: number;
  stickyLeft: number | null;
  onResize: (columnKey: string, newWidth: number) => void;
}

export function ColumnHeader({
  column,
  width,
  stickyLeft,
  onResize,
}: ColumnHeaderProps): React.JSX.Element {
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const handlePointerDown = useCallback(
    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
      e.preventDefault();
      startRef.current = { x: e.clientX, width };
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
    },
    [width],
  );

  const handlePointerMove = useCallback(
    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
      if (!startRef.current) return;
      const delta = e.clientX - startRef.current.x;
      const newWidth = Math.max(40, startRef.current.width + delta);
      onResize(column.key, newWidth);
    },
    [column.key, onResize],
  );

  const handlePointerUp = useCallback(
    function handlePointerUp(): void {
      startRef.current = null;
    },
    [],
  );

  const className = stickyLeft !== null
    ? `${styles.header} ${styles.headerFixed}`
    : styles.header;

  const style: React.CSSProperties = {
    width,
    ...(stickyLeft !== null ? { left: stickyLeft } : {}),
  };

  return (
    <div className={className} style={style}>
      <span className={styles.label}>{column.label}</span>
      <div
        className={styles.resizeHandle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
      />
    </div>
  );
}
