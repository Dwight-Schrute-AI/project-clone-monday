/** @module GridCell — cell renderer with inline editor dispatch */

import type { Task, Column } from "../../types";
import { useAppContext } from "../../state/AppContext";
import { getCellValue, getFieldKeyForColumn, formatCellDisplay } from "../../utils/cellValues";
import { TextEditor } from "./editors/TextEditor";
import { DateEditor } from "./editors/DateEditor";
import { NumberEditor } from "./editors/NumberEditor";
import { StatusEditor } from "./editors/StatusEditor";
import { PeopleEditor } from "./editors/PeopleEditor";
import { DropdownEditor } from "./editors/DropdownEditor";
import styles from "./GridCell.module.css";

interface GridCellProps {
  task: Task;
  column: Column;
  displayIds: Map<string, string>;
  editing: boolean;
  stickyLeft: number | null;
  width: number;
  onStartEdit: (taskId: string, columnKey: string) => void;
  onCommitEdit: (taskId: string, fieldKey: string, value: unknown, previousValue: unknown) => void;
  onCancelEdit: () => void;
}

export function GridCell({
  task,
  column,
  displayIds,
  editing,
  stickyLeft,
  width,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
}: GridCellProps): React.JSX.Element {
  const { state } = useAppContext();
  const value = getCellValue(task, column, displayIds);
  const displayText = formatCellDisplay(value, column, state.userDirectory);

  function handleDoubleClick(): void {
    if (column.editable && !task.isGroupRow) {
      onStartEdit(task.id, column.key);
    }
  }

  function handleEditorCommit(newValue: unknown): void {
    const fieldKey = getFieldKeyForColumn(task, column);
    onCommitEdit(task.id, fieldKey, newValue, value);
  }

  const isRowNum = column.key === "_rowNum";
  const classNames = [styles.cell];
  if (stickyLeft !== null) classNames.push(styles.cellFixed);
  if (editing) classNames.push(styles.cellEditing);
  if (isRowNum) classNames.push(styles.cellRowNum);

  const isNameCol = column.key === "_name";
  const indentPx = isNameCol ? task.indent * 20 + 8 : undefined;

  const style: React.CSSProperties = {
    width,
    ...(stickyLeft !== null ? { left: stickyLeft } : {}),
    ...(indentPx !== undefined ? { paddingLeft: indentPx } : {}),
  };

  return (
    <div
      className={classNames.join(" ")}
      style={style}
      onDoubleClick={handleDoubleClick}
    >
      {editing
        ? renderEditor(value, column, handleEditorCommit, onCancelEdit)
        : <span className={styles.cellText}>{displayText}</span>}
    </div>
  );
}

function renderEditor(
  value: unknown,
  column: Column,
  onCommit: (value: unknown) => void,
  onCancel: () => void,
): React.JSX.Element {
  switch (column.editorType) {
    case "text":
      return <TextEditor value={value} column={column} onCommit={onCommit} onCancel={onCancel} />;
    case "date":
      return <DateEditor value={value} column={column} onCommit={onCommit} onCancel={onCancel} />;
    case "number":
      return <NumberEditor value={value} column={column} onCommit={onCommit} onCancel={onCancel} />;
    case "status":
      return <StatusEditor value={value} column={column} onCommit={onCommit} onCancel={onCancel} />;
    case "people":
      return <PeopleEditor value={value} column={column} onCommit={onCommit} onCancel={onCancel} />;
    case "dropdown":
      return <DropdownEditor value={value} column={column} onCommit={onCommit} onCancel={onCancel} />;
  }
}
