import { describe, it, expect } from "vitest";
import { appReducer, initialState } from "../appReducer";
import type { AppState } from "../../types";
import type { Task } from "../../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    mondayId: "1001",
    mondayBoardId: "board1",
    name: "Test Task",
    start: "2026-03-01",
    end: "2026-03-10",
    pct: 0,
    status: "Working on it",
    personIds: [],
    predecessors: [],
    indent: 0,
    groupId: "g1",
    mondayGroupId: "mg1",
    isGroupRow: false,
    isSubitem: false,
    extras: {},
    ...overrides,
  };
}

function stateWith(overrides: Partial<AppState> = {}): AppState {
  return { ...initialState, ...overrides };
}

describe("initialState", () => {
  it("has correct defaults", () => {
    expect(initialState.tasks).toEqual([]);
    expect(initialState.columns).toEqual([]);
    expect(initialState.connection.status).toBe("disconnected");
    expect(initialState.connection.token).toBeNull();
    expect(initialState.theme).toBe("light");
    expect(initialState.pendingWrites.size).toBe(0);
    expect(initialState.log).toEqual([]);
  });
});

describe("connection actions", () => {
  it("CONNECTION_START sets status to connecting and clears error", () => {
    const state = stateWith({
      connection: { ...initialState.connection, status: "error", error: "old" },
    });
    const next = appReducer(state, { type: "CONNECTION_START" });
    expect(next.connection.status).toBe("connecting");
    expect(next.connection.error).toBeNull();
  });

  it("CONNECTION_SUCCESS stores credentials", () => {
    const next = appReducer(initialState, {
      type: "CONNECTION_SUCCESS",
      userId: "u1",
      userName: "Alice",
      token: "tok123",
    });
    expect(next.connection.status).toBe("connected");
    expect(next.connection.userId).toBe("u1");
    expect(next.connection.userName).toBe("Alice");
    expect(next.connection.token).toBe("tok123");
    expect(next.connection.error).toBeNull();
  });

  it("CONNECTION_FAILED stores error", () => {
    const next = appReducer(initialState, {
      type: "CONNECTION_FAILED",
      error: "Invalid token",
    });
    expect(next.connection.status).toBe("error");
    expect(next.connection.error).toBe("Invalid token");
  });
});

describe("BOARDS_LOADED", () => {
  it("replaces boards array", () => {
    const boards = [{ id: "b1", name: "Board 1", workspaceName: "ws1" }];
    const next = appReducer(initialState, { type: "BOARDS_LOADED", boards });
    expect(next.boards).toEqual(boards);
  });
});

describe("BOARD_DATA_LOADED", () => {
  it("replaces tasks, columns, and sets activeBoardId", () => {
    const tasks = [makeTask()];
    const columns = [
      {
        key: "name",
        label: "Name",
        width: 200,
        editable: true,
        editorType: "text" as const,
        mondayColId: null,
        mondayColType: null,
        options: null,
        fixed: true,
      },
    ];
    const next = appReducer(initialState, {
      type: "BOARD_DATA_LOADED",
      tasks,
      columns,
      boardId: "b1",
    });
    expect(next.tasks).toEqual(tasks);
    expect(next.columns).toEqual(columns);
    expect(next.activeBoardId).toBe("b1");
  });
});

describe("USERS_LOADED", () => {
  it("stores user directory", () => {
    const userDirectory = new Map([
      ["u1", { id: "u1", name: "Alice", email: "alice@test.com" }],
    ]);
    const next = appReducer(initialState, { type: "USERS_LOADED", userDirectory });
    expect(next.userDirectory).toBe(userDirectory);
  });
});

describe("TASK_FIELD_UPDATED", () => {
  it("updates a top-level field and adds pendingWrite", () => {
    const task = makeTask({ id: "t1", name: "Old Name" });
    const state = stateWith({ tasks: [task] });

    const next = appReducer(state, {
      type: "TASK_FIELD_UPDATED",
      taskId: "t1",
      fieldKey: "name",
      value: "New Name",
      previousValue: "Old Name",
    });

    expect(next.tasks[0]?.name).toBe("New Name");
    expect(next.pendingWrites.has("t1:name")).toBe(true);
    const pw = next.pendingWrites.get("t1:name");
    expect(pw?.value).toBe("New Name");
    expect(pw?.previousValue).toBe("Old Name");
  });

  it("updates an extras field", () => {
    const task = makeTask({ id: "t1", extras: { budget: 100 } });
    const state = stateWith({ tasks: [task] });

    const next = appReducer(state, {
      type: "TASK_FIELD_UPDATED",
      taskId: "t1",
      fieldKey: "budget",
      value: 200,
      previousValue: 100,
    });

    expect(next.tasks[0]?.extras["budget"]).toBe(200);
  });

  it("returns same state for nonexistent task", () => {
    const state = stateWith({ tasks: [makeTask({ id: "t1" })] });
    const next = appReducer(state, {
      type: "TASK_FIELD_UPDATED",
      taskId: "t999",
      fieldKey: "name",
      value: "x",
      previousValue: "y",
    });
    expect(next).toBe(state);
  });
});

