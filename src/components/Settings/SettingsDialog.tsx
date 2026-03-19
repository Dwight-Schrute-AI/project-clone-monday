/** @module SettingsDialog — modal for API token entry, connection, and theme toggle */

import { useState } from "react";
import { useAppContext } from "../../state/AppContext";
import {
  connectionStart,
  connectionSuccess,
  connectionFailed,
  boardsLoaded,
  themeToggled,
} from "../../state/actions";
import { testConnection, fetchBoards } from "../../services/mondayApi";
import { logger } from "../../services/logger";
import styles from "./SettingsDialog.module.css";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  onClose,
}: SettingsDialogProps): React.JSX.Element | null {
  const { state, dispatch } = useAppContext();
  const [tokenInput, setTokenInput] = useState(state.connection.token ?? "");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleBackdropClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  async function handleConnect(): Promise<void> {
    const token = tokenInput.trim();
    if (!token) {
      setError("Please enter an API token");
      return;
    }

    setConnecting(true);
    setError(null);
    dispatch(connectionStart());

    try {
      const user = await testConnection(token);
      dispatch(connectionSuccess(user.id, user.name, token));

      const boards = await fetchBoards(token);
      dispatch(boardsLoaded(boards));

      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      dispatch(connectionFailed(message));
      setError(message);
      logger.error("Connection failed", { error: message });
    } finally {
      setConnecting(false);
    }
  }

  function handleToggleTheme(): void {
    dispatch(themeToggled());
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && !connecting) {
      void handleConnect();
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div className={styles.dialog} role="dialog" aria-label="Settings">
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            &#x2715;
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.section}>
            <label className={styles.label} htmlFor="api-token">
              monday.com API Token
            </label>
            <div className={styles.tokenRow}>
              <input
                id="api-token"
                className={styles.input}
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter your API token"
                autoComplete="off"
              />
              <button
                className={styles.toggleButton}
                onClick={() => setShowToken((v) => !v)}
                type="button"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button
              className={styles.connectButton}
              onClick={() => void handleConnect()}
              disabled={connecting}
              type="button"
            >
              {connecting ? "Connecting\u2026" : "Connect"}
            </button>

            {state.connection.status === "connected" && (
              <p className={styles.success}>
                Connected as {state.connection.userName}
              </p>
            )}
          </div>

          <div className={styles.section}>
            <label className={styles.label}>Theme</label>
            <button
              className={styles.themeButton}
              onClick={handleToggleTheme}
              type="button"
            >
              {state.theme === "light" ? "\u263E Dark Mode" : "\u2600 Light Mode"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
