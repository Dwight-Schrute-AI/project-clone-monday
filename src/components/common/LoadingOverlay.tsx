/** @module LoadingOverlay — centered spinner with semi-transparent backdrop */

import styles from "./LoadingOverlay.module.css";

interface LoadingOverlayProps {
  message?: string;
}

export function LoadingOverlay({ message }: LoadingOverlayProps): React.JSX.Element {
  return (
    <div className={styles.overlay}>
      <div className={styles.spinner} aria-label="Loading" />
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
}
