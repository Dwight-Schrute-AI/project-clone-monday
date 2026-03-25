/** @module GanttView — wraps SVAR Gantt with monday.com data integration */

import { useMemo, useCallback, useRef } from "react";
import { Gantt } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/style.css";
import { useAppContext } from "../../state/AppContext";
import { taskFieldUpdated } from "../../state/actions";
import { selectVisibleTasks } from "../../state/selectors";
import { tasksToSvar, svarUpdateToApp, resetIdMap } from "../../services/svarAdapter";

/** SVAR zoom/scale presets */
const SCALES_DAY = [
  { unit: "month" as const, step: 1, format: "%F %Y" },
  { unit: "day" as const, step: 1, format: "%j" },
];

const SCALES_WEEK = [
  { unit: "month" as const, step: 1, format: "%F %Y" },
  { unit: "week" as const, step: 1, format: "W%W" },
];

const SCALES_MONTH = [
  { unit: "year" as const, step: 1, format: "%Y" },
  { unit: "month" as const, step: 1, format: "%M" },
];

const SCALE_PRESETS = [SCALES_MONTH, SCALES_MONTH, SCALES_MONTH, SCALES_WEEK, SCALES_DAY];

/** Column configuration for the grid portion */
const COLUMNS = [
  { id: "text", header: "Task Name", flexgrow: 1, width: 250 },
  { id: "start", header: "Start", width: 100 },
  { id: "end", header: "End", width: 100 },
  { id: "duration", header: "Duration", width: 70, align: "center" as const },
  { id: "progress", header: "%", width: 50, align: "center" as const },
];

export function GanttView(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const prevBoardRef = useRef<string | null>(null);

  // Reset ID map when board changes
  if (state.activeBoardId !== prevBoardRef.current) {
    resetIdMap();
    prevBoardRef.current = state.activeBoardId;
  }

  const visibleTasks = useMemo(
    () => selectVisibleTasks(state),
    [state.tasks, state.collapsedGroups, state.collapsedItems, state.departmentFilter, state.columns],
  );

  const { tasks: svarTasks, links: svarLinks } = useMemo(
    () => tasksToSvar(visibleTasks),
    [visibleTasks],
  );

  const scales = SCALE_PRESETS[state.ganttZoom] ?? SCALES_WEEK;

  // Handle SVAR Gantt events for write-back to monday.com
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleInit = useCallback((api: any) => {
    api.on("update-task", (ev: { task?: { id: number; start?: Date; end?: Date; text?: string; progress?: number } }) => {
      if (!ev.task) return;

      const update = svarUpdateToApp(ev.task);
      if (!update) return;

      const existingTask = state.tasks.find((t) => t.id === update.appTaskId);
      if (!existingTask) return;

      for (const field of update.fields) {
        const prevValue = (existingTask as unknown as Record<string, unknown>)[field.key];
        dispatch(taskFieldUpdated(update.appTaskId, field.key, field.value, prevValue));
      }
    });
  }, [dispatch, state.tasks]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Gantt
        tasks={svarTasks}
        links={svarLinks}
        scales={scales}
        columns={COLUMNS}
        init={handleInit}
      />
    </div>
  );
}
