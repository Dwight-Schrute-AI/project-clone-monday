/** @module DetailDialog — modal showing task details */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useAppContext } from "../../state/AppContext";
import styles from "./DetailDialog.module.css";

interface DetailDialogProps {
  taskId: string;
  onClose: () => void;
}

export function DetailDialog({
  taskId,
  onClose,
}: DetailDialogProps): React.JSX.Element | null {
  const { state } = useAppContext();
  const task = state.tasks.find((t) => t.id === taskId);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); };
  }, [onClose]);

  if (!task) return null;

  const people = task.personIds
    .map((pid) => state.userDirectory.get(pid)?.name ?? pid)
    .join(", ");

  const predecessorNames = task.predecessors
    .map((pid) => {
      const pred = state.tasks.find((t) => t.id === pid);
      return pred ? pred.name : pid;
    })
    .join(", ");

  const dateRange = task.start && task.end
    ? `${task.start} \u2192 ${task.end}`
    : task.start ?? task.end ?? "\u2014";

  const extras = Object.entries(task.extras).filter(
    ([key]) => !key.startsWith("_"),
  );

  function handleBackdropClick(e: React.MouseEvent): void {
    if (e.target === e.currentTarget) onClose();
  }

  return createPortal(
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.dialog} role="dialog" aria-label="Task details">
        <header className={styles.header}>
          <h2 className={styles.title}>{task.name}</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className={styles.body}>
          <DetailField label="Status" value={task.status || "\u2014"} />
          <DetailField label="Dates" value={dateRange} />
          <DetailField label="% Complete" value={`${String(task.pct)}%`} />
          {people && <DetailField label="Assigned" value={people} />}
          {predecessorNames && (
            <DetailField label="Predecessors" value={predecessorNames} />
          )}
          {extras.map(([key, val]) => (
            <DetailField key={key} label={key} value={String(val ?? "\u2014")} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface DetailFieldProps {
  label: string;
  value: string;
}

function DetailField({ label, value }: DetailFieldProps): React.JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value}</span>
    </div>
  );
}
