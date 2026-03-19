/** @module AppState, Action discriminated union, and related types */

import type { Task } from "./task";
import type { Column } from "./column";

export interface PendingWrite {
  fieldKey: string;
  value: unknown;
  previousValue: unknown;
  timestamp: number;
}

export interface AppState {
  tasks: Task[];
  columns: Column[];
  connection: {
    status: "disconnected" | "connecting" | "connected" | "error";
    token: string | null;
    userId: string | null;
    userName: string | null;
    error: string | null;
  };
  boards: Array<{ id: string; name: string; workspaceName: string }>;
  activeBoardId: string | null;
  userDirectory: Map<string, { id: string; name: string; email: string }>;
  theme: "light" | "dark";
  pendingWrites: Map<string, PendingWrite>;
  log: LogEntry[];
}

export interface LogEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: number;
  details?: unknown;
}

export type AppAction =
  | { type: "CONNECTION_START" }
  | { type: "CONNECTION_SUCCESS"; userId: string; userName: string; token: string }
  | { type: "CONNECTION_FAILED"; error: string }
  | { type: "BOARDS_LOADED"; boards: AppState["boards"] }
  | { type: "BOARD_DATA_LOADED"; tasks: Task[]; columns: Column[]; boardId: string }
  | { type: "USERS_LOADED"; userDirectory: AppState["userDirectory"] }
  | { type: "TASK_FIELD_UPDATED"; taskId: string; fieldKey: string; value: unknown; previousValue: unknown }
  | { type: "TASKS_BATCH_UPDATED"; updates: Array<{ taskId: string; fields: Partial<Task> }> }
  | { type: "WRITE_CONFIRMED"; taskId: string; fieldKey: string }
  | { type: "WRITE_FAILED"; taskId: string; fieldKey: string; previousValue: unknown; error: string }
  | { type: "TASK_CREATED"; task: Task }
  | { type: "TASK_DELETED"; taskId: string }
  | { type: "THEME_TOGGLED" }
  | { type: "LOG_ADDED"; entry: LogEntry };
