/** @module Grid — container: header row, scrollable body */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useAppContext } from "../../state/AppContext";
import { taskFieldUpdated, taskDeleted, groupsReordered, groupCollapseToggled, itemCollapseToggled } from "../../state/actions";
import { selectVisibleTasks, selectDisplayIds } from "../../state/selectors";
import { diffDays } from "../../utils/dateUtils";
import type { Column, Task } from "../../types";
import { ColumnHeader } from "./ColumnHeader";
import { GridRow } from "./GridRow";
import { ContextMenu } from "../ContextMenu/ContextMenu";
import { DetailDialog } from "../DetailDialog/DetailDialog";
import styles from "./Grid.module.css";

interface GridProps {
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function Grid({ scrollContainerRef }: GridProps): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const visibleTasks = useMemo(
    () => selectVisibleTasks(state),
    [state.tasks, state.collapsedGroups, state.collapsedItems, state.departmentFilter, state.columns],
  );
  const displayIds = useMemo(
    () => selectDisplayIds(visibleTasks),
    [visibleTasks],
  );
  // Complete display IDs from all tasks — used for dependency cell display
  // so predecessor WBS numbers resolve even if the predecessor is in a collapsed group
  const allDisplayIds = useMemo(
    () => selectDisplayIds(state.tasks),
    [state.tasks],
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    taskId: string;
    columnKey: string;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(
    () => new Map(),
  );
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    taskId: string;
  } | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  // Sync header scrollLeft to body scrollLeft on horizontal scroll
  useEffect(() => {
    const body = scrollContainerRef?.current ?? bodyRef.current;
    if (!body) return;

    function handleScroll(): void {
      if (body) {
        if (headerRef.current) headerRef.current.scrollLeft = body.scrollLeft;
        if (summaryRef.current) summaryRef.current.scrollLeft = body.scrollLeft;
      }
    }

    body.addEventListener("scroll", handleScroll);
    return () => { body.removeEventListener("scroll", handleScroll); };
  }, [scrollContainerRef]);

  const handleSelectRow = useCallback(function handleSelectRow(taskId: string): void {
    setSelectedTaskId(taskId);
  }, []);

  const handleStartEdit = useCallback(function handleStartEdit(
    taskId: string,
    columnKey: string,
  ): void {
    setEditingCell({ taskId, columnKey });
  }, []);

  const handleCommitEdit = useCallback(function handleCommitEdit(
    taskId: string,
    fieldKey: string,
    value: unknown,
    previousValue: unknown,
  ): void {
    dispatch(taskFieldUpdated(taskId, fieldKey, value, previousValue));
    setEditingCell(null);
  }, [dispatch]);

  const handleCancelEdit = useCallback(function handleCancelEdit(): void {
    setEditingCell(null);
  }, []);

  const handleContextMenu = useCallback(function handleContextMenu(
    taskId: string,
    x: number,
    y: number,
  ): void {
    setContextMenu({ x, y, taskId });
  }, []);

  function handleCloseContextMenu(): void {
    setContextMenu(null);
  }

  function handleOpenDetails(taskId: string): void {
    setDetailTaskId(taskId);
  }

  function handleDeleteTask(taskId: string): void {
    dispatch(taskDeleted(taskId));
  }

  function handleCloseDetail(): void {
    setDetailTaskId(null);
  }

  // --- Group rename ---
  const handleGroupRename = useCallback(function handleGroupRename(
    groupTaskId: string,
    newName: string,
  ): void {
    dispatch(taskFieldUpdated(groupTaskId, "name", newName, ""));
  }, [dispatch]);

  // --- Group drag-and-drop reorder ---
  const dragGroupRef = useRef<string | null>(null);

  const handleGroupDragStart = useCallback(function handleGroupDragStart(groupId: string): void {
    dragGroupRef.current = groupId;
  }, []);

