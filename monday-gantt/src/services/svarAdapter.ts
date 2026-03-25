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
 * Per SVAR quickstart: tasks can have start + end + duration.
 * Summaries are fine AS LONG AS they have start/end/duration.
 * Tasks without dates are skipped.
 */
export function tasksToSvar(appTasks: Task[]): {
  tasks: Array<Record<string, unknown>>;
  links: SvarLink[];
} {
  const tasks: Array<Record<string, unknown>> = [];
  const links: SvarLink[] = [];
  let linkId = 1;

  // Assign numeric IDs
  for (const t of appTasks) numId(t.id);

  // Collect group numeric IDs and compute group date ranges
  const groupNums = new Map<string, number>();
  const groupRanges = new Map<string, { min: string; max: string }>();
  for (const t of appTasks) {
    if (t.isGroupRow) {
      groupNums.set(t.groupId, numId(t.id));
      continue;
    }
    for (const d of [t.start, t.end]) {
      if (!d) continue;
      const r = groupRanges.get(t.groupId);
      if (!r) { groupRanges.set(t.groupId, { min: d, max: d }); }
      else { if (d < r.min) r.min = d; if (d > r.max) r.max = d; }
    }
  }

  // Find parent tasks with subitems
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

    if (t.isGroupRow) {
      // Group → summary with computed date range (SVAR requires dates on summaries)
      const range = groupRanges.get(t.groupId);
      if (!range) { curParentNum = 0; continue; } // skip empty groups
      const dur = diffDays(range.min, range.max);
      tasks.push({
        id, text: t.name, start: toDate(range.min), end: toDate(range.max),
        duration: dur, progress: 0, parent: 0, type: "summary", open: true,
      });
      curParentNum = 0;
      continue;
    }

    // Determine parent
    let parent = groupNums.get(t.groupId) ?? 0;
    if (t.isSubitem && curParentNum > 0) parent = curParentNum;
    if (!t.isSubitem) curParentNum = id;

    if (t.start && t.end) {
      const dur = diffDays(t.start, t.end);
      const isSummary = hasChildren.has(t.id);
      tasks.push({
        id, text: t.name, start: toDate(t.start), end: toDate(t.end),
        duration: dur, progress: t.pct, parent,
        type: isSummary ? "summary" : "task",
        ...(isSummary ? { open: true } : {}),
      });
    } else if (t.start || t.end) {
      const d = (t.start ?? t.end)!;
      tasks.push({
        id, text: t.name, start: toDate(d), end: toDate(d),
        duration: 0, progress: t.pct, parent, type: "milestone",
      });
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

  // Validate: orphaned children (parent skipped) → promote to root
  const taskIds = new Set(tasks.map((t) => t["id"] as number));
  for (const t of tasks) {
    const p = t["parent"] as number;
    if (p !== 0 && !taskIds.has(p)) t["parent"] = 0;
  }

  return { tasks, links };
}

/** Convert SVAR edit event back to app field updates */
export function svarChangeToApp(
  task: { id: number; start?: Date; end?: Date; duration?: number; text?: string; progress?: number },
): { appId: string; fields: Array<{ key: string; value: unknown }> } | null {
  const appId = toAppId(task.id);
  if (!appId) return null;

  const fields: Array<{ key: string; value: unknown }> = [];
  if (task.text !== undefined) fields.push({ key: "name", value: task.text });
  if (task.start !== undefined) fields.push({ key: "start", value: fmt(task.start) });
  if (task.end !== undefined) {
    fields.push({ key: "end", value: fmt(task.end) });
  } else if (task.start !== undefined && task.duration !== undefined) {
    const end = new Date(task.start);
    end.setDate(end.getDate() + task.duration);
    fields.push({ key: "end", value: fmt(end) });
  }
  if (task.progress !== undefined) fields.push({ key: "pct", value: task.progress });
  return { appId, fields };
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
