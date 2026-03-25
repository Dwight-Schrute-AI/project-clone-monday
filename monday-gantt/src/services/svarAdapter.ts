/** @module Adapter: converts our monday.com Task model to SVAR Gantt data format */

import type { Task } from "../types";

/** SVAR Gantt task shape */
export interface SvarTask {
  id: number;
  text: string;
  start: Date;
  end: Date;
  duration: number;
  progress: number;
  parent: number;
  type: "task" | "summary" | "milestone";
  open: boolean;
  /** Original app task ID for reverse lookups */
  _appId: string;
  /** monday.com group color */
  _groupColor?: string;
  /** Whether this is a subitem */
  _isSubitem?: boolean;
}

/** SVAR Gantt link (dependency) shape */
export interface SvarLink {
  id: number;
  source: number;
  target: number;
  type: "e2s" | "s2s" | "s2e" | "e2e";
}

// Stable numeric ID mapping: app task ID string → numeric ID for SVAR
const idMap = new Map<string, number>();
let nextId = 1;

function toNumericId(appId: string): number {
  let n = idMap.get(appId);
  if (n !== undefined) return n;
  n = nextId++;
  idMap.set(appId, n);
  return n;
}

/** Clear the ID map (call when switching boards) */
export function resetIdMap(): void {
  idMap.clear();
  nextId = 1;
}

/** Reverse lookup: numeric SVAR ID → app task ID string */
export function toAppId(numericId: number): string | undefined {
  for (const [appId, n] of idMap) {
    if (n === numericId) return appId;
  }
  return undefined;
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
 * Group rows become summary tasks; regular tasks become children.
 */
export function tasksToSvar(appTasks: Task[]): { tasks: SvarTask[]; links: SvarLink[] } {
  const svarTasks: SvarTask[] = [];
  const svarLinks: SvarLink[] = [];
  let linkId = 1;

  // First pass: assign numeric IDs to all tasks
  for (const t of appTasks) {
    toNumericId(t.id);
  }

  // Map group IDs to their numeric SVAR IDs
  const groupNumericIds = new Map<string, number>();
  for (const t of appTasks) {
    if (t.isGroupRow) {
      groupNumericIds.set(t.groupId, toNumericId(t.id));
    }
  }

  // Track parent item IDs for subitems
  let currentParentNumId = 0;

  for (const t of appTasks) {
    const numId = toNumericId(t.id);

    if (t.isGroupRow) {
      // Group → summary task at root level
      const groupColor = typeof t.extras["_groupColor"] === "string"
        ? t.extras["_groupColor"] : undefined;

      svarTasks.push({
        id: numId,
        text: t.name,
        start: t.start ? toDate(t.start) : new Date(),
        end: t.end ? toDate(t.end) : new Date(),
        duration: 0, // SVAR computes this for summary tasks
        progress: 0,
        parent: 0, // root level
        type: "summary",
        open: true,
        _appId: t.id,
        _groupColor: groupColor,
      });
      currentParentNumId = 0;
      continue;
    }

    const effectiveStart = t.start ?? t.end;
    const effectiveEnd = t.end ?? t.start;

    // Determine parent: subitems nest under parent task, regular tasks under group
    let parentId = groupNumericIds.get(t.groupId) ?? 0;
    if (t.isSubitem && currentParentNumId > 0) {
      parentId = currentParentNumId;
    }

    if (!t.isSubitem) {
      currentParentNumId = numId;
    }

    const isMilestone = !effectiveStart || !effectiveEnd ||
      (effectiveStart === effectiveEnd);

    svarTasks.push({
      id: numId,
      text: t.name,
      start: effectiveStart ? toDate(effectiveStart) : new Date(),
      end: effectiveEnd ? toDate(effectiveEnd) : new Date(),
      duration: effectiveStart && effectiveEnd ? daysBetween(effectiveStart, effectiveEnd) : 1,
      progress: t.pct,
      parent: parentId,
      type: isMilestone ? "milestone" : "task",
      open: true,
      _appId: t.id,
      _isSubitem: t.isSubitem,
    });

    // Convert predecessors to links
    for (const predAppId of t.predecessors) {
      const sourceNum = idMap.get(predAppId);
      if (sourceNum !== undefined) {
        svarLinks.push({
          id: linkId++,
          source: sourceNum,
          target: numId,
          type: "e2s", // Finish-to-Start
        });
      }
    }
  }

  return { tasks: svarTasks, links: svarLinks };
}

/**
 * Convert a SVAR task update back to our app field changes.
 * Returns {taskId, fields} for dispatching to the reducer.
 */
export function svarUpdateToApp(
  svarTask: Partial<SvarTask> & { id: number },
): { appTaskId: string; fields: Array<{ key: string; value: unknown }> } | null {
  const appId = toAppId(svarTask.id);
  if (!appId) return null;

  const fields: Array<{ key: string; value: unknown }> = [];

  if (svarTask.text !== undefined) {
    fields.push({ key: "name", value: svarTask.text });
  }
  if (svarTask.start !== undefined) {
    fields.push({ key: "start", value: formatDate(svarTask.start) });
  }
  if (svarTask.end !== undefined) {
    fields.push({ key: "end", value: formatDate(svarTask.end) });
  }
  if (svarTask.progress !== undefined) {
    fields.push({ key: "pct", value: svarTask.progress });
  }

  return { appTaskId: appId, fields };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
