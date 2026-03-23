/** @module Shell — layout frame: toolbar, content area, status bar */

import { useState } from "react";
import type { ReactNode, ChangeEvent } from "react";
import { useAppContext } from "../../state/AppContext";
import { themeToggled, boardDataLoaded, usersLoaded, logAdded } from "../../state/actions";
import { fetchBoardData, fetchUsers } from "../../services/mondayApi";
import { mapBoardToTasks } from "../../services/dataMapper";
import { logger } from "../../services/logger";
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
  const [loadingBoard, setLoadingBoard] = useState(false);

  function handleToggleTheme(): void {
    dispatch(themeToggled());
  }

  function handleToggleSettings(): void {
    setSettingsOpen((v) => !v);
  }

  function handleCloseSettings(): void {
    setSettingsOpen(false);
  }

  async function handleBoardChange(e: ChangeEvent<HTMLSelectElement>): Promise<void> {
    const boardId = e.target.value;
    const token = state.connection.token;
    if (!token || boardId === state.activeBoardId) return;

    setLoadingBoard(true);
    try {
      const [boardData, userDir] = await Promise.all([
        fetchBoardData(token, boardId),
        fetchUsers(token),
      ]);
      const { tasks, columns } = mapBoardToTasks(boardData, userDir);
      dispatch(usersLoaded(userDir));
      dispatch(boardDataLoaded(tasks, columns, boardId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load board";
      logger.error("Board switch failed", { boardId, error: message });
      dispatch(logAdded({
        id: `log-board-fail-${String(Date.now())}`,
        level: "error",
        message: `Failed to switch board: ${message}`,
        timestamp: Date.now(),
        details: { boardId },
      }));
    } finally {
      setLoadingBoard(false);
    }
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

  const activeBoardName = state.boards.find((b) => b.id === state.activeBoardId)?.name;

  return (
    <div className={styles.shell}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {state.activeBoardId && state.boards.length > 0 ? (
            <select
              className={styles.boardSelect}
              value={state.activeBoardId}
              onChange={handleBoardChange}
              disabled={loadingBoard}
              aria-label="Select board"
            >
              {state.boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className={styles.title}>{activeBoardName ?? "monday-project"}</h1>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {loadingBoard && <span className={styles.loadingIndicator}>Loading…</span>}
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
