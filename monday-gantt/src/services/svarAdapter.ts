/** @module Adapter: converts our monday.com Task model to SVAR Gantt data format */

import type { Task } from "../types";

export interface SvarLink {
  id: number;
  source: number;
  target: number;
  type: "e2s" | "s2s" | "s2e" | "e2e";
}

const idMap = new Map<string, number>();
const reverseMap = new Map<number, string>();
let nextId = 1;

function numId(appId: string): number {
  let n = idMap.get(appId);
  if (n !== undefined) return n;
  n = nextId++;
  idMap.set(appId, n);
  reverseMap.set(n, appId);
  return n;
}

export function resetIdMap(): void {
  idMap.clear();
  reverseMap.clear();
  nextId = 1;
}

export function toAppId(svarId: number): string | undefined {
  return reverseMap.get(svarId);
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function diffDays(a: string, b: string): number {
  return Math.max(1, Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000));
}

/**
 * Convert app Task[] → SVAR {tasks, links}.
 *
 * Strategy: NEVER use type:"summary" (it crashes if children are missing).
 * Instead, all tasks are type:"task" or type:"milestone".
 * Groups are represented as regular tasks spanning their date range.
 * Parent items with subitems are also regular tasks.
 * Only tasks WITH dates are included — dateless tasks are skipped.
 */
export function tasksToSvar(appTasks: Task[]): {
  tasks: Array<Record<string, unknown>>;
  links: SvarLink[];
} {
  const tasks: Array<Record<string, unknown>> = [];
  const links: SvarLink[] = [];
  let linkId = 1;

  // Assign numeric IDs to all tasks
  for (const t of appTasks) numId(t.id);

  // Collect group numeric IDs
  const groupNums = new Map<string, number>();
  for (const t of appTasks) {
    if (t.isGroupRow) groupNums.set(t.groupId, numId(t.id));
  }

  // Compute date ranges per group (for group summary bars)
  const groupRanges = new Map<string, { min: string; max: string }>();
  for (const t of appTasks) {
    if (t.isGroupRow) continue;
    const d1 = t.start;
    const d2 = t.end;
    const range = groupRanges.get(t.groupId);
    if (d1) {
      if (!range) groupRanges.set(t.groupId, { min: d1, max: d1 });
      else {
        if (d1 < range.min) range.min = d1;
        if (d1 > range.max) range.max = d1;
      }
    }
    if (d2) {
      if (!range) groupRanges.set(t.groupId, { min: d2, max: d2 });
      else {
        if (d2 < range.min) range.min = d2;
        if (d2 > range.max) range.max = d2;
      }
    }
  }

  let curParentNum = 0;

  for (const t of appTasks) {
    const id = numId(t.id);

    if (t.isGroupRow) {
      // Group → regular task spanning group date range
      const range = groupRanges.get(t.groupId);
      if (range) {
        tasks.push({
          id,
          text: t.name,
          start: toDate(range.min),
          duration: diffDays(range.min, range.max),
          progress: 0,
          parent: 0,
          type: "task",
          open: true,
        });
      }
      // Skip groups with no dated tasks
      curParentNum = 0;
      continue;
    }

    // Determine parent
    let parent = groupNums.get(t.groupId) ?? 0;
    if (t.isSubitem && curParentNum > 0) parent = curParentNum;
    if (!t.isSubitem) curParentNum = id;

    if (t.start && t.end && t.start !== t.end) {
      // Normal task with date range
      tasks.push({ id, text: t.name, start: toDate(t.start), duration: diffDays(t.start, t.end), progress: t.pct, parent, type: "task" });
    } else if (t.start || t.end) {
      // Single date → milestone
      tasks.push({ id, text: t.name, start: toDate((t.start ?? t.end)!), progress: t.pct, parent, type: "milestone" });
    } else {
      // No dates — skip
      continue;
    }

    // Dependencies → links
    for (const pred of t.predecessors) {
      const src = idMap.get(pred);
      if (src !== undefined) {
        links.push({ id: linkId++, source: src, target: id, type: "e2s" });
      }
    }
  }

  // Validate: remove any tasks whose parent doesn't exist in output
  const taskIds = new Set(tasks.map((t) => t["id"] as number));
  const validTasks = tasks.map((t) => {
    const p = t["parent"] as number;
    if (p !== 0 && !taskIds.has(p)) {
      return { ...t, parent: 0 }; // orphan → promote to root
    }
    return t;
  });

  return { tasks: validTasks, links };
}

/** Convert SVAR edit event back to app field updates */
export function svarChangeToApp(
  task: { id: number; start?: Date; duration?: number; text?: string; progress?: number },
): { appId: string; fields: Array<{ key: string; value: unknown }> } | null {
  const appId = toAppId(task.id);
  if (!appId) return null;

  const fields: Array<{ key: string; value: unknown }> = [];
  if (task.text !== undefined) fields.push({ key: "name", value: task.text });
  if (task.start !== undefined) {
    fields.push({ key: "start", value: fmt(task.start) });
    if (task.duration !== undefined) {
      const end = new Date(task.start);
      end.setDate(end.getDate() + task.duration);
      fields.push({ key: "end", value: fmt(end) });
    }
  }
  if (task.progress !== undefined) fields.push({ key: "pct", value: task.progress });
  return { appId, fields };
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
