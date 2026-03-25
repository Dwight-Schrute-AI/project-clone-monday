/** @module Adapter: converts our monday.com Task model to SVAR Gantt data format */

import type { Task } from "../types";

/** SVAR Gantt link (dependency) shape */
export interface SvarLink {
  id: number;
  source: number;
  target: number;
  type: "e2s" | "s2s" | "s2e" | "e2e";
}

// Stable numeric ID mapping: app task ID string → numeric ID for SVAR
const idMap = new Map<string, number>();
const reverseMap = new Map<number, string>();
let nextId = 1;

function toNumericId(appId: string): number {
  let n = idMap.get(appId);
  if (n !== undefined) return n;
  n = nextId++;
  idMap.set(appId, n);
  reverseMap.set(n, appId);
  return n;
}

/** Clear the ID map (call when switching boards) */
export function resetIdMap(): void {
  idMap.clear();
  reverseMap.clear();
  nextId = 1;
}

/** Reverse lookup: numeric SVAR ID → app task ID string */
export function toAppId(numericId: number): string | undefined {
  return reverseMap.get(numericId);
}

/** Parse ISO date string to Date object */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Compute duration in days between two ISO date strings */
function daysBetween(start: string, end: string): number {
  const s = toDate(start);
  const e = toDate(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000));
}

/**
 * Convert our Task[] to SVAR Gantt {tasks, links}.
 * Group rows become summary tasks; parent items with subitems also become summaries.
 * SVAR expects: { id, text, start, end, duration, progress, parent, type, open }
 * No extra properties — SVAR iterates task objects internally.
 */
export function tasksToSvar(appTasks: Task[]): {
  tasks: Array<Record<string, unknown>>;
  links: SvarLink[];
} {
  const svarTasks: Array<Record<string, unknown>> = [];
  const svarLinks: SvarLink[] = [];
  let linkId = 1;

  // First pass: assign numeric IDs and determine which parent items have children
  const parentIdsWithChildren = new Set<string>();
  for (const t of appTasks) {
    toNumericId(t.id);
    if (t.isSubitem) {
      // Find the preceding non-subitem, non-group task as the parent
      for (let i = appTasks.indexOf(t) - 1; i >= 0; i--) {
        const prev = appTasks[i]!;
        if (!prev.isSubitem && !prev.isGroupRow) {
          parentIdsWithChildren.add(prev.id);
          break;
        }
      }
    }
  }

  // Map group IDs to their numeric SVAR IDs
  const groupNumericIds = new Map<string, number>();
  for (const t of appTasks) {
    if (t.isGroupRow) {
      groupNumericIds.set(t.groupId, toNumericId(t.id));
    }
  }

  // Track current parent item for subitems
  let currentParentNumId = 0;

  for (const t of appTasks) {
    const numId = toNumericId(t.id);
    const now = new Date();

    if (t.isGroupRow) {
      // Group → summary task at root level
      svarTasks.push({
        id: numId,
        text: t.name,
        start: now,
        end: now,
        duration: 0,
        progress: 0,
        parent: 0,
        type: "summary",
        open: true,
      });
      currentParentNumId = 0;
      continue;
    }

    const effectiveStart = t.start ?? t.end;
    const effectiveEnd = t.end ?? t.start;

    // Determine parent
    let parentId = groupNumericIds.get(t.groupId) ?? 0;
    if (t.isSubitem && currentParentNumId > 0) {
      parentId = currentParentNumId;
    }

    if (!t.isSubitem) {
      currentParentNumId = numId;
    }

    // Determine type: parent items with subitems → summary, no dates → milestone
    let taskType: string = "task";
    if (parentIdsWithChildren.has(t.id)) {
      taskType = "summary";
    } else if (!effectiveStart || !effectiveEnd || effectiveStart === effectiveEnd) {
      taskType = "milestone";
    }

    svarTasks.push({
      id: numId,
      text: t.name,
      start: effectiveStart ? toDate(effectiveStart) : now,
      end: effectiveEnd ? toDate(effectiveEnd) : now,
      duration: effectiveStart && effectiveEnd ? daysBetween(effectiveStart, effectiveEnd) : 1,
      progress: t.pct,
      parent: parentId,
      type: taskType,
      open: true,
    });

    // Convert predecessors to links
    for (const predAppId of t.predecessors) {
      const sourceNum = idMap.get(predAppId);
      if (sourceNum !== undefined) {
        svarLinks.push({
          id: linkId++,
          source: sourceNum,
          target: numId,
          type: "e2s",
        });
      }
    }
  }

  return { tasks: svarTasks, links: svarLinks };
}

/**
 * Convert a SVAR task update back to our app field changes.
 */
export function svarUpdateToApp(
  svarTask: { id: number; start?: Date; end?: Date; text?: string; progress?: number },
): { appTaskId: string; fields: Array<{ key: string; value: unknown }> } | null {
  const appId = toAppId(svarTask.id);
  if (!appId) return null;

  const fields: Array<{ key: string; value: unknown }> = [];

  if (svarTask.text !== undefined) {
    fields.push({ key: "name", value: svarTask.text });
  }
  if (svarTask.start !== undefined) {
    fields.push({ key: "start", value: fmtDate(svarTask.start) });
  }
  if (svarTask.end !== undefined) {
    fields.push({ key: "end", value: fmtDate(svarTask.end) });
  }
  if (svarTask.progress !== undefined) {
    fields.push({ key: "pct", value: svarTask.progress });
  }

  return { appTaskId: appId, fields };
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
