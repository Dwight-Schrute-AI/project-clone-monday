/** @module GanttArrows — SVG right-angle dependency connectors */

import { useMemo } from "react";
import type { Task } from "../../types";
import type { RowGeometry } from "../../state/selectors";
import { diffDays } from "../../utils/dateUtils";
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
  tipX: number;
  tipY: number;
}

const ARROW_SIZE = 5;
const BEND_OFFSET = 12;

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

    for (const [predId, successorIds] of dependencyGraph) {
      const predTask = taskMap.get(predId);
      if (!predTask) continue;
      const predGeo = rowGeometryMap.get(predId);
      if (!predGeo) continue;

      const predEnd = predTask.end ?? predTask.start;
      if (!predEnd) continue;

      // Right edge of predecessor bar, center Y
      const px = barRightX(predTask, timelineStart, dayWidth);
      const py = predGeo.y + predGeo.height / 2;

      for (const succId of successorIds) {
        const succTask = taskMap.get(succId);
        if (!succTask) continue;
        const succGeo = rowGeometryMap.get(succId);
        if (!succGeo) continue;

        const succStart = succTask.start ?? succTask.end;
        if (!succStart) continue;

        const sx = barLeftX(succTask, timelineStart, dayWidth);
        const sy = succGeo.y + succGeo.height / 2;

        // Arrow enters the successor bar from the LEFT (arrowhead points right).
        // To avoid crossing over bar faces, route ABOVE the successor row
        // before dropping down to the bar's center height, then go right to
        // the bar's left edge.

        const midX = px + BEND_OFFSET;
        // Y just above the successor row (clears the bar)
        const aboveY = succGeo.y - 4;
        // X where the vertical drop occurs — just left of the bar
        const approachX = sx - BEND_OFFSET;

        let d: string;

        if (sx > px + BEND_OFFSET * 3) {
          // Normal case: successor starts well after predecessor ends.
          // Route: right from pred → up/down to above succ row → right
          // to just left of bar → down to bar center → right to bar edge.
          d = [
            `M ${n(px)} ${n(py)}`,
            `H ${n(midX)}`,
            `V ${n(aboveY)}`,
            `H ${n(approachX)}`,
            `V ${n(sy)}`,
            `H ${n(sx)}`,
          ].join(" ");
        } else {
          // Tight/overlapping: not enough room for a clean approach from
          // left. Route right past pred, then up/down above succ row,
          // left to approach point, down to center, right to bar edge.
          d = [
            `M ${n(px)} ${n(py)}`,
            `H ${n(midX)}`,
            `V ${n(aboveY)}`,
            `H ${n(approachX)}`,
            `V ${n(sy)}`,
            `H ${n(sx)}`,
          ].join(" ");
        }

        result.push({ key: `${predId}-${succId}`, d, tipX: sx, tipY: sy });
      }
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
            points={`${n(arrow.tipX)},${n(arrow.tipY)} ${n(arrow.tipX - ARROW_SIZE)},${n(arrow.tipY - ARROW_SIZE)} ${n(arrow.tipX - ARROW_SIZE)},${n(arrow.tipY + ARROW_SIZE)}`}
            fill="var(--gantt-arrow, var(--text-secondary))"
          />
        </g>
      ))}
    </svg>
  );
}

/** Stringify a number for SVG path data */
function n(v: number): string {
  return String(Math.round(v));
}