describe("TASKS_BATCH_UPDATED", () => {
  it("updates multiple tasks at once", () => {
    const state = stateWith({
      tasks: [
        makeTask({ id: "t1", name: "A" }),
        makeTask({ id: "t2", name: "B" }),
        makeTask({ id: "t3", name: "C" }),
      ],
    });

    const next = appReducer(state, {
      type: "TASKS_BATCH_UPDATED",
      updates: [
        { taskId: "t1", fields: { name: "A2" } },
        { taskId: "t3", fields: { name: "C2", pct: 50 } },
      ],
    });

    expect(next.tasks[0]?.name).toBe("A2");
    expect(next.tasks[1]?.name).toBe("B");
    expect(next.tasks[2]?.name).toBe("C2");
    expect(next.tasks[2]?.pct).toBe(50);
  });
});

describe("WRITE_CONFIRMED", () => {
  it("removes entry from pendingWrites", () => {
    const pw = new Map([
      ["t1:name", { fieldKey: "name", value: "x", previousValue: "y", timestamp: 1 }],
    ]);
    const state = stateWith({ pendingWrites: pw });

    const next = appReducer(state, {
      type: "WRITE_CONFIRMED",
      taskId: "t1",
      fieldKey: "name",
    });

    expect(next.pendingWrites.size).toBe(0);
  });

  it("returns same state if no matching write", () => {
    const state = stateWith();
    const next = appReducer(state, {
      type: "WRITE_CONFIRMED",
      taskId: "t1",
      fieldKey: "name",
    });
    expect(next).toBe(state);
  });
});

describe("WRITE_FAILED", () => {
  it("rolls back top-level field, removes pendingWrite, adds log entry", () => {
    const task = makeTask({ id: "t1", name: "Optimistic" });
    const pw = new Map([
      ["t1:name", { fieldKey: "name", value: "Optimistic", previousValue: "Original", timestamp: 1 }],
    ]);
    const state = stateWith({ tasks: [task], pendingWrites: pw });

    const next = appReducer(state, {
      type: "WRITE_FAILED",
      taskId: "t1",
      fieldKey: "name",
      previousValue: "Original",
      error: "API error",
    });

    expect(next.tasks[0]?.name).toBe("Original");
    expect(next.pendingWrites.size).toBe(0);
    expect(next.log).toHaveLength(1);
    expect(next.log[0]?.level).toBe("error");
    expect(next.log[0]?.message).toContain("API error");
  });

  it("rolls back extras field", () => {
    const task = makeTask({ id: "t1", extras: { budget: 999 } });
    const state = stateWith({ tasks: [task] });

    const next = appReducer(state, {
      type: "WRITE_FAILED",
      taskId: "t1",
      fieldKey: "budget",
      previousValue: 100,
      error: "fail",
    });

    expect(next.tasks[0]?.extras["budget"]).toBe(100);
  });
});

describe("TASK_CREATED", () => {
  it("appends task", () => {
    const task = makeTask({ id: "t2" });
    const state = stateWith({ tasks: [makeTask({ id: "t1" })] });
    const next = appReducer(state, { type: "TASK_CREATED", task });
    expect(next.tasks).toHaveLength(2);
    expect(next.tasks[1]?.id).toBe("t2");
  });
});

describe("TASK_DELETED", () => {
  it("removes task by id", () => {
    const state = stateWith({
      tasks: [makeTask({ id: "t1" }), makeTask({ id: "t2" })],
    });
    const next = appReducer(state, { type: "TASK_DELETED", taskId: "t1" });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0]?.id).toBe("t2");
  });
});

describe("THEME_TOGGLED", () => {
  it("flips light to dark", () => {
    const next = appReducer(initialState, { type: "THEME_TOGGLED" });
    expect(next.theme).toBe("dark");
  });

  it("flips dark to light", () => {
    const state = stateWith({ theme: "dark" });
    const next = appReducer(state, { type: "THEME_TOGGLED" });
    expect(next.theme).toBe("light");
  });
});

describe("LOG_ADDED", () => {
  it("appends log entry", () => {
    const entry = { id: "log1", level: "info" as const, message: "hello", timestamp: 1 };
    const next = appReducer(initialState, { type: "LOG_ADDED", entry });
    expect(next.log).toHaveLength(1);
    expect(next.log[0]).toEqual(entry);
  });
});

describe("immutability", () => {
  it("returns a new state reference for mutating actions", () => {
    const state = stateWith({ tasks: [makeTask()] });
    const next = appReducer(state, { type: "THEME_TOGGLED" });
    expect(next).not.toBe(state);
  });
});
