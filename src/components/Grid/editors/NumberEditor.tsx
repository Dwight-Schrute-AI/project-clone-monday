/** @module NumberEditor — inline number input for numeric columns */

import { useState, useRef, useEffect } from "react";
import type { Column } from "../../../types";
import styles from "./NumberEditor.module.css";

interface NumberEditorProps {
  value: unknown;
  column: Column;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function NumberEditor({ value, onCommit, onCancel }: NumberEditorProps): React.JSX.Element {
  const initial = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(text === "" ? null : Number(text));
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function handleBlur(): void {
    onCommit(text === "" ? null : Number(text));
  }

  return (
    <input
      ref={inputRef}
      className={styles.input}
      type="number"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
