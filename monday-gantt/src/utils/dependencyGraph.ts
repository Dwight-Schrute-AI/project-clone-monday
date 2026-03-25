/** @module Dependency graph: build, topological sort, and cascade date changes */

import type { Task } from "../types";
import { diffDays, addDays } from "./dateUtils";

export interface CascadeUpdate {
  taskId: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
}

/**
 * Builds a forward adjacency list: predecessorId → successorIds[].
 * Each edge represents a Finish-to-Start dependency.
 */
export function buildDependencyGraph(tasks: Task[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const task of tasks) {
    for (const predId of task.predecessors) {
      const existing = graph.get(predId);
      if (existing) {
        existing.push(task.id);
      } else {
        graph.set(predId, [task.id]);
      }
    }
  }
  return graph;
}

/**
 * Topological sort via Kahn's algorithm over the subgraph reachable from `startIds`.
 * Returns task IDs in dependency order. Nodes involved in cycles are omitted.
 */
export function topologicalSort(
  graph: Map<string, string[]>,
  tasks: Task[],
  startIds: string[],
): string[] {
  // Collect all reachable nodes from startIds
  const reachable = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const successors = graph.get(id);
    if (successors) {
      for (const s of successors) {
        queue.push(s);
      }
    }
  }

  if (reachable.size === 0) return [];

  // Build in-degree map for reachable nodes only
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  for (const id of reachable) {
    inDegree.set(id, 0);
  }
  for (const id of reachable) {
    const task = taskMap.get(id);
    if (!task) continue;
    for (const predId of task.predecessors) {
      if (reachable.has(predId)) {
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const sorted: string[] = [];
  const ready: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) ready.push(id);
  }

  while (ready.length > 0) {
    const id = ready.pop()!;
    sorted.push(id);
    const successors = graph.get(id);
    if (!successors) continue;
    for (const s of successors) {
      if (!reachable.has(s)) continue;
      const newDeg = (inDegree.get(s) ?? 1) - 1;
      inDegree.set(s, newDeg);
      if (newDeg === 0) ready.push(s);
    }
  }

  // Nodes with remaining in-degree > 0 are in cycles — omitted from result
  return sorted;
}

/**
 * Computes cascading date changes for downstream tasks when a task's
 * start or end date is modified. Uses Finish-to-Start semantics:
 * each successor's start must be >= predecessor's end + 1 day.
 *
 * Returns only tasks whose dates actually changed.
 */
export function cascadeDependencies(
  tasks: Task[],
  changedTaskId: string,
  fieldKey: string,
): CascadeUpdate[] {
  if (fieldKey !== "start" && fieldKey !== "end") return [];

  const graph = buildDependencyGraph(tasks);
  const directSuccessors = graph.get(changedTaskId) ?? [];
  if (directSuccessors.length === 0) return [];

  const sorted = topologicalSort(graph, tasks, [changedTaskId]);
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // Track current dates as we cascade (may shift from original)
  const currentDates = new Map<string, { start: string; end: string }>();
  for (const t of tasks) {
    if (t.start && t.end) {
      currentDates.set(t.id, { start: t.start, end: t.end });
    }
  }

  const updates: CascadeUpdate[] = [];

  for (const id of sorted) {
    // Skip the changed task itself — it's already updated
    if (id === changedTaskId) continue;

    const task = taskMap.get(id);
    if (!task || !task.start || !task.end) continue;

    // Find the latest predecessor end date
    let latestPredEnd: string | null = null;
    for (const predId of task.predecessors) {
      const predDates = currentDates.get(predId);
      if (!predDates) continue;
      if (!latestPredEnd || diffDays(latestPredEnd, predDates.end) > 0) {
        latestPredEnd = predDates.end;
      }
    }

    if (!latestPredEnd) continue;

    // Successor start must be at least predEnd + 1 day
    const requiredStart = addDays(latestPredEnd, 1);
    const currentStart = currentDates.get(id)?.start ?? task.start;

    if (diffDays(requiredStart, currentStart) >= 0) {
      // Successor already starts on or after required date — no shift needed
      continue;
    }

    // Shift forward, preserving duration
    const duration = diffDays(task.start, task.end);
    const newStart = requiredStart;
    const newEnd = addDays(newStart, duration);

    updates.push({
      taskId: id,
      start: newStart,
      end: newEnd,
      previousStart: task.start,
      previousEnd: task.end,
    });

    // Update current dates for downstream cascade
    currentDates.set(id, { start: newStart, end: newEnd });
  }

  return updates;
}
