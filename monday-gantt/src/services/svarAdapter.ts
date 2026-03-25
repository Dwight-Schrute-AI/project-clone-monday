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
 *
 * SVAR data format (from their demos):
 * - Regular tasks: { id, text, start: Date, duration: number, progress, parent, type: "task" }
 * - Summary tasks: { id, text, progress, parent: 0, type: "summary", open: true }
 *   (NO start/duration — SVAR computes from children)
 * - Milestones: { id, text, start: Date, progress, parent, type: "milestone" }
 *   (NO duration)
 * - Links: { id, source, target, type: "e2s" }
 */
export function tasksToSvar(appTasks: Task[]): {
  tasks: Array<Record<string, unknown>>;
  links: SvarLink[];
} {
  const svarTasks: Array<Record<string, unknown>> = [];
  const svarLinks: SvarLink[] = [];
  let linkId = 1;

  // First pass: assign numeric IDs
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

  // Determine which non-group tasks have children (subitems)
  const parentIdsWithChildren = new Set<string>();
  for (let i = 0; i < appTasks.length; i++) {
    const t = appTasks[i]!;
    if (t.isSubitem) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = appTasks[j]!;
        if (!prev.isSubitem && !prev.isGroupRow) {
          parentIdsWithChildren.add(prev.id);
          break;
        }
      }
    }
  }

  // Track current parent item for subitems
  let currentParentNumId = 0;

  for (const t of appTasks) {
    const numId = toNumericId(t.id);

    if (t.isGroupRow) {
      // Summary task at root — no start/duration, SVAR computes from children
      svarTasks.push({
        id: numId,
        text: t.name,
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

    // Parent items with subitems → summary (SVAR computes dates from children)
    if (parentIdsWithChildren.has(t.id)) {
      svarTasks.push({
        id: numId,
        text: t.name,
        progress: t.pct,
        parent: parentId,
        type: "summary",
        open: true,
      });
    } else if (!effectiveStart) {
      // No dates at all — milestone at today
      svarTasks.push({
        id: numId,
        text: t.name,
        start: new Date(),
        progress: t.pct,
        parent: parentId,
        type: "milestone",
      });
    } else if (!effectiveEnd || effectiveStart === effectiveEnd) {
      // Single date — milestone
      svarTasks.push({
        id: numId,
        text: t.name,
        start: toDate(effectiveStart),
        progress: t.pct,
        parent: parentId,
        type: "milestone",
      });
    } else {
      // Normal task with start + duration
      svarTasks.push({
        id: numId,
        text: t.name,
        start: toDate(effectiveStart),
        duration: daysBetween(effectiveStart, effectiveEnd),
        progress: t.pct,
        parent: parentId,
        type: "task",
      });
    }

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
  svarTask: { id: number; start?: Date; end?: Date; text?: string; progress?: number; duration?: number },
): { appTaskId: string; fields: Array<{ key: string; value: unknown }> } | null {
  const appId = toAppId(svarTask.id);
  if (!appId) return null;

  const fields: Array<{ key: string; value: unknown }> = [];

  if (svarTask.text !== undefined) {
    fields.push({ key: "name", value: svarTask.text });
  }
  if (svarTask.start !== undefined) {
    fields.push({ key: "start", value: fmtDate(svarTask.start) });
    // If duration changed, compute new end date
    if (svarTask.duration !== undefined) {
      const end = new Date(svarTask.start);
      end.setDate(end.getDate() + svarTask.duration);
      fields.push({ key: "end", value: fmtDate(end) });
    }
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
