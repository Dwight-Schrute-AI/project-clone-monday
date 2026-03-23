/** @module DateRangeEditor — inline date range input for timeline columns */

import { useState, useRef, useEffect } from "react";
import styles from "./DateRangeEditor.module.css";

interface DateRangeEditorProps {
  startDate: string | null;
  endDate: string | null;
  onCommit: (start: string | null, end: string | null) => void;
  onCancel: () => void;
}

export function DateRangeEditor({ startDate, endDate, onCommit, onCancel }: DateRangeEditorProps): React.JSX.Element {
  const [start, setStart] = useState(startDate ?? "");
  const [end, setEnd] = useState(endDate ?? "");
  const startRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(start || null, end || null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          onCommit(start || null, end || null);
        }
      }}
    >
      <div className={styles.dropdown}>
        <label className={styles.field}>
          <span className={styles.label}>Start</span>
          <input
            ref={startRef}
            className={styles.input}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>End</span>
          <input
            className={styles.input}
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
