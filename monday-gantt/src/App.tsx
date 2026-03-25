/** @module App — auth, board selection, SVAR Gantt view */

import { useReducer, useEffect, useCallback } from "react";
import { appReducer, initialState } from "./state/appReducer";
import { AppContext, useAppContext } from "./state/AppContext";
import { Shell } from "./components/Shell/Shell";
import { BoardSelector } from "./components/BoardSelector/BoardSelector";
import { GanttView } from "./components/GanttView/GanttView";
import { LoadingOverlay } from "./components/common/LoadingOverlay";
import { useMondaySync } from "./hooks/useMondaySync";
import { useUndoStack } from "./hooks/useUndoStack";
import { logger } from "./services/logger";
import "./reset.css";
import "./tokens.css";

function AppInner(): React.JSX.Element {
  const { state } = useAppContext();

  useMondaySync();

  useEffect(() => {
    document.documentElement.dataset["theme"] = state.theme;
  }, [state.theme]);

  function renderContent(): React.JSX.Element {
    if (state.connection.status !== "connected") {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
          <h2>Welcome to monday-project</h2>
          <p>Click the <strong>&#x2699; Settings</strong> button to connect your monday.com API token.</p>
        </div>
      );
    }

    if (!state.activeBoardId) {
      return <BoardSelector />;
    }

    if (state.tasks.length === 0) {
      return <LoadingOverlay message="Loading board data&#x2026;" />;
    }

    return <GanttView />;
  }

  return <Shell>{renderContent()}</Shell>;
}

function App(): React.JSX.Element {
  const [state, rawDispatch] = useReducer(appReducer, initialState);
  const dispatch = useUndoStack(rawDispatch);

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
