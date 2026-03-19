/** @module Grid — container: header row, scrollable body */

import { useState, useMemo, useRef, useCallback } from "react";
import { useAppContext } from "../../state/AppContext";
import { taskFieldUpdated } from "../../state/actions";
import { selectVisibleTasks, selectDisplayIds } from "../../state/selectors";
import { ColumnHeader } from "./ColumnHeader";
import { GridRow } from "./GridRow";
import styles from "./Grid.module.css";

export function Grid(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const bodyRef = useRef<HTMLDivElement>(null);

  const visibleTasks = useMemo(
    () => selectVisibleTasks(state),
    [state],
  );
  const displayIds = useMemo(
    () => selectDisplayIds(visibleTasks),
    [visibleTasks],
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    taskId: string;
    columnKey: string;
  } | null>(null);
  const [columnWidths, setColumnWidths] = useState<Map<string, number>>(
    () => new Map(),
  );

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

  return (
    <div className={styles.grid}>
      <div className={styles.headerRow}>
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

      <div className={styles.body} ref={bodyRef}>
        <div className={styles.bodyInner}>
          {visibleTasks.map((task) => (
            <GridRow
              key={task.id}
              task={task}
              columns={state.columns}
              columnWidths={columnWidths}
              displayIds={displayIds}
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
