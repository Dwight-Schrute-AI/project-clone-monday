/** @module StatusBar — bottom bar showing connection status, task count, pending writes, log toggle */

import styles from "./StatusBar.module.css";

interface StatusBarProps {
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  userName: string | null;
  taskCount: number;
  pendingCount: number;
  errorCount: number;
  onToggleLog: () => void;
}

const STATUS_LABELS: Record<StatusBarProps["connectionStatus"], string> = {
  disconnected: "Disconnected",
  connecting: "Connecting\u2026",
  connected: "Connected",
  error: "Connection Error",
};

export function StatusBar({
  connectionStatus,
  userName,
  taskCount,
  pendingCount,
  errorCount,
  onToggleLog,
}: StatusBarProps): React.JSX.Element {
  const label =
    connectionStatus === "connected" && userName
      ? `Connected as ${userName}`
      : STATUS_LABELS[connectionStatus];

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <span
          className={`${styles.dot} ${styles[connectionStatus] ?? ""}`}
          aria-hidden="true"
        />
        <span className={styles.label}>{label}</span>
        {pendingCount > 0 && (
          <span className={styles.pending}>
            {String(pendingCount)} pending
          </span>
        )}
      </div>
      <div className={styles.right}>
        {taskCount > 0 && (
          <span>
            {String(taskCount)} task{taskCount !== 1 ? "s" : ""}
          </span>
        )}
        <button
          className={styles.logButton}
          onClick={onToggleLog}
          type="button"
          aria-label="Toggle log"
        >
          Log{errorCount > 0 && (
            <span className={styles.errorBadge}>{String(errorCount)}</span>
          )}
        </button>
      </div>
    </div>
  );
}
