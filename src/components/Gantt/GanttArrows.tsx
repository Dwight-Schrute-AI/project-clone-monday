/** @module GanttArrows — SVG right-angle dependency connectors */

import { useMemo } from "react";
import type { Task } from "../../types";
import type { RowGeometry } from "../../state/selectors";
import { diffDays } from "../../utils/dateUtils";
import { logger } from "../../services/logger";
import styles from "./Gantt.module.css";

interface GanttArrowsProps {
  tasks: Task[];
  rowGeometryMap: Map<string, RowGeometry>;
  dependencyGraph: Map<string, string[]>;
  timelineStart: string;
  dayWidth: number;
  totalWidth: number;
  totalHeight: number;
}

interface ArrowPath {
  key: string;
  d: string;
  /** "right" = arrowhead points right at bar left edge; "down" = arrowhead points down at bar top */
  direction: "right" | "down";
  tipX: number;
  tipY: number;
}

const ARROW_SIZE = 5;
const BEND_OFFSET = 12;
const BAR_V_PADDING = 5;

function barRightX(task: Task, timelineStart: string, dayWidth: number): number {
  const effectiveStart = task.start ?? task.end!;
  const effectiveEnd = task.end ?? task.start!;
  const left = diffDays(timelineStart, effectiveStart) * dayWidth;
  const duration = diffDays(effectiveStart, effectiveEnd);
  return left + Math.max(duration * dayWidth, dayWidth);
}

function barLeftX(task: Task, timelineStart: string, dayWidth: number): number {
  const effectiveStart = task.start ?? task.end!;
  return diffDays(timelineStart, effectiveStart) * dayWidth;
}

