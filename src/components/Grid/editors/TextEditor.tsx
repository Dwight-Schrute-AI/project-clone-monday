/** @module TextEditor — inline text input for text columns */

import { useState, useRef, useEffect } from "react";
import type { Column } from "../../../types";
import styles from "./TextEditor.module.css";

interface TextEditorProps {
  value: unknown;
  column: Column;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function TextEditor({ value, onCommit, onCancel }: TextEditorProps): React.JSX.Element {
  const [text, setText] = useState(String(value ?? ""));
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
      onCommit(text);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  function handleBlur(): void {
    onCommit(text);
  }

  return (
    <input
      ref={inputRef}
      className={styles.input}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
