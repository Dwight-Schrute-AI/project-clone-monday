/** @module useUndoStack — undo/redo for task field edits via Ctrl+Z / Ctrl+Shift+Z */

import { useRef, useEffect, useCallback } from "react";
import type { AppAction } from "../types";

interface UndoEntry {
  taskId: string;
  fieldKey: string;
  value: unknown;
  previousValue: unknown;
}

/**
 * Wraps a dispatch function to intercept TASK_FIELD_UPDATED actions
 * and maintain undo/redo stacks. Returns an enhanced dispatch.
 *
 * Registers keyboard shortcuts: Ctrl+Z (undo), Ctrl+Shift+Z (redo).
 * Clears stacks on BOARD_DATA_LOADED.
 */
export function useUndoStack(
  dispatch: React.Dispatch<AppAction>,
): React.Dispatch<AppAction> {
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const isUndoRedoRef = useRef(false);

  const wrappedDispatch = useCallback(
    function wrappedDispatch(action: AppAction): void {
      if (action.type === "TASK_FIELD_UPDATED" && !isUndoRedoRef.current) {
        undoStackRef.current.push({
          taskId: action.taskId,
          fieldKey: action.fieldKey,
          value: action.value,
          previousValue: action.previousValue,
        });
        redoStackRef.current = [];
      }

      if (action.type === "BOARD_DATA_LOADED") {
        undoStackRef.current = [];
        redoStackRef.current = [];
      }

      dispatch(action);
    },
    [dispatch],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey;
      const isRedo = (e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey;

      if (!isUndo && !isRedo) return;
      e.preventDefault();

      isUndoRedoRef.current = true;

      if (isUndo) {
        const entry = undoStackRef.current.pop();
        if (entry) {
          redoStackRef.current.push(entry);
          dispatch({
            type: "TASK_FIELD_UPDATED",
            taskId: entry.taskId,
            fieldKey: entry.fieldKey,
            value: entry.previousValue,
            previousValue: entry.value,
          });
        }
      } else {
        const entry = redoStackRef.current.pop();
        if (entry) {
          undoStackRef.current.push(entry);
          dispatch({
            type: "TASK_FIELD_UPDATED",
            taskId: entry.taskId,
            fieldKey: entry.fieldKey,
            value: entry.value,
            previousValue: entry.previousValue,
          });
        }
      }

      isUndoRedoRef.current = false;
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); };
  }, [dispatch]);

  return wrappedDispatch;
}
