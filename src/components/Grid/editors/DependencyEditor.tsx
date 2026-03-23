/** @module DependencyEditor — searchable task picker for dependency columns */

import { useState, useRef, useEffect, useMemo } from "react";
import type { Column } from "../../../types";
import { useAppContext } from "../../../state/AppContext";
import styles from "./DependencyEditor.module.css";

interface DependencyEditorProps {
  value: unknown;
  column: Column;
  taskId: string;
  displayIds: Map<string, string>;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function DependencyEditor({ value, taskId, displayIds, onCommit, onCancel }: DependencyEditorProps): React.JSX.Element {
  const { state } = useAppContext();
  const currentIds = Array.isArray(value) ? (value as string[]) : [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(currentIds));
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Build list of selectable tasks (exclude group rows and the current task)
  const selectableTasks = useMemo(() => {
    return state.tasks.filter(
      (t) => !t.isGroupRow && t.id !== taskId
    );
  }, [state.tasks, taskId]);

  const filtered = filter
    ? selectableTasks.filter((t) => {
        const lower = filter.toLowerCase();
        const wbs = displayIds.get(t.id) ?? "";
        return t.name.toLowerCase().includes(lower) || wbs.startsWith(filter);
      })
    : selectableTasks;

  function handleToggle(depTaskId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(depTaskId)) {
        next.delete(depTaskId);
      } else {
        next.add(depTaskId);
      }
      return next;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommit(Array.from(selectedIds));
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      ref={containerRef}
      className={styles.container}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          onCommit(Array.from(selectedIds));
        }
      }}
    >
      <div className={styles.dropdown}>
        <input
          ref={inputRef}
          className={styles.filterInput}
          type="text"
          placeholder="Search tasks..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className={styles.list}>
          {filtered.map((t) => (
            <label key={t.id} className={styles.taskRow}>
              <input
                type="checkbox"
                checked={selectedIds.has(t.id)}
                onChange={() => handleToggle(t.id)}
                className={styles.checkbox}
              />
              <span className={styles.taskWbs}>{displayIds.get(t.id) ?? ""}</span>
              <span className={styles.taskName}>{t.name}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <div className={styles.empty}>No tasks found</div>
          )}
        </div>
      </div>
    </div>
  );
}
