/** @module Derived data selectors: visible tasks, row geometry, dependency graph, display IDs */

import type { AppState } from "../types";
import type { Task } from "../types";

export interface RowGeometry {
  taskId: string;
  y: number;
  height: number;
}

const ROW_HEIGHT = 36;
const GROUP_ROW_HEIGHT = 40;

/**
 * Returns tasks visible in the current view.
 * Filters out children of collapsed groups and subitems of collapsed parent items.
 * Group header rows remain visible even when collapsed (to allow re-expanding).
 * Parent item rows remain visible even when collapsed (to allow re-expanding).
 */
export function selectVisibleTasks(state: AppState): Task[] {
  const { collapsedGroups, collapsedItems } = state;
  if (collapsedGroups.size === 0 && collapsedItems.size === 0) {
    return state.tasks;
  }

  const result: Task[] = [];
  let currentParentId: string | null = null;

  for (const task of state.tasks) {
    // Group header rows are always visible
    if (task.isGroupRow) {
      currentParentId = null;
      result.push(task);
      continue;
    }

    // If the group is collapsed, hide all non-group rows in it
    if (collapsedGroups.has(task.groupId)) {
      continue;
    }

    // Track parent items for subitem collapse
    if (!task.isSubitem) {
      currentParentId = task.id;
      result.push(task);
      continue;
    }

    // Subitem: hide if parent is collapsed
    if (currentParentId && collapsedItems.has(currentParentId)) {
      continue;
    }

    result.push(task);
  }

  return result;
}

/**
 * Computes pixel y-offset and height for each visible row.
 * Group header rows are taller than regular task rows.
 */
export function selectRowGeometry(visibleTasks: Task[]): RowGeometry[] {
  const result: RowGeometry[] = [];
  let y = 0;
  for (const task of visibleTasks) {
    const height = task.isGroupRow ? GROUP_ROW_HEIGHT : ROW_HEIGHT;
    result.push({ taskId: task.id, y, height });
    y += height;
  }
  return result;
}

/**
 * Builds a forward adjacency list: predecessorId → successorIds[].
 * Used for rendering dependency arrows and cascading date changes.
 */
export function selectDependencyGraph(tasks: Task[]): Map<string, string[]> {
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
 * Computes hierarchical display IDs for visible tasks.
 * Group rows get empty string. Top-level tasks get sequential numbers.
 * Subitems get "parentNumber.childIndex" (e.g., "2.1", "2.2").
 */
export function selectDisplayIds(visibleTasks: Task[]): Map<string, string> {
  const result = new Map<string, string>();
  let topLevelCounter = 0;
  let subitemCounter = 0;
  let currentParentNumber = 0;

  for (const task of visibleTasks) {
    if (task.isGroupRow) {
      result.set(task.id, "");
      subitemCounter = 0;
      continue;
    }

    if (task.isSubitem) {
      subitemCounter++;
      result.set(task.id, `${String(currentParentNumber)}.${String(subitemCounter)}`);
    } else {
      topLevelCounter++;
      currentParentNumber = topLevelCounter;
      subitemCounter = 0;
      result.set(task.id, String(topLevelCounter));
    }
  }

  return result;
}
