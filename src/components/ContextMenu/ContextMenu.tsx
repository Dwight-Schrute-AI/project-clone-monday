/** @module ContextMenu — right-click menu for grid rows */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

interface ContextMenuProps {
  x: number;
  y: number;
  taskId: string;
  onClose: () => void;
  onOpenDetails: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export function ContextMenu({
  x,
  y,
  taskId,
  onClose,
  onOpenDetails,
  onDeleteTask,
}: ContextMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Clamp to viewport
  const clampedX = Math.min(x, window.innerWidth - 180);
  const clampedY = Math.min(y, window.innerHeight - 120);

  function handleOpenDetails(): void {
    onOpenDetails(taskId);
    onClose();
  }

  function handleDelete(): void {
    onDeleteTask(taskId);
    onClose();
  }

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: clampedX, top: clampedY }}
    >
      <button className={styles.item} onClick={handleOpenDetails} type="button">
        Open Details
      </button>
      <div className={styles.separator} />
      <button
        className={`${styles.item} ${styles.itemDanger}`}
        onClick={handleDelete}
        type="button"
      >
        Delete Task
      </button>
    </div>,
    document.body,
  );
}
