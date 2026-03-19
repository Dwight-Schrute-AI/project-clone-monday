/** @module DateEditor — inline date input for date and timeline columns */

import { useState, useRef, useEffect } from "react";
import type { Column } from "../../../types";
import styles from "./DateEditor.module.css";

interface DateEditorProps {
  value: unknown;
  column: Column;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function DateEditor({ value, onCommit, onCancel }: DateEditorProps): React.JSX.Element {
  const dateStr = typeof value === "string" ? value : "";
  const [date, setDate] = useState(dateStr);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(date || null);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function handleBlur(): void {
    onCommit(date || null);
  }

  return (
    <input
      ref={inputRef}
      className={styles.input}
      type="date"
      value={date}
      onChange={(e) => setDate(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
