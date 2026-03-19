/** @module React Context for app state and dispatch — avoids prop drilling */

import { createContext, useContext } from "react";
import type { AppState, AppAction } from "../types";

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within an AppContext.Provider");
  }
  return ctx;
}
