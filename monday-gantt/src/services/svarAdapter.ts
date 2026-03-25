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
 * Skips tasks with no dates entirely (subitems without dates become noise).
 * Groups become summary rows. Dependencies become links.
 */
export function tasksToSvar(appTasks: Task[]): {
  tasks: Array<Record<string, unknown>>;
  links: SvarLink[];
} {
  const tasks: Array<Record<string, unknown>> = [];
  const links: SvarLink[] = [];
  let linkId = 1;

  // Assign numeric IDs to everything first
  for (const t of appTasks) numId(t.id);

  // Collect group numeric IDs
  const groupNums = new Map<string, number>();
  for (const t of appTasks) {
    if (t.isGroupRow) groupNums.set(t.groupId, numId(t.id));
  }

  // Find which parent tasks have subitems
  const hasChildren = new Set<string>();
  for (let i = 0; i < appTasks.length; i++) {
    if (appTasks[i]!.isSubitem) {
      for (let j = i - 1; j >= 0; j--) {
        const p = appTasks[j]!;
        if (!p.isSubitem && !p.isGroupRow) { hasChildren.add(p.id); break; }
      }
    }
  }

  let curParentNum = 0;

  for (const t of appTasks) {
    const id = numId(t.id);

    // Group row → summary (SVAR computes dates from children)
    if (t.isGroupRow) {
      tasks.push({ id, text: t.name, progress: 0, parent: 0, type: "summary", open: true });
      curParentNum = 0;
      continue;
    }

    // Determine parent numeric ID
    let parent = groupNums.get(t.groupId) ?? 0;
    if (t.isSubitem && curParentNum > 0) parent = curParentNum;
    if (!t.isSubitem) curParentNum = id;

    // Parent with subitems → summary
    if (hasChildren.has(t.id)) {
      // If it has its own dates, pass them so SVAR has something to show
      if (t.start && t.end) {
        tasks.push({ id, text: t.name, start: toDate(t.start), duration: diffDays(t.start, t.end), progress: t.pct, parent, type: "summary", open: true });
      } else {
        tasks.push({ id, text: t.name, progress: t.pct, parent, type: "summary", open: true });
      }
    } else if (t.start && t.end && t.start !== t.end) {
      // Normal task with date range
      tasks.push({ id, text: t.name, start: toDate(t.start), duration: diffDays(t.start, t.end), progress: t.pct, parent, type: "task" });
    } else if (t.start || t.end) {
      // Single date → milestone
      tasks.push({ id, text: t.name, start: toDate((t.start ?? t.end)!), progress: t.pct, parent, type: "milestone" });
    } else {
      // No dates — skip entirely (SVAR can't render it)
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

  return { tasks, links };
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
