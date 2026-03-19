import { describe, it, expect } from "vitest";
import {
  selectVisibleTasks,
  selectRowGeometry,
  selectDependencyGraph,
  selectDisplayIds,
} from "../selectors";
import { initialState } from "../appReducer";
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

describe("selectVisibleTasks", () => {
  it("returns all tasks", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    const state = { ...initialState, tasks };
    expect(selectVisibleTasks(state)).toEqual(tasks);
  });

  it("returns empty for empty state", () => {
    expect(selectVisibleTasks(initialState)).toEqual([]);
  });
});

describe("selectRowGeometry", () => {
  it("returns empty array for no tasks", () => {
    expect(selectRowGeometry([])).toEqual([]);
  });

  it("computes correct heights and offsets for mixed rows", () => {
    const tasks = [
      makeTask({ id: "g1", isGroupRow: true }),
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
      makeTask({ id: "g2", isGroupRow: true }),
      makeTask({ id: "t3" }),
    ];
    const result = selectRowGeometry(tasks);

    expect(result).toEqual([
      { taskId: "g1", y: 0, height: 40 },
      { taskId: "t1", y: 40, height: 36 },
      { taskId: "t2", y: 76, height: 36 },
      { taskId: "g2", y: 112, height: 40 },
      { taskId: "t3", y: 152, height: 36 },
    ]);
  });
});

describe("selectDependencyGraph", () => {
  it("returns empty map for no dependencies", () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    const graph = selectDependencyGraph(tasks);
    expect(graph.size).toBe(0);
  });

  it("builds forward adjacency for a chain A→B→C", () => {
    const tasks = [
      makeTask({ id: "A", predecessors: [] }),
      makeTask({ id: "B", predecessors: ["A"] }),
      makeTask({ id: "C", predecessors: ["B"] }),
    ];
    const graph = selectDependencyGraph(tasks);
    expect(graph.get("A")).toEqual(["B"]);
    expect(graph.get("B")).toEqual(["C"]);
    expect(graph.has("C")).toBe(false);
  });

  it("handles fan-out: one predecessor with multiple successors", () => {
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B", predecessors: ["A"] }),
      makeTask({ id: "C", predecessors: ["A"] }),
      makeTask({ id: "D", predecessors: ["A"] }),
    ];
    const graph = selectDependencyGraph(tasks);
    expect(graph.get("A")).toEqual(["B", "C", "D"]);
  });

  it("handles fan-in: multiple predecessors for one task", () => {
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B" }),
      makeTask({ id: "C", predecessors: ["A", "B"] }),
    ];
    const graph = selectDependencyGraph(tasks);
    expect(graph.get("A")).toEqual(["C"]);
    expect(graph.get("B")).toEqual(["C"]);
  });
});

describe("selectDisplayIds", () => {
  it("returns empty map for empty input", () => {
    expect(selectDisplayIds([]).size).toBe(0);
  });

  it("numbers sequential top-level tasks", () => {
    const tasks = [
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
      makeTask({ id: "t3" }),
    ];
    const ids = selectDisplayIds(tasks);
    expect(ids.get("t1")).toBe("1");
    expect(ids.get("t2")).toBe("2");
    expect(ids.get("t3")).toBe("3");
  });

  it("assigns empty string to group rows", () => {
    const tasks = [
      makeTask({ id: "g1", isGroupRow: true }),
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
    ];
    const ids = selectDisplayIds(tasks);
    expect(ids.get("g1")).toBe("");
    expect(ids.get("t1")).toBe("1");
    expect(ids.get("t2")).toBe("2");
  });

  it("numbers subitems as parent.child", () => {
    const tasks = [
      makeTask({ id: "g1", isGroupRow: true }),
      makeTask({ id: "t1" }),
      makeTask({ id: "t2" }),
      makeTask({ id: "t2.1", isSubitem: true, indent: 1 }),
      makeTask({ id: "t2.2", isSubitem: true, indent: 1 }),
      makeTask({ id: "t3" }),
    ];
    const ids = selectDisplayIds(tasks);
    expect(ids.get("t1")).toBe("1");
    expect(ids.get("t2")).toBe("2");
    expect(ids.get("t2.1")).toBe("2.1");
    expect(ids.get("t2.2")).toBe("2.2");
    expect(ids.get("t3")).toBe("3");
  });

  it("continues numbering across groups", () => {
    const tasks = [
      makeTask({ id: "g1", isGroupRow: true }),
      makeTask({ id: "t1" }),
      makeTask({ id: "g2", isGroupRow: true }),
      makeTask({ id: "t2" }),
    ];
    const ids = selectDisplayIds(tasks);
    expect(ids.get("t1")).toBe("1");
    expect(ids.get("t2")).toBe("2");
  });
});