export function GanttArrows({
  tasks,
  rowGeometryMap,
  dependencyGraph,
  timelineStart,
  dayWidth,
  totalWidth,
  totalHeight,
}: GanttArrowsProps): React.JSX.Element | null {
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const arrows = useMemo(() => {
    const result: ArrowPath[] = [];

    let skippedCrossBoard = 0;
    let skippedMissingGeo = 0;
    let skippedMissingDate = 0;

    for (const [predId, successorIds] of dependencyGraph) {
      const predTask = taskMap.get(predId);
      if (!predTask) { skippedCrossBoard++; continue; }
      const predGeo = rowGeometryMap.get(predId);
      if (!predGeo) { skippedMissingGeo++; continue; }

      const predEnd = predTask.end ?? predTask.start;
      if (!predEnd) { skippedMissingDate++; continue; }

      // Right edge of predecessor bar, center Y
      const startX = barRightX(predTask, timelineStart, dayWidth);
      const startY = predGeo.y + predGeo.height / 2;

      for (const succId of successorIds) {
        const succTask = taskMap.get(succId);
        if (!succTask) { skippedCrossBoard++; continue; }
        const succGeo = rowGeometryMap.get(succId);
        if (!succGeo) { skippedMissingGeo++; continue; }

        const succStart = succTask.start ?? succTask.end;
        if (!succStart) { skippedMissingDate++; continue; }

        const succLeftX = barLeftX(succTask, timelineStart, dayWidth);
        const succBarTop = succGeo.y + BAR_V_PADDING;
        const succCenterY = succGeo.y + succGeo.height / 2;

        // Routing strategy:
        // Always approach the successor from above to avoid crossing over bar faces.
        // Route: exit pred right → go right → go to above succ row → go to approach X → drop down into bar top
        const midX = startX + BEND_OFFSET;
        const aboveY = succGeo.y - 4; // just above the successor row
        // Approach from above, landing on the bar left edge area
        const approachX = succLeftX + ARROW_SIZE + 2;

        let d: string;
        let direction: "right" | "down";
        let tipX: number;
        let tipY: number;

        if (succCenterY <= startY - 10) {
          // Successor is ABOVE predecessor — route up then left/right to approach from above
          const aboveSucc = succGeo.y + succGeo.height + 4; // below the successor row
          d = [
            `M ${s(startX)} ${s(startY)}`,
            `H ${s(midX)}`,
            `V ${s(aboveSucc)}`,
            `H ${s(approachX)}`,
            `V ${s(succBarTop)}`,  // backtrack up to bar top
          ].join(" ");
          // Actually for above-pred case, arrive from below going up
          // Let's do a simpler left-entry approach for upward arrows
          d = [
            `M ${s(startX)} ${s(startY)}`,
            `H ${s(midX)}`,
            `V ${s(aboveY)}`,
            `H ${s(approachX)}`,
            `V ${s(succBarTop)}`,
          ].join(" ");
          direction = "down";
          tipX = approachX;
          tipY = succBarTop;
        } else if (succLeftX > startX + BEND_OFFSET * 2 + ARROW_SIZE) {
          // Normal case: successor bar is well to the right — enough room for clean approach
          // Route: right → down to above succ → right to approach point → down to bar top
          d = [
            `M ${s(startX)} ${s(startY)}`,
            `H ${s(midX)}`,
            `V ${s(aboveY)}`,
            `H ${s(approachX)}`,
            `V ${s(succBarTop)}`,
          ].join(" ");
          direction = "down";
          tipX = approachX;
          tipY = succBarTop;
        } else {
          // Bars overlap or are close — route right, down past pred, then left and down above succ
          d = [
            `M ${s(startX)} ${s(startY)}`,
            `H ${s(midX)}`,
            `V ${s(aboveY)}`,
            `H ${s(approachX)}`,
            `V ${s(succBarTop)}`,
          ].join(" ");
          direction = "down";
          tipX = approachX;
          tipY = succBarTop;
        }

        result.push({ key: `${predId}-${succId}`, d, direction, tipX, tipY });
      }
    }

    if (skippedCrossBoard > 0) {
      logger.info(`Dependency arrows: ${String(skippedCrossBoard)} cross-board edge(s) skipped`);
    }
    if (skippedMissingGeo > 0) {
      logger.warn(`Dependency arrows: ${String(skippedMissingGeo)} edge(s) skipped — task not visible`);
    }
    if (skippedMissingDate > 0) {
      logger.warn(`Dependency arrows: ${String(skippedMissingDate)} edge(s) skipped — task has no dates`);
    }
    if (result.length > 0) {
      logger.info(`Dependency arrows: rendering ${String(result.length)} arrow(s)`);
    }

    return result;
  }, [dependencyGraph, taskMap, rowGeometryMap, timelineStart, dayWidth]);

  if (arrows.length === 0) return null;

  return (
    <svg
      className={styles.arrowsSvg}
      width={totalWidth}
      height={totalHeight}
    >
      {arrows.map((arrow) => (
        <g key={arrow.key}>
          <path
            d={arrow.d}
            fill="none"
            stroke="var(--gantt-arrow, var(--text-secondary))"
            strokeWidth="1.5"
          />
          {arrow.direction === "right" ? (
            <polygon
              points={`${s(arrow.tipX)},${s(arrow.tipY)} ${s(arrow.tipX - ARROW_SIZE)},${s(arrow.tipY - ARROW_SIZE)} ${s(arrow.tipX - ARROW_SIZE)},${s(arrow.tipY + ARROW_SIZE)}`}
              fill="var(--gantt-arrow, var(--text-secondary))"
            />
          ) : (
            <polygon
              points={`${s(arrow.tipX)},${s(arrow.tipY)} ${s(arrow.tipX - ARROW_SIZE)},${s(arrow.tipY - ARROW_SIZE)} ${s(arrow.tipX + ARROW_SIZE)},${s(arrow.tipY - ARROW_SIZE)}`}
              fill="var(--gantt-arrow, var(--text-secondary))"
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/** Stringify a number for SVG path data */
function s(n: number): string {
  return String(Math.round(n));
}
