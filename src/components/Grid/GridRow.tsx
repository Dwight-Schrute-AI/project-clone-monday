/** @module GridRow — single row: cells, selection, group row handling */

import { useState, useRef } from "react";
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
  onGroupRename?: (groupId: string, newName: string) => void;
  onGroupDragStart?: (groupId: string) => void;
  onGroupDragOver?: (groupId: string) => void;
  onGroupDragEnd?: () => void;
  collapsed?: boolean;
  hasChildren?: boolean;
  onToggleCollapse?: (id: string) => void;
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
  onGroupRename,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDragEnd,
  collapsed,
  hasChildren,
  onToggleCollapse,
}: GridRowProps): React.JSX.Element {
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

    function handleGroupDoubleClick(): void {
      setGroupNameDraft(task.name);
      setEditingGroupName(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }

    function handleGroupRenameCommit(): void {
      const trimmed = groupNameDraft.trim();
      if (trimmed && trimmed !== task.name && onGroupRename) {
        onGroupRename(task.id, trimmed);
      }
      setEditingGroupName(false);
    }

    function handleGroupKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
      if (e.key === "Enter") {
        e.preventDefault();
        handleGroupRenameCommit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingGroupName(false);
      }
    }

    function handleToggleGroup(e: React.MouseEvent): void {
      e.stopPropagation();
      onToggleCollapse?.(task.groupId);
    }

    return (
      <div
        className={styles.groupRow}
        style={{ borderLeft: `3px solid ${groupColor}` }}
        onClick={handleClick}
        draggable
        onDragStart={() => onGroupDragStart?.(task.groupId)}
        onDragOver={(e) => { e.preventDefault(); onGroupDragOver?.(task.groupId); }}
        onDragEnd={() => onGroupDragEnd?.()}
      >
        <span className={styles.dragHandle} aria-label="Drag to reorder">&#x2630;</span>
        <button
          className={styles.collapseToggle}
          onClick={handleToggleGroup}
          aria-label={collapsed ? "Expand group" : "Collapse group"}
        >
          {collapsed ? "\u25B6" : "\u25BC"}
        </button>
        {editingGroupName ? (
          <input
            ref={inputRef}
            className={styles.groupNameInput}
            value={groupNameDraft}
            onChange={(e) => setGroupNameDraft(e.target.value)}
            onBlur={handleGroupRenameCommit}
            onKeyDown={handleGroupKeyDown}
          />
        ) : (
          <span className={styles.groupLabel} onDoubleClick={handleGroupDoubleClick}>{task.name}</span>
        )}
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

  function handleToggleItem(e: React.MouseEvent): void {
    e.stopPropagation();
    onToggleCollapse?.(task.id);
  }

  const showItemToggle = hasChildren && !task.isSubitem;

  return (
    <div className={rowClass} onClick={handleClick} onContextMenu={handleContextMenu}>
      {columns.map((col) => {
        const w = columnWidths.get(col.key) ?? col.width;
        const isNameCol = col.key === "_name";

        if (isNameCol && showItemToggle) {
          // Wrap name cell with collapse toggle for parent items
          const stickyLeft = stickyLeftMap.get(col.key) ?? null;
          return (
            <div
              key={col.key}
              className={`${styles.cellWrapper} ${stickyLeft !== null ? styles.cellWrapperFixed : ""}`}
              style={{
                width: w,
                minWidth: w,
                ...(stickyLeft !== null ? { left: stickyLeft } : {}),
              }}
            >
              <button
                className={styles.itemCollapseToggle}
                onClick={handleToggleItem}
                aria-label={collapsed ? "Expand subitems" : "Collapse subitems"}
              >
                {collapsed ? "\u25B6" : "\u25BC"}
              </button>
              <GridCell
                task={task}
                column={col}
                displayIds={displayIds}
                editing={editingColumnKey === col.key}
                stickyLeft={null}
                width={w - 20}
                onStartEdit={onStartEdit}
                onCommitEdit={onCommitEdit}
                onCancelEdit={onCancelEdit}
              />
            </div>
          );
        }

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
