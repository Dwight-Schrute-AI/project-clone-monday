/** @module GanttView — wraps SVAR Gantt with monday.com data integration */

import { useMemo, useCallback, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
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

/** Error boundary to catch SVAR Gantt rendering crashes */
class GanttErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Gantt render error:", error, info);
  }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#e44258" }}>
          <h3>Gantt chart failed to render</h3>
          <p>{this.state.error.message}</p>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  const { tasks: svarTasks, links: svarLinks } = useMemo(() => {
    try {
      return tasksToSvar(visibleTasks);
    } catch (err) {
      console.error("svarAdapter.tasksToSvar failed:", err);
      return { tasks: [], links: [] };
    }
  }, [visibleTasks]);

  const scales = SCALE_PRESETS[state.ganttZoom] ?? SCALES_WEEK;

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

  // Don't render Gantt if no data (avoids SVAR crashes with empty arrays)
  if (svarTasks.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-secondary)" }}>
        No tasks to display
      </div>
    );
  }

  return (
    <GanttErrorBoundary>
      <div style={{ width: "100%", height: "100%" }}>
        <Gantt
          tasks={svarTasks}
          links={svarLinks}
          scales={scales}
          columns={COLUMNS}
          init={handleInit}
        />
      </div>
    </GanttErrorBoundary>
  );
}
