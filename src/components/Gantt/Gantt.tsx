/** @module Gantt — container: time header, bar area, today line, dependency arrows */

import { useMemo, useRef } from "react";
import { useAppContext } from "../../state/AppContext";
import { selectVisibleTasks, selectRowGeometry, selectDependencyGraph } from "../../state/selectors";
import type { RowGeometry } from "../../state/selectors";
import type { Task } from "../../types";
import { diffDays, addDays, formatDate, isWeekend, dateRange } from "../../utils/dateUtils";
import { TimeHeader } from "./TimeHeader";
import { GanttBar } from "./GanttBar";
import { GanttArrows } from "./GanttArrows";
import styles from "./Gantt.module.css";

const DAY_WIDTH = 30;
const TIMELINE_PAD_DAYS = 14;

interface GroupRange {
  start: string;
  end: string;
  pct: number;
}

export function Gantt(): React.JSX.Element {
  const { state } = useAppContext();
  const barAreaRef = useRef<HTMLDivElement>(null);

  const visibleTasks = useMemo(
    () => selectVisibleTasks(state),
    [state],
  );

  const rowGeometry = useMemo(
    () => selectRowGeometry(visibleTasks),
    [visibleTasks],
  );

  const rowGeometryMap = useMemo(() => {
    const map = new Map<string, RowGeometry>();
    for (const rg of rowGeometry) map.set(rg.taskId, rg);
    return map;
  }, [rowGeometry]);

  const dependencyGraph = useMemo(
    () => selectDependencyGraph(state.tasks),
    [state.tasks],
  );

  const { start: tStart, end: tEnd } = useMemo(
    () => computeTimelineRange(visibleTasks),
    [visibleTasks],
  );

  const groupRanges = useMemo(
    () => computeGroupRanges(visibleTasks),
    [visibleTasks],
  );

  const totalDays = diffDays(tStart, tEnd) + 1;
  const totalWidth = totalDays * DAY_WIDTH;
  const lastRow = rowGeometry[rowGeometry.length - 1];
  const totalHeight = lastRow ? lastRow.y + lastRow.height : 0;

  // Weekend stripe positions
  const weekendDays = useMemo(() => {
    const days = dateRange(tStart, tEnd);
    return days.filter(isWeekend);
  }, [tStart, tEnd]);

  // Today line
  const today = formatDate(new Date());
  const todayX = diffDays(tStart, today) * DAY_WIDTH;
  const showTodayLine = todayX >= 0 && todayX <= totalWidth;

  return (
    <div className={styles.gantt}>
      <TimeHeader
        timelineStart={tStart}
        timelineEnd={tEnd}
        dayWidth={DAY_WIDTH}
      />

      <div className={styles.barArea} ref={barAreaRef}>
        <div
          className={styles.barAreaInner}
          style={{ width: totalWidth, height: Math.max(totalHeight, 1) }}
        >
          {weekendDays.map((day) => {
            const x = diffDays(tStart, day) * DAY_WIDTH;
            return (
              <div
                key={`wk-${day}`}
                className={styles.weekendStripe}
                style={{ left: x, width: DAY_WIDTH }}
              />
            );
          })}

          {showTodayLine && (
            <div className={styles.todayLine} style={{ left: todayX }} />
          )}

          {visibleTasks.map((task) => {
            const rg = rowGeometryMap.get(task.id);
            if (!rg) return null;
            const groupRange = task.isGroupRow
              ? groupRanges.get(task.groupId) ?? null
              : null;

            return (
              <GanttBar
                key={task.id}
                task={task}
                timelineStart={tStart}
                dayWidth={DAY_WIDTH}
                y={rg.y}
                rowHeight={rg.height}
                groupRange={groupRange}
              />
            );
          })}

          <GanttArrows
            tasks={visibleTasks}
            rowGeometryMap={rowGeometryMap}
            dependencyGraph={dependencyGraph}
            timelineStart={tStart}
            dayWidth={DAY_WIDTH}
            totalWidth={totalWidth}
            totalHeight={totalHeight}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Compute the timeline range from all tasks' dates with padding.
 * Defaults to the current month if no tasks have dates.
 */
function computeTimelineRange(tasks: Task[]): { start: string; end: string } {
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const task of tasks) {
    if (task.isGroupRow) continue;
    if (task.start) {
      if (!minDate || task.start < minDate) minDate = task.start;
      if (!maxDate || task.start > maxDate) maxDate = task.start;
    }
    if (task.end) {
      if (!minDate || task.end < minDate) minDate = task.end;
      if (!maxDate || task.end > maxDate) maxDate = task.end;
    }
  }

  if (!minDate || !maxDate) {
    // Default: current month with padding
    const now = new Date();
    const monthStart = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    const monthEnd = formatDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
    return {
      start: addDays(monthStart, -7),
      end: addDays(monthEnd, 7),
    };
  }

  return {
    start: addDays(minDate, -TIMELINE_PAD_DAYS),
    end: addDays(maxDate, TIMELINE_PAD_DAYS),
  };
}

/**
 * Compute summary ranges for each group: min start, max end, average pct.
 */
function computeGroupRanges(tasks: Task[]): Map<string, GroupRange> {
  const groups = new Map<string, { starts: string[]; ends: string[]; pcts: number[] }>();

  for (const task of tasks) {
    if (task.isGroupRow) continue;

    let entry = groups.get(task.groupId);
    if (!entry) {
      entry = { starts: [], ends: [], pcts: [] };
      groups.set(task.groupId, entry);
    }

    if (task.start) entry.starts.push(task.start);
    if (task.end) entry.ends.push(task.end);
    entry.pcts.push(task.pct);
  }

  const result = new Map<string, GroupRange>();

  for (const [groupId, data] of groups) {
    const allDates = [...data.starts, ...data.ends];
    if (allDates.length === 0) continue;

    allDates.sort();
    const start = allDates[0]!;
    const end = allDates[allDates.length - 1]!;
    const pct = data.pcts.length > 0
      ? Math.round(data.pcts.reduce((a, b) => a + b, 0) / data.pcts.length)
      : 0;

    result.set(groupId, { start, end, pct });
  }

  return result;
}
