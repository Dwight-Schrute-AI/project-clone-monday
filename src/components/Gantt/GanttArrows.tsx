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
  arrowX: number;
  arrowY: number;
}

const ARROW_SIZE = 5;
const BEND_OFFSET = 12;

/**
 * Compute the pixel X of a bar's right edge given the task and timeline params.
 * Matches the rendering logic in GanttBar exactly.
 */
function barRightX(task: Task, timelineStart: string, dayWidth: number): number {
  const start = task.start;
  const end = task.end;
  const effectiveStart = start ?? end!;
  const effectiveEnd = end ?? start!;
  const left = diffDays(timelineStart, effectiveStart) * dayWidth;
  const duration = diffDays(effectiveStart, effectiveEnd);
  const width = Math.max(duration * dayWidth, dayWidth);
  return left + width;
}

/**
 * Compute the pixel X of a bar's left edge.
 */
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

      // Right edge of predecessor bar
      const startX = barRightX(predTask, timelineStart, dayWidth);
      const startY = predGeo.y + predGeo.height / 2;

      for (const succId of successorIds) {
        const succTask = taskMap.get(succId);
        if (!succTask) { skippedCrossBoard++; continue; }
        const succGeo = rowGeometryMap.get(succId);
        if (!succGeo) { skippedMissingGeo++; continue; }

        const succStart = succTask.start ?? succTask.end;
        if (!succStart) { skippedMissingDate++; continue; }

        // Left edge of successor bar — arrowhead tip lands here
        const endX = barLeftX(succTask, timelineStart, dayWidth);
        const endY = succGeo.y + succGeo.height / 2;

        // Route: right from pred bar → down/up → right to succ bar
        // If successor starts after predecessor ends, simple right-angle.
        // If overlap, route around below/above.
        let d: string;
        const midX = startX + BEND_OFFSET;

        if (endX >= startX + BEND_OFFSET + ARROW_SIZE) {
          // Normal case: enough horizontal room
          d = `M ${String(startX)} ${String(startY)} H ${String(midX)} V ${String(endY)} H ${String(endX)}`;
        } else {
          // Overlap: route around via a detour below (or above if successor is below)
          const detourY = Math.max(startY, endY) + 20;
          const returnX = endX - BEND_OFFSET;
          d = `M ${String(startX)} ${String(startY)} H ${String(midX)} V ${String(detourY)} H ${String(returnX)} V ${String(endY)} H ${String(endX)}`;
        }

        result.push({
          key: `${predId}-${succId}`,
          d,
          arrowX: endX,
          arrowY: endY,
        });
      }
    }

    if (skippedCrossBoard > 0) {
      logger.info(
        `Dependency arrows: ${String(skippedCrossBoard)} cross-board edge(s) skipped`
      );
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
          <polygon
            points={`${String(arrow.arrowX)},${String(arrow.arrowY)} ${String(arrow.arrowX - ARROW_SIZE)},${String(arrow.arrowY - ARROW_SIZE)} ${String(arrow.arrowX - ARROW_SIZE)},${String(arrow.arrowY + ARROW_SIZE)}`}
            fill="var(--gantt-arrow, var(--text-secondary))"
          />
        </g>
      ))}
    </svg>
  );
}
