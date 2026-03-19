/** @module App shell — auth, board selection, data loading */

import { useReducer, useEffect } from "react";
import { appReducer, initialState } from "./state/appReducer";
import { AppContext } from "./state/AppContext";
import { Shell } from "./components/Shell/Shell";
import { BoardSelector } from "./components/BoardSelector/BoardSelector";
import styles from "./App.module.css";

function App(): React.JSX.Element {
  const [state, dispatch] = useReducer(appReducer, initialState);

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

    return (
      <div className={styles.boardLoaded}>
        <h2 className={styles.boardLoadedTitle}>Board Loaded</h2>
        <p className={styles.boardLoadedText}>
          {String(state.tasks.filter((t) => !t.isGroupRow).length)} tasks,{" "}
          {String(state.columns.length)} columns
        </p>
        <p className={styles.boardLoadedHint}>
          Grid and Gantt views coming in next steps.
        </p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <Shell>{renderContent()}</Shell>
    </AppContext.Provider>
  );
}

export default App;
