/** @module GanttBar — single bar: normal, milestone, or summary mode */

import type { Task } from "../../types";
import { diffDays } from "../../utils/dateUtils";
import styles from "./Gantt.module.css";

interface GanttBarProps {
  task: Task;
  timelineStart: string;
  dayWidth: number;
  y: number;
  rowHeight: number;
  groupRange: { start: string; end: string; pct: number } | null;
}

const BAR_V_PADDING = 5;
const SUMMARY_HEIGHT = 8;
const MILESTONE_SIZE = 12;

export function GanttBar({
  task,
  timelineStart,
  dayWidth,
  y,
  rowHeight,
  groupRange,
}: GanttBarProps): React.JSX.Element | null {
  // Summary mode for group rows
  if (task.isGroupRow) {
    if (!groupRange) return null;
    return renderSummary(groupRange, timelineStart, dayWidth, y, rowHeight);
  }

  const start = task.start;
  const end = task.end;

  // No dates — skip
  if (!start && !end) return null;

  const effectiveStart = start ?? end!;
  const effectiveEnd = end ?? start!;
  const duration = diffDays(effectiveStart, effectiveEnd);

  // Milestone mode: zero or one day duration, or only one date set
  if (duration <= 0 || !start || !end) {
    return renderMilestone(effectiveStart, timelineStart, dayWidth, y, rowHeight);
  }

  // Normal bar mode
  return renderNormalBar(
    effectiveStart, effectiveEnd, task.pct, task.name,
    timelineStart, dayWidth, y, rowHeight,
  );
}

function renderNormalBar(
  start: string, end: string, pct: number, name: string,
  timelineStart: string, dayWidth: number, y: number, rowHeight: number,
): React.JSX.Element {
  const left = diffDays(timelineStart, start) * dayWidth;
  const width = Math.max(diffDays(start, end) * dayWidth, dayWidth);
  const barHeight = rowHeight - BAR_V_PADDING * 2;
  const top = y + BAR_V_PADDING;

  return (
    <div
      className={styles.bar}
      style={{ left, top, width, height: barHeight, lineHeight: `${String(barHeight)}px` }}
    >
      {pct > 0 && (
        <div className={styles.barFill} style={{ width: `${String(pct)}%` }} />
      )}
      {width > 60 && <span className={styles.barLabel}>{name}</span>}
    </div>
  );
}

function renderMilestone(
  date: string, timelineStart: string,
  dayWidth: number, y: number, rowHeight: number,
): React.JSX.Element {
  const left = diffDays(timelineStart, date) * dayWidth + dayWidth / 2 - MILESTONE_SIZE / 2;
  const top = y + (rowHeight - MILESTONE_SIZE) / 2;

  return (
    <div
      className={styles.milestone}
      style={{ left, top }}
    />
  );
}

function renderSummary(
  range: { start: string; end: string; pct: number },
  timelineStart: string, dayWidth: number, y: number, rowHeight: number,
): React.JSX.Element {
  const left = diffDays(timelineStart, range.start) * dayWidth;
  const width = Math.max(diffDays(range.start, range.end) * dayWidth, dayWidth);
  const top = y + (rowHeight - SUMMARY_HEIGHT) / 2;

  return (
    <div
      className={styles.summaryBar}
      style={{ left, top, width }}
    >
      {range.pct > 0 && (
        <div className={styles.summaryBarFill} style={{ width: `${String(range.pct)}%` }} />
      )}
    </div>
  );
}
