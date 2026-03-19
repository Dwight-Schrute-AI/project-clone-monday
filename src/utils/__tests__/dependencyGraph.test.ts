import { describe, it, expect } from "vitest";
import {
  buildDependencyGraph,
  topologicalSort,
  cascadeDependencies,
} from "../dependencyGraph";
import type { Task } from "../../types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    mondayId: "1001",
    mondayBoardId: "board1",
    name: "Task",
    start: "2026-03-01",
    end: "2026-03-05",
    pct: 0,
    status: "",
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

describe("buildDependencyGraph", () => {
  it("builds forward adjacency list from predecessors", () => {
    const tasks = [
      makeTask({ id: "A", predecessors: [] }),
      makeTask({ id: "B", predecessors: ["A"] }),
      makeTask({ id: "C", predecessors: ["A"] }),
    ];
    const graph = buildDependencyGraph(tasks);
    expect(graph.get("A")).toEqual(["B", "C"]);
    expect(graph.has("B")).toBe(false);
    expect(graph.has("C")).toBe(false);
  });

  it("handles fan-in (multiple predecessors)", () => {
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B" }),
      makeTask({ id: "C", predecessors: ["A", "B"] }),
    ];
    const graph = buildDependencyGraph(tasks);
    expect(graph.get("A")).toEqual(["C"]);
    expect(graph.get("B")).toEqual(["C"]);
  });

  it("returns empty map when no dependencies", () => {
    const tasks = [makeTask({ id: "A" }), makeTask({ id: "B" })];
    const graph = buildDependencyGraph(tasks);
    expect(graph.size).toBe(0);
  });
});

describe("topologicalSort", () => {
  it("returns nodes in dependency order", () => {
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B", predecessors: ["A"] }),
      makeTask({ id: "C", predecessors: ["B"] }),
    ];
    const graph = buildDependencyGraph(tasks);
    const sorted = topologicalSort(graph, tasks, ["A"]);
    const idxA = sorted.indexOf("A");
    const idxB = sorted.indexOf("B");
    const idxC = sorted.indexOf("C");
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("omits nodes involved in cycles", () => {
    const tasks = [
      makeTask({ id: "A", predecessors: ["C"] }),
      makeTask({ id: "B", predecessors: ["A"] }),
      makeTask({ id: "C", predecessors: ["B"] }),
    ];
    const graph = buildDependencyGraph(tasks);
    const sorted = topologicalSort(graph, tasks, ["A"]);
    // All three form a cycle — none should appear
    expect(sorted).toEqual([]);
  });

  it("handles partial cycles (some nodes reachable, some cycled)", () => {
    // A → B → C → B (cycle between B and C), A has no predecessors
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B", predecessors: ["A", "C"] }),
      makeTask({ id: "C", predecessors: ["B"] }),
    ];
    const graph = buildDependencyGraph(tasks);
    const sorted = topologicalSort(graph, tasks, ["A"]);
    // A should appear (no cycle), B and C are cycled
    expect(sorted).toContain("A");
    expect(sorted).not.toContain("B");
    expect(sorted).not.toContain("C");
  });
});

