/** @module StatusEditor — dropdown for status columns with colored indicators */

import { useRef, useEffect } from "react";
import type { Column } from "../../../types";
import styles from "./StatusEditor.module.css";

interface StatusEditorProps {
  value: unknown;
  column: Column;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function StatusEditor({ value, column, onCommit, onCancel }: StatusEditorProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const currentLabel = String(value ?? "");

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  function handleSelect(label: string): void {
    onCommit(label);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  const options = column.options ?? [];

  return (
    <div
      ref={containerRef}
      className={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          onCancel();
        }
      }}
    >
      <div className={styles.dropdown}>
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            className={`${styles.option} ${opt.label === currentLabel ? styles.optionSelected : ""}`}
            onClick={() => handleSelect(opt.label)}
          >
            {opt.color && (
              <span
                className={styles.colorDot}
                style={{ backgroundColor: opt.color }}
              />
            )}
            <span className={styles.optionLabel}>{opt.label}</span>
          </button>
        ))}
        {options.length === 0 && (
          <div className={styles.empty}>No options</div>
        )}
      </div>
    </div>
  );
}
