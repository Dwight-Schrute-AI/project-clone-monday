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
  arrowX: number;
  arrowY: number;
}

const ARROW_SIZE = 4;
const BEND_OFFSET = 12;

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
      const predGeo = rowGeometryMap.get(predId);
      if (!predTask || !predGeo) continue;

      const predEnd = predTask.end ?? predTask.start;
      if (!predEnd) continue;

      for (const succId of successorIds) {
        const succTask = taskMap.get(succId);
        const succGeo = rowGeometryMap.get(succId);
        if (!succTask || !succGeo) continue;

        const succStart = succTask.start ?? succTask.end;
        if (!succStart) continue;

        const startX = diffDays(timelineStart, predEnd) * dayWidth + dayWidth;
        const startY = predGeo.y + predGeo.height / 2;
        const endX = diffDays(timelineStart, succStart) * dayWidth;
        const endY = succGeo.y + succGeo.height / 2;

        const midX = startX + BEND_OFFSET;

        const d = `M ${String(startX)} ${String(startY)} H ${String(midX)} V ${String(endY)} H ${String(endX)}`;

        result.push({
          key: `${predId}-${succId}`,
          d,
          arrowX: endX,
          arrowY: endY,
        });
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
            stroke="var(--text-secondary)"
            strokeWidth="1.5"
          />
          <polygon
            points={`${String(arrow.arrowX)},${String(arrow.arrowY)} ${String(arrow.arrowX - ARROW_SIZE)},${String(arrow.arrowY - ARROW_SIZE)} ${String(arrow.arrowX - ARROW_SIZE)},${String(arrow.arrowY + ARROW_SIZE)}`}
            fill="var(--text-secondary)"
          />
        </g>
      ))}
    </svg>
  );
}