describe("cascadeDependencies", () => {
  it("returns empty for non-date field changes", () => {
    const tasks = [
      makeTask({ id: "A" }),
      makeTask({ id: "B", predecessors: ["A"] }),
    ];
    expect(cascadeDependencies(tasks, "A", "name")).toEqual([]);
    expect(cascadeDependencies(tasks, "A", "status")).toEqual([]);
    expect(cascadeDependencies(tasks, "A", "pct")).toEqual([]);
  });

  it("shifts successor when predecessor end moves past successor start", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: "2026-03-05", end: "2026-03-09", predecessors: ["A"] }),
    ];
    // A's end is 03-10, B's start is 03-05. B should shift to start on 03-11.
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.taskId).toBe("B");
    expect(updates[0]?.start).toBe("2026-03-11");
    // B had 4-day duration (03-05 to 03-09), preserve it
    expect(updates[0]?.end).toBe("2026-03-15");
    expect(updates[0]?.previousStart).toBe("2026-03-05");
    expect(updates[0]?.previousEnd).toBe("2026-03-09");
  });

  it("preserves task duration when shifting", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-15" }),
      makeTask({ id: "B", start: "2026-03-10", end: "2026-03-20", predecessors: ["A"] }),
    ];
    // B has 10-day duration. A ends 03-15, so B should start 03-16, end 03-26.
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.start).toBe("2026-03-16");
    expect(updates[0]?.end).toBe("2026-03-26");
  });

  it("does not shift when successor already starts after predecessor end", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-05" }),
      makeTask({ id: "B", start: "2026-03-10", end: "2026-03-15", predecessors: ["A"] }),
    ];
    // B starts well after A ends — no shift needed
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toEqual([]);
  });

  it("cascades through a chain: A → B → C", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: "2026-03-05", end: "2026-03-09", predecessors: ["A"] }),
      makeTask({ id: "C", start: "2026-03-08", end: "2026-03-12", predecessors: ["B"] }),
    ];
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toHaveLength(2);

    const bUpdate = updates.find((u) => u.taskId === "B");
    const cUpdate = updates.find((u) => u.taskId === "C");
    expect(bUpdate).toBeDefined();
    expect(cUpdate).toBeDefined();

    // B: shifts to start 03-11, duration 4 → end 03-15
    expect(bUpdate?.start).toBe("2026-03-11");
    expect(bUpdate?.end).toBe("2026-03-15");

    // C: B now ends 03-15, so C starts 03-16, duration 4 → end 03-20
    expect(cUpdate?.start).toBe("2026-03-16");
    expect(cUpdate?.end).toBe("2026-03-20");
  });

  it("handles fan-out: A → B, A → C", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: "2026-03-05", end: "2026-03-08", predecessors: ["A"] }),
      makeTask({ id: "C", start: "2026-03-07", end: "2026-03-12", predecessors: ["A"] }),
    ];
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toHaveLength(2);

    const bUpdate = updates.find((u) => u.taskId === "B");
    const cUpdate = updates.find((u) => u.taskId === "C");

    // B: start 03-11, duration 3 → end 03-14
    expect(bUpdate?.start).toBe("2026-03-11");
    expect(bUpdate?.end).toBe("2026-03-14");

    // C: start 03-11, duration 5 → end 03-16
    expect(cUpdate?.start).toBe("2026-03-11");
    expect(cUpdate?.end).toBe("2026-03-16");
  });

  it("handles fan-in: A → C, B → C (uses latest predecessor end)", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: "2026-03-01", end: "2026-03-15" }),
      makeTask({ id: "C", start: "2026-03-05", end: "2026-03-09", predecessors: ["A", "B"] }),
    ];
    // B ends later (03-15), so C should start at 03-16
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.taskId).toBe("C");
    expect(updates[0]?.start).toBe("2026-03-16");
  });

  it("skips tasks with null dates", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: null, end: null, predecessors: ["A"] }),
    ];
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toEqual([]);
  });

  it("returns empty when changed task has no successors", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: "2026-03-05", end: "2026-03-09" }),
    ];
    const updates = cascadeDependencies(tasks, "A", "end");
    expect(updates).toEqual([]);
  });

  it("handles start field changes", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10" }),
      makeTask({ id: "B", start: "2026-03-05", end: "2026-03-09", predecessors: ["A"] }),
    ];
    // Changing "start" should also trigger cascade (end date in task already reflects new dates)
    const updates = cascadeDependencies(tasks, "A", "start");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.taskId).toBe("B");
  });

  it("does not cascade cycled nodes", () => {
    const tasks = [
      makeTask({ id: "A", start: "2026-03-01", end: "2026-03-10", predecessors: ["C"] }),
      makeTask({ id: "B", start: "2026-03-05", end: "2026-03-09", predecessors: ["A"] }),
      makeTask({ id: "C", start: "2026-03-08", end: "2026-03-12", predecessors: ["B"] }),
    ];
    // A→B→C→A is a cycle — cascadeDependencies should not loop infinitely
    const updates = cascadeDependencies(tasks, "A", "end");
    // Cycled nodes are omitted from topological sort, so no updates
    expect(updates).toEqual([]);
  });
});
