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
/**
 * Find the column key for "Department" (or similar label) in the column list.
 */
export function findDepartmentColKey(columns: AppState["columns"]): string | null {
  const col = columns.find((c) => /\bdepartment\b/i.test(c.label));
  return col ? col.key : null;
}

/**
 * Get the department value for a task given the department column key.
 */
function getTaskDepartment(task: Task, deptColKey: string | null): string {
  if (!deptColKey) return "";
  const val = task.extras[deptColKey];
  return typeof val === "string" ? val : "";
}

/**
 * Collect unique department values from all tasks.
 */
export function selectDepartments(state: AppState): string[] {
  const deptKey = findDepartmentColKey(state.columns);
  if (!deptKey) return [];
  const set = new Set<string>();
  for (const t of state.tasks) {
    if (t.isGroupRow || t.isSubitem) continue;
    const val = getTaskDepartment(t, deptKey);
    if (val) set.add(val);
  }
  return Array.from(set).sort();
}

export function selectVisibleTasks(state: AppState): Task[] {
  const { collapsedGroups, collapsedItems, departmentFilter } = state;
  const deptKey = departmentFilter ? findDepartmentColKey(state.columns) : null;

  const result: Task[] = [];
  let currentParentId: string | null = null;
  let parentVisible = true;

  for (const task of state.tasks) {
    if (task.isGroupRow) {
      currentParentId = null;
      parentVisible = true;
      result.push(task);
      continue;
    }

    // If the group is collapsed, hide all non-group rows in it
    if (collapsedGroups.has(task.groupId)) {
      continue;
    }

    if (!task.isSubitem) {
      currentParentId = task.id;

      // Department filter: hide parent items not matching
      if (departmentFilter && deptKey) {
        const dept = getTaskDepartment(task, deptKey);
        if (dept && dept !== departmentFilter) {
          parentVisible = false;
          continue;
        }
      }
      parentVisible = true;
      result.push(task);
      continue;
    }

    // Subitem: hide if parent is collapsed or filtered out
    if (!parentVisible) continue;
    if (currentParentId && collapsedItems.has(currentParentId)) {
      continue;
    }

    result.push(task);
  }

  // Remove empty group headers (groups where all items were filtered out)
  if (departmentFilter && deptKey) {
    return removeEmptyGroups(result);
  }

  return result;
}

function removeEmptyGroups(tasks: Task[]): Task[] {
  // Mark groups that have at least one non-group child
  const groupsWithItems = new Set<string>();
  for (const t of tasks) {
    if (!t.isGroupRow) groupsWithItems.add(t.groupId);
  }
  return tasks.filter((t) => !t.isGroupRow || groupsWithItems.has(t.groupId));
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
