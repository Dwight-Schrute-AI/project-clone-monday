/** @module LogDrawer — collapsible panel showing recent log entries */

import type { LogEntry } from "../../types";
import styles from "./LogDrawer.module.css";

interface LogDrawerProps {
  entries: LogEntry[];
  open: boolean;
  onClose: () => void;
}

const LEVEL_ICONS: Record<LogEntry["level"], string> = {
  info: "\u24D8",
  warn: "\u26A0",
  error: "\u2716",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}

export function LogDrawer({
  entries,
  open,
  onClose,
}: LogDrawerProps): React.JSX.Element | null {
  if (!open) return null;

  const recent = entries.slice(-50).reverse();

  return (
    <div className={styles.drawer}>
      <div className={styles.header}>
        <span className={styles.title}>Log</span>
        <button
          className={styles.closeButton}
          onClick={onClose}
          type="button"
          aria-label="Close log"
        >
          &times;
        </button>
      </div>
      <div className={styles.body}>
        {recent.length === 0 && (
          <p className={styles.empty}>No log entries</p>
        )}
        {recent.map((entry) => (
          <div key={entry.id} className={`${styles.entry} ${styles[entry.level] ?? ""}`}>
            <span className={styles.icon}>{LEVEL_ICONS[entry.level]}</span>
            <span className={styles.message}>{entry.message}</span>
            <span className={styles.time}>{formatTimestamp(entry.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
