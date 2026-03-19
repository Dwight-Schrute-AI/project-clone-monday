/** @module Top-level reducer: tasks, columns, connection, theme, pendingWrites, log */

import type { AppState, AppAction, LogEntry } from "../types";
import type { Task } from "../types";

/** Top-level Task fields that can be updated directly via TASK_FIELD_UPDATED */
const TOP_LEVEL_TASK_FIELDS: ReadonlySet<string> = new Set([
  "name",
  "start",
  "end",
  "pct",
  "status",
  "personIds",
  "predecessors",
]);

export const initialState: AppState = {
  tasks: [],
  columns: [],
  connection: {
    status: "disconnected",
    token: null,
    userId: null,
    userName: null,
    error: null,
  },
  boards: [],
  activeBoardId: null,
  userDirectory: new Map(),
  theme: "light",
  pendingWrites: new Map(),
  log: [],
};

function handleTaskFieldUpdated(
  state: AppState,
  action: Extract<AppAction, { type: "TASK_FIELD_UPDATED" }>,
): AppState {
  const { taskId, fieldKey, value, previousValue } = action;
  const existingTask = state.tasks.find((t) => t.id === taskId);
  if (!existingTask) return state;

  let updatedTask: Task;
  if (TOP_LEVEL_TASK_FIELDS.has(fieldKey)) {
    updatedTask = { ...existingTask, [fieldKey]: value };
  } else {
    updatedTask = {
      ...existingTask,
      extras: { ...existingTask.extras, [fieldKey]: value },
    };
  }

  const updatedTasks = state.tasks.map((t) =>
    t.id === taskId ? updatedTask : t,
  );

  const writeKey = `${taskId}:${fieldKey}`;
  const updatedPendingWrites = new Map(state.pendingWrites);
  updatedPendingWrites.set(writeKey, {
    fieldKey,
    value,
    previousValue,
    timestamp: Date.now(),
  });

  return { ...state, tasks: updatedTasks, pendingWrites: updatedPendingWrites };
}

function handleTasksBatchUpdated(
  state: AppState,
  action: Extract<AppAction, { type: "TASKS_BATCH_UPDATED" }>,
): AppState {
  const updateMap = new Map(
    action.updates.map((u) => [u.taskId, u.fields]),
  );
  const updatedTasks = state.tasks.map((task) => {
    const fields = updateMap.get(task.id);
    if (!fields) return task;
    return { ...task, ...fields };
  });
  return { ...state, tasks: updatedTasks };
}

function handleWriteConfirmed(
  state: AppState,
  action: Extract<AppAction, { type: "WRITE_CONFIRMED" }>,
): AppState {
  const writeKey = `${action.taskId}:${action.fieldKey}`;
  if (!state.pendingWrites.has(writeKey)) return state;
  const updated = new Map(state.pendingWrites);
  updated.delete(writeKey);
  return { ...state, pendingWrites: updated };
}

function handleWriteFailed(
  state: AppState,
  action: Extract<AppAction, { type: "WRITE_FAILED" }>,
): AppState {
  const { taskId, fieldKey, previousValue, error } = action;
  const writeKey = `${taskId}:${fieldKey}`;

  const updatedTasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    if (TOP_LEVEL_TASK_FIELDS.has(fieldKey)) {
      return { ...task, [fieldKey]: previousValue };
    }
    return {
      ...task,
      extras: { ...task.extras, [fieldKey]: previousValue },
    };
  });

  const updatedPendingWrites = new Map(state.pendingWrites);
  updatedPendingWrites.delete(writeKey);

  const logEntry: LogEntry = {
    id: `log-write-fail-${Date.now()}`,
    level: "error",
    message: `Write failed for task ${taskId}, field ${fieldKey}: ${error}`,
    timestamp: Date.now(),
    details: { taskId, fieldKey, error },
  };

  return {
    ...state,
    tasks: updatedTasks,
    pendingWrites: updatedPendingWrites,
    log: [...state.log, logEntry],
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "CONNECTION_START":
      return {
        ...state,
        connection: { ...state.connection, status: "connecting", error: null },
      };

    case "CONNECTION_SUCCESS":
      return {
        ...state,
        connection: {
          status: "connected",
          token: action.token,
          userId: action.userId,
          userName: action.userName,
          error: null,
        },
      };

    case "CONNECTION_FAILED":
      return {
        ...state,
        connection: { ...state.connection, status: "error", error: action.error },
      };

    case "BOARDS_LOADED":
      return { ...state, boards: action.boards };

    case "BOARD_DATA_LOADED":
      return {
        ...state,
        tasks: action.tasks,
        columns: action.columns,
        activeBoardId: action.boardId,
        pendingWrites: new Map(),
      };

    case "USERS_LOADED":
      return { ...state, userDirectory: action.userDirectory };

    case "TASK_FIELD_UPDATED":
      return handleTaskFieldUpdated(state, action);

    case "TASKS_BATCH_UPDATED":
      return handleTasksBatchUpdated(state, action);

    case "WRITE_CONFIRMED":
      return handleWriteConfirmed(state, action);

    case "WRITE_FAILED":
      return handleWriteFailed(state, action);

    case "TASK_CREATED":
      return { ...state, tasks: [...state.tasks, action.task] };

    case "TASK_DELETED":
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.taskId) };

    case "THEME_TOGGLED":
      return { ...state, theme: state.theme === "light" ? "dark" : "light" };

    case "LOG_ADDED":
      return { ...state, log: [...state.log, action.entry] };
  }

  const _exhaustive: never = action;
  return _exhaustive;
}
