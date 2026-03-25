/** @module Gantt — container: time header, bar area, today line, dependency arrows */

import { useMemo, useRef, useEffect } from "react";
import { useAppContext } from "../../state/AppContext";
import { selectVisibleTasks, selectRowGeometry, selectDependencyGraph } from "../../state/selectors";
import type { RowGeometry } from "../../state/selectors";
import type { Task } from "../../types";
import { diffDays, addDays, formatDate, isWeekend, dateRange } from "../../utils/dateUtils";
import { TimeHeader } from "./TimeHeader";
import { GanttBar } from "./GanttBar";
import { GanttArrows } from "./GanttArrows";
import styles from "./Gantt.module.css";

/** Zoom presets: dayWidth in pixels, exported for Shell toolbar */
export const ZOOM_PRESETS = [
  { label: "Year", dayWidth: 2 },
  { label: "Quarter", dayWidth: 5 },
  { label: "Month", dayWidth: 10 },
  { label: "Week", dayWidth: 20 },
  { label: "Day", dayWidth: 30 },
] as const;

const TIMELINE_PAD_DAYS = 14;

interface GroupRange {
  start: string;
  end: string;
  pct: number;
}

interface GanttProps {
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function Gantt({ scrollContainerRef }: GanttProps): React.JSX.Element {
  const { state } = useAppContext();
  const barAreaRef = useRef<HTMLDivElement>(null);
  const projectSummaryRef = useRef<HTMLDivElement>(null);
  const timeHeaderRef = useRef<HTMLDivElement>(null);

  // Sync project summary bar + time header with barArea horizontal scroll
  useEffect(() => {
    const barArea = scrollContainerRef?.current ?? barAreaRef.current;
    if (!barArea) return;

    function handleScroll(): void {
      if (barArea) {
        if (projectSummaryRef.current) projectSummaryRef.current.scrollLeft = barArea.scrollLeft;
        if (timeHeaderRef.current) timeHeaderRef.current.scrollLeft = barArea.scrollLeft;
      }
    }

    barArea.addEventListener("scroll", handleScroll);
    return () => { barArea.removeEventListener("scroll", handleScroll); };
  }, [scrollContainerRef]);

  const preset = ZOOM_PRESETS[state.ganttZoom] ?? ZOOM_PRESETS[4]!;
  const dayWidth = preset.dayWidth;

  const visibleTasks = useMemo(
    () => selectVisibleTasks(state),
    [state.tasks, state.collapsedGroups, state.collapsedItems, state.departmentFilter, state.columns],
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
  const totalWidth = totalDays * dayWidth;
  const lastRow = rowGeometry[rowGeometry.length - 1];
  const totalHeight = lastRow ? lastRow.y + lastRow.height : 0;

  const weekendDays = useMemo(() => {
    const days = dateRange(tStart, tEnd);
    return days.filter(isWeekend);
  }, [tStart, tEnd]);

  const today = formatDate(new Date());
  const todayX = diffDays(tStart, today) * dayWidth;
  const showTodayLine = todayX >= 0 && todayX <= totalWidth;

  // Only show individual day numbers when zoomed in enough
  const showDayNumbers = dayWidth >= 16;

  // Project-level summary: earliest start to latest end across ALL tasks
  const projectRange = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const t of state.tasks) {
      if (t.isGroupRow) continue;
      if (t.start && (!min || t.start < min)) min = t.start;
      if (t.end && (!max || t.end > max)) max = t.end;
    }
    return min && max ? { start: min, end: max } : null;
  }, [state.tasks]);

  return (
    <div className={styles.gantt}>
      <div ref={timeHeaderRef} style={{ flexShrink: 0, overflow: "hidden" }}>
        <TimeHeader
          timelineStart={tStart}
          timelineEnd={tEnd}
          dayWidth={dayWidth}
          showDayNumbers={showDayNumbers}
        />
      </div>

      {/* Project summary bar — aligns with Grid summary row */}
      {projectRange && (
        <div className={styles.projectSummaryRow} ref={projectSummaryRef}>
          <div className={styles.projectSummaryInner} style={{ width: totalWidth }}>
            <div
              className={styles.projectSummaryBar}
              style={{
                left: diffDays(tStart, projectRange.start) * dayWidth,
                width: Math.max(diffDays(projectRange.start, projectRange.end) * dayWidth, dayWidth),
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.barArea} ref={scrollContainerRef ?? barAreaRef}>
        <div
          className={styles.barAreaInner}
          style={{ width: totalWidth, height: Math.max(totalHeight, 1) }}
        >
          {weekendDays.map((day) => {
            const x = diffDays(tStart, day) * dayWidth;
            return (
              <div
                key={`wk-${day}`}
                className={styles.weekendStripe}
                style={{ left: x, width: dayWidth }}
              />
            );
          })}

          {showTodayLine && (
            <div className={styles.todayLine} style={{ left: todayX }} />
          )}

          {/* Group row tinted backgrounds */}
          {visibleTasks.map((task) => {
            if (!task.isGroupRow) return null;
            const rg = rowGeometryMap.get(task.id);
            if (!rg) return null;
            const color = typeof task.extras["_groupColor"] === "string"
              ? task.extras["_groupColor"] : "var(--text-secondary)";
            return (
              <div
                key={`gbg-${task.id}`}
                className={styles.groupRowBg}
                style={{ top: rg.y, height: rg.height, borderLeftColor: color, background: `${color}11` }}
              />
            );
          })}

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
                dayWidth={dayWidth}
                y={rg.y}
                rowHeight={rg.height}
                groupRange={groupRange}
              />
            );
          })}

          <GanttArrows
            tasks={state.tasks}
            rowGeometryMap={rowGeometryMap}
            dependencyGraph={dependencyGraph}
            timelineStart={tStart}
            dayWidth={dayWidth}
            totalWidth={totalWidth}
            totalHeight={totalHeight}
          />
        </div>
      </div>
    </div>
  );
}

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