  const handleGroupDragOver = useCallback(function handleGroupDragOver(targetGroupId: string): void {
    const sourceGroupId = dragGroupRef.current;
    if (!sourceGroupId || sourceGroupId === targetGroupId) return;

    // Get current group order
    const seen = new Set<string>();
    const groupIds: string[] = [];
    for (const t of state.tasks) {
      if (t.isGroupRow && !seen.has(t.groupId)) {
        seen.add(t.groupId);
        groupIds.push(t.groupId);
      }
    }

    const sourceIdx = groupIds.indexOf(sourceGroupId);
    const targetIdx = groupIds.indexOf(targetGroupId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    // Move source to target position
    groupIds.splice(sourceIdx, 1);
    groupIds.splice(targetIdx, 0, sourceGroupId);

    dispatch(groupsReordered(groupIds));
    dragGroupRef.current = sourceGroupId; // keep tracking
  }, [state.tasks, dispatch]);

  // --- Collapse/expand ---
  const handleToggleGroupCollapse = useCallback(function handleToggleGroupCollapse(groupId: string): void {
    dispatch(groupCollapseToggled(groupId));
  }, [dispatch]);

  const handleToggleItemCollapse = useCallback(function handleToggleItemCollapse(taskId: string): void {
    dispatch(itemCollapseToggled(taskId));
  }, [dispatch]);

  // Compute which parent items have subitems (to show toggle)
  const parentsWithChildren = useMemo(() => {
    const set = new Set<string>();
    let lastParentId: string | null = null;
    for (const task of state.tasks) {
      if (task.isGroupRow) { lastParentId = null; continue; }
      if (!task.isSubitem) { lastParentId = task.id; continue; }
      if (lastParentId) set.add(lastParentId);
    }
    return set;
  }, [state.tasks]);

  const handleColumnResize = useCallback(function handleColumnResize(
    columnKey: string,
    newWidth: number,
  ): void {
    setColumnWidths((prev) => {
      const next = new Map(prev);
      next.set(columnKey, newWidth);
      return next;
    });
  }, []);

  // Compute sticky-left offsets for header fixed columns
  let fixedOffset = 0;
  const headerStickyLeft = new Map<string, number>();
  for (const col of state.columns) {
    if (col.fixed) {
      headerStickyLeft.set(col.key, fixedOffset);
      fixedOffset += columnWidths.get(col.key) ?? col.width;
    }
  }

  // Compute aggregate summaries for numeric/date columns
  const aggregates = useMemo(
    () => computeAggregates(state.tasks, state.columns),
    [state.tasks, state.columns],
  );

  return (
    <div className={styles.grid}>
      <div className={styles.headerRow} ref={headerRef}>
        {state.columns.map((col) => (
          <ColumnHeader
            key={col.key}
            column={col}
            width={columnWidths.get(col.key) ?? col.width}
            stickyLeft={headerStickyLeft.get(col.key) ?? null}
            onResize={handleColumnResize}
          />
        ))}
      </div>

      {aggregates.size > 0 && (
        <div className={styles.summaryRow} ref={summaryRef}>
          {state.columns.map((col) => {
            const w = columnWidths.get(col.key) ?? col.width;
            const agg = aggregates.get(col.key);
            const stickyLeft = headerStickyLeft.get(col.key) ?? null;
            return (
              <div
                key={col.key}
                className={`${styles.summaryCell} ${stickyLeft !== null ? styles.summaryCellFixed : ""}`}
                style={{ width: w, minWidth: w, ...(stickyLeft !== null ? { left: stickyLeft } : {}) }}
              >
                {agg ?? ""}
              </div>
            );
          })}
        </div>
      )}

      <div className={styles.body} ref={scrollContainerRef ?? bodyRef}>
        <div className={styles.bodyInner}>
          {visibleTasks.map((task) => (
            <GridRow
              key={task.id}
              task={task}
              columns={state.columns}
              columnWidths={columnWidths}
              displayIds={displayIds}
              allDisplayIds={allDisplayIds}
              selected={task.id === selectedTaskId}
              editingColumnKey={
                editingCell?.taskId === task.id
                  ? editingCell.columnKey
                  : null
              }
              onSelect={handleSelectRow}
              onStartEdit={handleStartEdit}
              onCommitEdit={handleCommitEdit}
              onCancelEdit={handleCancelEdit}
              onContextMenu={handleContextMenu}
              onGroupRename={handleGroupRename}
              onGroupDragStart={handleGroupDragStart}
              onGroupDragOver={handleGroupDragOver}
              onGroupDragEnd={() => { dragGroupRef.current = null; }}
              collapsed={
                task.isGroupRow
                  ? state.collapsedGroups.has(task.groupId)
                  : state.collapsedItems.has(task.id)
              }
              hasChildren={parentsWithChildren.has(task.id)}
              onToggleCollapse={
                task.isGroupRow
                  ? handleToggleGroupCollapse
                  : handleToggleItemCollapse
              }
            />
          ))}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          taskId={contextMenu.taskId}
          onClose={handleCloseContextMenu}
          onOpenDetails={handleOpenDetails}
          onDeleteTask={handleDeleteTask}
        />
      )}

      {detailTaskId && (
        <DetailDialog taskId={detailTaskId} onClose={handleCloseDetail} />
      )}
    </div>
  );
}

/**
 * Compute aggregate values for the summary row above column headers.
 * Only processes parent items (not group headers or subitems).
 */
function computeAggregates(tasks: Task[], columns: Column[]): Map<string, string> {
  const result = new Map<string, string>();
  const parentTasks = tasks.filter((t) => !t.isGroupRow && !t.isSubitem);
  if (parentTasks.length === 0) return result;

  // Find earliest start and latest end across all parent tasks
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let totalDuration = 0;

  for (const t of parentTasks) {
    if (t.start && (!minDate || t.start < minDate)) minDate = t.start;
    if (t.end && (!maxDate || t.end > maxDate)) maxDate = t.end;
    if (t.start && t.end) {
      const d = diffDays(t.start, t.end);
      if (d > 0) totalDuration += d + 1;
    }
  }

  for (const col of columns) {
    // Timeline column: show date range
    if (col.mondayColType === "timeline") {
      if (minDate && maxDate) {
        result.set(col.key, `${minDate} \u2192 ${maxDate}`);
      }
      continue;
    }

    // Duration column (computed): sum of days
    if (/\bduration\b/i.test(col.label)) {
      result.set(col.key, String(totalDuration));
      continue;
    }

    // Numbers columns: sum values from extras
    if (col.mondayColType === "numbers" || col.editorType === "number") {
      // Budget, Effort Spent, Planned Effort — any numeric column gets summed
      let sum = 0;
      let hasAny = false;
      for (const t of parentTasks) {
        const val = t.extras[col.key];
        if (typeof val === "number") {
          sum += val;
          hasAny = true;
        } else if (typeof val === "string" && val !== "") {
          const n = Number(val);
          if (!isNaN(n)) {
            sum += n;
            hasAny = true;
          }
        }
      }
      if (hasAny) {
        result.set(col.key, sum % 1 === 0 ? String(sum) : sum.toFixed(2));
      }
      continue;
    }
  }

  return result;
}
