/** @module StatusBar — bottom bar showing connection status and task count */

import styles from "./StatusBar.module.css";

interface StatusBarProps {
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  userName: string | null;
  taskCount: number;
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
      </div>
      {taskCount > 0 && (
        <div className={styles.right}>
          {String(taskCount)} task{taskCount !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
