/** @module GridRow — single row: cells, selection, group row handling */

import type { Task, Column } from "../../types";
import { GridCell } from "./GridCell";
import styles from "./GridRow.module.css";

interface GridRowProps {
  task: Task;
  columns: Column[];
  columnWidths: Map<string, number>;
  displayIds: Map<string, string>;
  selected: boolean;
  editingColumnKey: string | null;
  onSelect: (taskId: string) => void;
  onStartEdit: (taskId: string, columnKey: string) => void;
  onCommitEdit: (taskId: string, fieldKey: string, value: unknown, previousValue: unknown) => void;
  onCancelEdit: () => void;
  onContextMenu: (taskId: string, x: number, y: number) => void;
}

export function GridRow({
  task,
  columns,
  columnWidths,
  displayIds,
  selected,
  editingColumnKey,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onContextMenu,
}: GridRowProps): React.JSX.Element {
  function handleClick(): void {
    onSelect(task.id);
  }

  function handleContextMenu(e: React.MouseEvent): void {
    if (task.isGroupRow) return;
    e.preventDefault();
    onContextMenu(task.id, e.clientX, e.clientY);
  }

  if (task.isGroupRow) {
    const groupColor = typeof task.extras["_groupColor"] === "string"
      ? task.extras["_groupColor"]
      : "var(--text-secondary)";

    return (
      <div
        className={styles.groupRow}
        style={{ borderLeft: `3px solid ${groupColor}` }}
        onClick={handleClick}
      >
        <span className={styles.groupLabel}>{task.name}</span>
      </div>
    );
  }

  const rowClass = selected
    ? `${styles.row} ${styles.rowSelected}`
    : styles.row;

  // Compute sticky-left offsets for fixed columns
  let fixedOffset = 0;
  const stickyLeftMap = new Map<string, number>();
  for (const col of columns) {
    if (col.fixed) {
      stickyLeftMap.set(col.key, fixedOffset);
      fixedOffset += columnWidths.get(col.key) ?? col.width;
    }
  }

  return (
    <div className={rowClass} onClick={handleClick} onContextMenu={handleContextMenu}>
      {columns.map((col) => {
        const w = columnWidths.get(col.key) ?? col.width;
        return (
          <GridCell
            key={col.key}
            task={task}
            column={col}
            displayIds={displayIds}
            editing={editingColumnKey === col.key}
            stickyLeft={stickyLeftMap.get(col.key) ?? null}
            width={w}
            onStartEdit={onStartEdit}
            onCommitEdit={onCommitEdit}
            onCancelEdit={onCancelEdit}
          />
        );
      })}
    </div>
  );
}
