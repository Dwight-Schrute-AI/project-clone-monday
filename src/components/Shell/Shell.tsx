/** @module Shell — layout frame: toolbar, content area, status bar */

import { useState } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "../../state/AppContext";
import { themeToggled } from "../../state/actions";
import { StatusBar } from "../common/StatusBar";
import { LogDrawer } from "../common/LogDrawer";
import { SettingsDialog } from "../Settings/SettingsDialog";
import styles from "./Shell.module.css";

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);

  function handleToggleTheme(): void {
    dispatch(themeToggled());
  }

  function handleToggleSettings(): void {
    setSettingsOpen((v) => !v);
  }

  function handleCloseSettings(): void {
    setSettingsOpen(false);
  }

  const taskCount = state.tasks.filter((t) => !t.isGroupRow).length;
  const pendingCount = state.pendingWrites.size;
  const errorCount = state.log.filter((e) => e.level === "error").length;

  function handleToggleLog(): void {
    setLogOpen((v) => !v);
  }

  function handleCloseLog(): void {
    setLogOpen(false);
  }

  return (
    <div className={styles.shell}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.title}>monday-project</h1>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.toolbarButton}
            onClick={handleToggleTheme}
            type="button"
            aria-label="Toggle theme"
          >
            {state.theme === "light" ? "\u263E" : "\u2600"}
          </button>
          <button
            className={styles.toolbarButton}
            onClick={handleToggleSettings}
            type="button"
            aria-label="Settings"
          >
            &#x2699;
          </button>
        </div>
      </header>

      <main className={styles.content}>{children}</main>

      <LogDrawer entries={state.log} open={logOpen} onClose={handleCloseLog} />

      <StatusBar
        connectionStatus={state.connection.status}
        userName={state.connection.userName}
        taskCount={taskCount}
        pendingCount={pendingCount}
        errorCount={errorCount}
        onToggleLog={handleToggleLog}
      />

      <SettingsDialog open={settingsOpen} onClose={handleCloseSettings} />
    </div>
  );
}
