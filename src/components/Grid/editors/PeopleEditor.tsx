/** @module PeopleEditor — searchable people picker for people columns */

import { useState, useRef, useEffect } from "react";
import type { Column } from "../../../types";
import { useAppContext } from "../../../state/AppContext";
import styles from "./PeopleEditor.module.css";

interface PeopleEditorProps {
  value: unknown;
  column: Column;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}

export function PeopleEditor({ value, onCommit, onCancel }: PeopleEditorProps): React.JSX.Element {
  const { state } = useAppContext();
  const currentIds = Array.isArray(value) ? (value as string[]) : [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(currentIds));
  const [filter, setFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const users = Array.from(state.userDirectory.values());
  const filtered = filter
    ? users.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase()))
    : users;

  function handleToggle(userId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
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
          placeholder="Search people..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className={styles.list}>
          {filtered.map((user) => (
            <label key={user.id} className={styles.userRow}>
              <input
                type="checkbox"
                checked={selectedIds.has(user.id)}
                onChange={() => handleToggle(user.id)}
                className={styles.checkbox}
              />
              <span className={styles.userName}>{user.name}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <div className={styles.empty}>No users found</div>
          )}
        </div>
      </div>
    </div>
  );
}
