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

    if (dependencyGraph.size > 0) {
      const sampleTaskIds = Array.from(taskMap.keys()).slice(0, 5);
      logger.info(
        `Dependency graph: ${String(dependencyGraph.size)} predecessor(s), ` +
        `taskMap: ${String(taskMap.size)} entries, ` +
        `sample IDs: [${sampleTaskIds.join(", ")}], ` +
        `graph keys: [${Array.from(dependencyGraph.keys()).join(", ")}]`
      );
    }

    let skippedCrossBoard = 0;
    let skippedMissingGeo = 0;
    let skippedMissingDate = 0;
    const missingPredIds: string[] = [];

    for (const [predId, successorIds] of dependencyGraph) {
      const predTask = taskMap.get(predId);
      if (!predTask) {
        skippedCrossBoard++;
        missingPredIds.push(predId);
        continue;
      }
      const predGeo = rowGeometryMap.get(predId);
      if (!predGeo) { skippedMissingGeo++; continue; }

      const predEnd = predTask.end ?? predTask.start;
      if (!predEnd) { skippedMissingDate++; continue; }

      for (const succId of successorIds) {
        const succTask = taskMap.get(succId);
        if (!succTask) { skippedCrossBoard++; continue; }
        const succGeo = rowGeometryMap.get(succId);
        if (!succGeo) { skippedMissingGeo++; continue; }

        const succStart = succTask.start ?? succTask.end;
        if (!succStart) { skippedMissingDate++; continue; }

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

    if (skippedCrossBoard > 0) {
      logger.info(
        `Dependency arrows: ${String(skippedCrossBoard)} edge(s) skipped — predecessor not in taskMap. ` +
        `Missing IDs: [${missingPredIds.join(", ")}]. ` +
        `taskMap has ${String(taskMap.size)} tasks.`
      );
    }
    if (skippedMissingGeo > 0) {
      logger.warn(`Dependency arrows: ${String(skippedMissingGeo)} edge(s) skipped — task not visible (collapsed group)`);
    }
    if (skippedMissingDate > 0) {
      logger.warn(`Dependency arrows: ${String(skippedMissingDate)} edge(s) skipped — task has no dates`);
    }
    if (result.length > 0) {
      logger.info(`Dependency arrows: rendering ${String(result.length)} arrow(s)`);
      // Log first 3 arrow paths for debugging coordinates
      for (const arrow of result.slice(0, 3)) {
        logger.info(`[ARROW-PATH] key=${arrow.key} d="${arrow.d}" arrowX=${String(arrow.arrowX)} arrowY=${String(arrow.arrowY)}`);
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
            stroke="#e44258"
            strokeWidth="2.5"
          />
          <polygon
            points={`${String(arrow.arrowX)},${String(arrow.arrowY)} ${String(arrow.arrowX - ARROW_SIZE)},${String(arrow.arrowY - ARROW_SIZE)} ${String(arrow.arrowX - ARROW_SIZE)},${String(arrow.arrowY + ARROW_SIZE)}`}
            fill="#e44258"
          />
        </g>
      ))}
    </svg>
  );
}
