/** @module Shell — layout frame: toolbar, content area, status bar */

import { useState, useMemo } from "react";
import type { ReactNode, ChangeEvent } from "react";
import { useAppContext } from "../../state/AppContext";
import {
  themeToggled, boardDataLoaded, usersLoaded, logAdded,
  ganttZoomChanged, allGroupsCollapsed, allGroupsExpanded,
  allItemsCollapsed, allItemsExpanded, departmentFilterSet,
} from "../../state/actions";
import { selectDepartments } from "../../state/selectors";
import { fetchBoardData, fetchUsers } from "../../services/mondayApi";
import { mapBoardToTasks } from "../../services/dataMapper";
import { logger } from "../../services/logger";
import { ZOOM_PRESETS } from "../Gantt/Gantt";
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

  function handleCollapseChange(e: ChangeEvent<HTMLSelectElement>): void {
    const val = e.target.value;
    switch (val) {
      case "collapse-groups": dispatch(allGroupsCollapsed()); break;
      case "expand-all": dispatch(allGroupsExpanded()); break;
      case "collapse-subitems": dispatch(allItemsCollapsed()); break;
      case "expand-subitems": dispatch(allItemsExpanded()); break;
    }
    // Reset to the label option after action
    e.target.value = "";
  }

  function handleZoomChange(e: ChangeEvent<HTMLInputElement>): void {
    dispatch(ganttZoomChanged(Number(e.target.value)));
  }

  function handleDepartmentChange(e: ChangeEvent<HTMLSelectElement>): void {
    const val = e.target.value;
    dispatch(departmentFilterSet(val === "" ? null : val));
  }

  const departments = useMemo(
    () => selectDepartments(state),
    [state.tasks, state.columns],
  );

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
  const projectBoards = state.boards.filter((b) => /^T\d+/.test(b.name));
  const boardLoaded = state.tasks.length > 0;
  const zoomLabel = (ZOOM_PRESETS[state.ganttZoom] ?? ZOOM_PRESETS[4]!).label;

  // Determine collapse state for context-aware menu
  const groupsCollapsed = state.collapsedGroups.size > 0;
  const itemsCollapsed = state.collapsedItems.size > 0;
  const hasSubitems = useMemo(() => {
    for (const t of state.tasks) {
      if (t.isSubitem) return true;
    }
    return false;
  }, [state.tasks]);

  return (
    <div className={styles.shell}>
      <header className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {state.activeBoardId && projectBoards.length > 0 ? (
            <select
              className={styles.boardSelect}
              value={state.activeBoardId}
              onChange={handleBoardChange}
              disabled={loadingBoard}
              aria-label="Select board"
            >
              {projectBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className={styles.title}>{activeBoardName ?? "monday-project"}</h1>
          )}
          {boardLoaded && (
            <>
              <select
                className={styles.filterSelect}
                defaultValue=""
                onChange={handleCollapseChange}
                aria-label="Collapse/Expand"
              >
                <option value="" disabled>View</option>
                {!groupsCollapsed && <option value="collapse-groups">Collapse Tasks</option>}
                {groupsCollapsed && <option value="expand-all">Expand Tasks</option>}
                {hasSubitems && !itemsCollapsed && <option value="collapse-subitems">Collapse Sub-tasks</option>}
                {hasSubitems && itemsCollapsed && <option value="expand-subitems">Expand Sub-tasks</option>}
              </select>
              {departments.length > 0 && (
                <select
                  className={styles.filterSelect}
                  value={state.departmentFilter ?? ""}
                  onChange={handleDepartmentChange}
                  aria-label="Filter by department"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
        <div className={styles.toolbarRight}>
          {loadingBoard && <span className={styles.loadingIndicator}>Loading…</span>}
          {boardLoaded && (
            <div className={styles.zoomControl}>
              <span className={styles.zoomLabel}>{zoomLabel}</span>
              <input
                type="range"
                className={styles.zoomSlider}
                min="0"
                max={String(ZOOM_PRESETS.length - 1)}
                step="1"
                value={state.ganttZoom}
                onChange={handleZoomChange}
                aria-label="Gantt zoom level"
              />
            </div>
          )}
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
