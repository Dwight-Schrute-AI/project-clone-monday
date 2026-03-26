/** @module Adapter: converts our monday.com Task model to SVAR Gantt data format */

import type { Task, Column } from "../types";

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

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format ISO date → "03-Mar-2026" */
function fmtDisplay(iso: string): string {
  const d = toDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/**
 * Convert app Task[] → SVAR {tasks, links}.
 *
 * Hierarchy: groups → parent tasks → children. But ONLY include a parent
 * reference if that parent actually exists in the output. This prevents
 * the SVAR tree builder crash.
 *
 * Extra columns: status, owner, department are passed as custom fields
 * on each SVAR task object so SVAR's grid can display them via template columns.
 */
export function tasksToSvar(
  appTasks: Task[],
  userDir: Map<string, { id: string; name: string; email: string }>,
  appColumns: Column[],
): {
  tasks: Array<Record<string, unknown>>;
  links: SvarLink[];
} {
  const outputTasks: Array<Record<string, unknown>> = [];
  const links: SvarLink[] = [];
  let linkId = 1;

  // Assign numeric IDs to all
  for (const t of appTasks) numId(t.id);

  // Compute group date ranges
  const groupNums = new Map<string, number>();
  const groupRanges = new Map<string, { min: string; max: string }>();
  for (const t of appTasks) {
    if (t.isGroupRow) { groupNums.set(t.groupId, numId(t.id)); continue; }
    for (const d of [t.start, t.end]) {
      if (!d) continue;
      const r = groupRanges.get(t.groupId);
      if (!r) groupRanges.set(t.groupId, { min: d, max: d });
      else { if (d < r.min) r.min = d; if (d > r.max) r.max = d; }
    }
  }

  // Find the department column key
  const deptCol = appColumns.find((c) => /\bdepartment\b/i.test(c.label));
  const deptKey = deptCol?.key ?? null;

  // Resolve person names
  function resolveOwner(personIds: string[]): string {
    return personIds
      .map((pid) => userDir.get(pid)?.name ?? pid)
      .join(", ");
  }

  // Build output — two passes: first emit all tasks, then validate parents
  const raw: Array<Record<string, unknown>> = [];
  const emittedIds = new Set<number>();
  let curParentNum = 0;

  for (const t of appTasks) {
    const id = numId(t.id);

    if (t.isGroupRow) {
      const range = groupRanges.get(t.groupId);
      if (!range) { curParentNum = 0; continue; }
      raw.push({
        id, text: t.name,
        start: toDate(range.min), end: toDate(range.max),
        duration: diffDays(range.min, range.max),
        progress: 0, parent: 0, type: "task", open: true,
        startFmt: fmtDisplay(range.min),
        status: "", assigned: "", dept: "",
      });
      emittedIds.add(id);
      curParentNum = 0;
      continue;
    }

    // Skip dateless
    if (!t.start && !t.end) continue;

    // Parent reference
    let parent = groupNums.get(t.groupId) ?? 0;
    if (t.isSubitem && curParentNum > 0) parent = curParentNum;
    if (!t.isSubitem) curParentNum = id;

    // Custom column values
    const dept = deptKey ? (typeof t.extras[deptKey] === "string" ? t.extras[deptKey] as string : "") : "";
    const owner = resolveOwner(t.personIds);
    const startFmt = t.start ? fmtDisplay(t.start) : "";

    if (t.start && t.end && t.start !== t.end) {
      raw.push({
        id, text: t.name,
        start: toDate(t.start), end: toDate(t.end),
        duration: diffDays(t.start, t.end),
        progress: t.pct, parent, type: "task",
        startFmt: startFmt, status: t.status, assigned: owner, dept: dept,
      });
    } else {
      const d = (t.start ?? t.end)!;
      raw.push({
        id, text: t.name,
        start: toDate(d), end: toDate(d),
        duration: 0, progress: t.pct, parent, type: "milestone",
        startFmt: fmtDisplay(d), status: t.status, assigned: owner, dept: dept,
      });
    }
    emittedIds.add(id);

    // Dependencies → links
    for (const pred of t.predecessors) {
      const src = idMap.get(pred);
      if (src !== undefined) {
        links.push({ id: linkId++, source: src, target: id, type: "e2s" });
      }
    }
  }

  // Second pass: fix orphaned parents (parent not in output → promote to root)
  for (const t of raw) {
    const p = t["parent"] as number;
    if (p !== 0 && !emittedIds.has(p)) {
      t["parent"] = 0;
    }
    outputTasks.push(t);
  }

  return { tasks: outputTasks, links };
}

/** Convert SVAR edit event back to app field updates */
export function svarChangeToApp(
  task: { id: number; start?: Date; end?: Date; duration?: number; text?: string; progress?: number },
): { appId: string; fields: Array<{ key: string; value: unknown }> } | null {
  const appId = toAppId(task.id);
  if (!appId) return null;

  const fields: Array<{ key: string; value: unknown }> = [];
  if (task.text !== undefined) fields.push({ key: "name", value: task.text });
  if (task.start !== undefined) fields.push({ key: "start", value: fmtIso(task.start) });
  if (task.end !== undefined) {
    fields.push({ key: "end", value: fmtIso(task.end) });
  } else if (task.start !== undefined && task.duration !== undefined) {
    const end = new Date(task.start);
    end.setDate(end.getDate() + task.duration);
    fields.push({ key: "end", value: fmtIso(end) });
  }
  if (task.progress !== undefined) fields.push({ key: "pct", value: task.progress });
  return { appId, fields };
}

function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
