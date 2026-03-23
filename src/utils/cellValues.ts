/** @module Cell value reading and formatting utilities for the Grid */

import type { Task, Column } from "../types";
import { diffDays } from "./dateUtils";

/**
 * Reads the display value for a cell from a task, based on the column definition.
 * Handles the mapping between monday.com column IDs and top-level Task fields.
 */
export function getCellValue(
  task: Task,
  column: Column,
  displayIds: Map<string, string>,
): unknown {
  if (column.key === "_rowNum") return displayIds.get(task.id) ?? "";
  if (column.key === "_name") return task.name;

  // Computed duration: if a column's label contains "duration" and the task has dates, compute it
  if (/\bduration\b/i.test(column.label) && task.start && task.end) {
    const days = diffDays(task.start, task.end);
    return days >= 0 ? days + 1 : 0; // inclusive day count
  }

  // Non-special columns are stored in extras by the dataMapper
  if (column.key in task.extras) return task.extras[column.key];

  // Special columns: the dataMapper extracted these to top-level Task fields
  switch (column.mondayColType) {
    case "status":
      return task.status;
    case "timeline":
      return task.start && task.end ? `${task.start} \u2192 ${task.end}` : (task.start ?? task.end ?? "");
    case "date":
      return inferDateFieldValue(task, column);
    case "people":
      return task.personIds;
    case "dependency":
    case "board_relation":
      return task.predecessors;
    case "numbers":
      return task.pct;
    default:
      return "";
  }
}

/**
 * Returns the reducer field key for a column, so TASK_FIELD_UPDATED
 * updates the correct field on the Task object.
 */
export function getFieldKeyForColumn(task: Task, column: Column): string {
  if (column.key === "_name") return "name";
  if (column.key in task.extras) return column.key;

  switch (column.mondayColType) {
    case "status":
      return "status";
    case "people":
      return "personIds";
    case "dependency":
    case "board_relation":
      return "predecessors";
    case "numbers":
      return "pct";
    case "timeline":
      return "start"; // DateEditor handles start/end pair for timelines
    case "date":
      return inferDateRole(column.label) === "end" ? "end" : "start";
    default:
      return column.key;
  }
}

/**
 * Formats a cell value for read-only display.
 */
export function formatCellDisplay(
  value: unknown,
  column: Column,
  userDirectory: Map<string, { id: string; name: string; email: string }>,
): string {
  if (value === null || value === undefined || value === "") return "";

  if (column.editorType === "people" && Array.isArray(value)) {
    return value
      .map((id: unknown) => {
        const user = userDirectory.get(String(id));
        return user ? user.name : String(id);
      })
      .join(", ");
  }

  if ((column.mondayColType === "dependency" || column.mondayColType === "board_relation") && Array.isArray(value)) {
    return value.map((id: unknown) => String(id).replace("task-", "")).join(", ");
  }

  if (typeof value === "number") return String(value);

  return String(value);
}

// --- Helpers ---

function inferDateRole(label: string): "start" | "end" {
  const lower = label.toLowerCase();
  if (/\b(end|due|finish|deadline|to)\b/.test(lower)) return "end";
  return "start";
}

function inferDateFieldValue(task: Task, column: Column): string | null {
  const role = inferDateRole(column.label);
  return role === "end" ? task.end : task.start;
}
