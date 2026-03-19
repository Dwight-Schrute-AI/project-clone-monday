/** @module Action creators for the app reducer */

import type { AppAction, AppState, LogEntry } from "../types";
import type { Task, Column } from "../types";

export function connectionStart(): AppAction {
  return { type: "CONNECTION_START" };
}

export function connectionSuccess(
  userId: string,
  userName: string,
  token: string,
): AppAction {
  return { type: "CONNECTION_SUCCESS", userId, userName, token };
}

export function connectionFailed(error: string): AppAction {
  return { type: "CONNECTION_FAILED", error };
}

export function boardsLoaded(boards: AppState["boards"]): AppAction {
  return { type: "BOARDS_LOADED", boards };
}

export function boardDataLoaded(
  tasks: Task[],
  columns: Column[],
  boardId: string,
): AppAction {
  return { type: "BOARD_DATA_LOADED", tasks, columns, boardId };
}

export function usersLoaded(userDirectory: AppState["userDirectory"]): AppAction {
  return { type: "USERS_LOADED", userDirectory };
}

export function taskFieldUpdated(
  taskId: string,
  fieldKey: string,
  value: unknown,
  previousValue: unknown,
): AppAction {
  return { type: "TASK_FIELD_UPDATED", taskId, fieldKey, value, previousValue };
}

export function tasksBatchUpdated(
  updates: Array<{ taskId: string; fields: Partial<Task> }>,
): AppAction {
  return { type: "TASKS_BATCH_UPDATED", updates };
}

export function writeConfirmed(taskId: string, fieldKey: string): AppAction {
  return { type: "WRITE_CONFIRMED", taskId, fieldKey };
}

export function writeFailed(
  taskId: string,
  fieldKey: string,
  previousValue: unknown,
  error: string,
): AppAction {
  return { type: "WRITE_FAILED", taskId, fieldKey, previousValue, error };
}

export function taskCreated(task: Task): AppAction {
  return { type: "TASK_CREATED", task };
}

export function taskDeleted(taskId: string): AppAction {
  return { type: "TASK_DELETED", taskId };
}

export function themeToggled(): AppAction {
  return { type: "THEME_TOGGLED" };
}

export function logAdded(entry: LogEntry): AppAction {
  return { type: "LOG_ADDED", entry };
}
