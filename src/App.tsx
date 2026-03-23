/** @module App shell — auth, board selection, data loading */

import { useReducer, useEffect, useRef, useCallback } from "react";
import { appReducer, initialState } from "./state/appReducer";
import { AppContext, useAppContext } from "./state/AppContext";
import { Shell } from "./components/Shell/Shell";
import { BoardSelector } from "./components/BoardSelector/BoardSelector";
import { Grid } from "./components/Grid/Grid";
import { Gantt } from "./components/Gantt/Gantt";
import { SplitPane } from "./components/SplitPane/SplitPane";
import { LoadingOverlay } from "./components/common/LoadingOverlay";
import { useScrollSync } from "./hooks/useScrollSync";
import { useMondaySync } from "./hooks/useMondaySync";
import { useUndoStack } from "./hooks/useUndoStack";
import { logger } from "./services/logger";
import styles from "./App.module.css";

/**
 * Inner component that lives inside AppContext.Provider,
 * so hooks like useMondaySync can access context safely.
 */
function AppInner(): React.JSX.Element {
  const { state } = useAppContext();
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const ganttScrollRef = useRef<HTMLDivElement>(null);

  const boardLoaded = state.tasks.length > 0;
  useScrollSync(gridScrollRef, ganttScrollRef, boardLoaded);
  useMondaySync();

  useEffect(() => {
    document.documentElement.dataset["theme"] = state.theme;
  }, [state.theme]);

  function renderContent(): React.JSX.Element {
    if (state.connection.status !== "connected") {
      return (
        <div className={styles.welcome}>
          <h2 className={styles.welcomeTitle}>Welcome to monday-project</h2>
          <p className={styles.welcomeText}>
            Click the <strong>&#x2699; Settings</strong> button in the toolbar
            to enter your monday.com API token and connect.
          </p>
        </div>
      );
    }

    if (!state.activeBoardId) {
      return <BoardSelector />;
    }

    if (state.tasks.length === 0) {
      return <LoadingOverlay message="Loading board data&#x2026;" />;
    }

    return (
      <SplitPane
        left={<Grid scrollContainerRef={gridScrollRef} />}
        right={<Gantt scrollContainerRef={ganttScrollRef} />}
      />
    );
  }

  return <Shell>{renderContent()}</Shell>;
}

function App(): React.JSX.Element {
  const [state, rawDispatch] = useReducer(appReducer, initialState);
  const dispatch = useUndoStack(rawDispatch);

  // Bridge logger → reducer so service-layer logs appear in the Log Drawer
  const bridgeLog = useCallback(function bridgeLog(entry: { id: string; level: "info" | "warn" | "error"; message: string; timestamp: number; details?: unknown }): void {
    rawDispatch({ type: "LOG_ADDED", entry });
  }, [rawDispatch]);

  useEffect(() => {
    logger.setDispatch(bridgeLog);
  }, [bridgeLog]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <AppInner />
    </AppContext.Provider>
  );
}

export default App;
