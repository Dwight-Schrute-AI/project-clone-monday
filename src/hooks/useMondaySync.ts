/** @module useMondaySync — orchestrates write-back, optimistic updates, and rollback */

import { useEffect, useRef } from "react";
import { useAppContext } from "../state/AppContext";
import { writeConfirmed, writeFailed } from "../state/actions";
import { updateItem, updateItemName } from "../services/mondayApi";
import { mapFieldToMondayValue } from "../services/dataMapper";
import { logger } from "../services/logger";
import type { Column, PendingWrite, AppState } from "../types";

const DEBOUNCE_MS = 300;

/**
 * Watches `state.pendingWrites` and fires monday.com API calls for each
 * pending write. Dispatches WRITE_CONFIRMED on success or WRITE_FAILED
 * (with rollback) on failure. Debounces rapid edits to the same field.
 */
export function useMondaySync(): void {
  const { state, dispatch } = useAppContext();

  // Always-current state ref for async callbacks (prevents stale closures)
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  // writeKey → timestamp of the write currently being sent
  const inFlightRef = useRef<Map<string, number>>(new Map());

  // writeKey → active debounce timer
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Process a single pending write: resolve column, call API, dispatch result
  async function processWrite(writeKey: string, pendingWrite: PendingWrite): Promise<void> {
    const [taskId, fieldKey] = parseWriteKey(writeKey);
    if (!taskId || !fieldKey) return;

    inFlightRef.current.set(writeKey, pendingWrite.timestamp);

    try {
      const currentState = stateRef.current;
      const { connection, activeBoardId, columns, tasks } = currentState;

      if (connection.status !== "connected" || !connection.token || !activeBoardId) {
        return;
      }

      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.isGroupRow || !task.mondayId) {
        // Non-writable — clear from pendingWrites without API call
        dispatch(writeConfirmed(taskId, fieldKey));
        return;
      }

      if (fieldKey === "name") {
        await updateItemName(
          connection.token,
          task.mondayBoardId,
          task.mondayId,
          String(pendingWrite.value),
        );
      } else {
        const column = resolveColumnForField(fieldKey, columns);
        if (!column || !column.mondayColId) {
          // No monday.com column mapping — clear silently
          logger.info(`Skipping write for unmapped field "${fieldKey}"`, { taskId });
          dispatch(writeConfirmed(taskId, fieldKey));
          return;
        }

        const columnValues = mapFieldToMondayValue(fieldKey, pendingWrite.value, column, task);
        await updateItem(
          connection.token,
          task.mondayBoardId,
          task.mondayId,
          columnValues,
        );
      }

      // Success — check if a newer edit arrived while we were in-flight
      const latestPending = stateRef.current.pendingWrites.get(writeKey);
      if (latestPending && latestPending.timestamp !== pendingWrite.timestamp) {
        // User edited again during flight — don't confirm, let next cycle handle the newer write
        return;
      }
      dispatch(writeConfirmed(taskId, fieldKey));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Write-back failed for ${writeKey}`, { error: message });
      dispatch(writeFailed(taskId, fieldKey, pendingWrite.previousValue, message));
    } finally {
      inFlightRef.current.delete(writeKey);
    }
  }

  // Main effect: watch pendingWrites and schedule debounced API calls
  useEffect(() => {
    const { pendingWrites } = state;
    const timers = debounceTimersRef.current;

    // Schedule writes for new/updated pending entries
    for (const [writeKey, pendingWrite] of pendingWrites) {
      // Skip if already in-flight
      if (inFlightRef.current.has(writeKey)) continue;

      // Clear existing debounce timer (resets on rapid edits)
      const existing = timers.get(writeKey);
      if (existing !== undefined) {
        clearTimeout(existing);
      }

      // Schedule new debounced write
      const timer = setTimeout(() => {
        timers.delete(writeKey);
        void processWrite(writeKey, pendingWrite);
      }, DEBOUNCE_MS);
      timers.set(writeKey, timer);
    }

    // Clean up timers for keys no longer pending
    for (const [writeKey, timer] of timers) {
      if (!pendingWrites.has(writeKey)) {
        clearTimeout(timer);
        timers.delete(writeKey);
      }
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps — intentionally runs every render

  // Unmount cleanup: cancel all pending timers
  useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) {
        clearTimeout(timer);
      }
      debounceTimersRef.current.clear();
    };
  }, []);
}

// --- Helpers ---

function parseWriteKey(writeKey: string): [string, string] | [null, null] {
  const idx = writeKey.indexOf(":");
  if (idx === -1) return [null, null];
  return [writeKey.slice(0, idx), writeKey.slice(idx + 1)];
}

/**
 * Resolves a field key to its corresponding monday.com Column definition.
 * Mirrors the `identifySpecialColumns` logic in dataMapper.ts.
 */
function resolveColumnForField(
  fieldKey: string,
  columns: Column[],
): Column | null {
  // Extras fields: the fieldKey IS the column key
  const directMatch = columns.find((c) => c.key === fieldKey && c.mondayColId !== null);
  if (directMatch) return directMatch;

  switch (fieldKey) {
    case "start":
    case "end": {
      const timeline = columns.find((c) => c.mondayColType === "timeline");
      if (timeline) return timeline;
      const dateColumns = columns.filter((c) => c.mondayColType === "date");
      if (fieldKey === "start") {
        return dateColumns.find((c) => /\b(start|begin|from)\b/i.test(c.label))
          ?? dateColumns[0] ?? null;
      }
      return dateColumns.find((c) => /\b(end|due|finish|deadline|to)\b/i.test(c.label))
        ?? dateColumns[1] ?? dateColumns[0] ?? null;
    }

    case "status":
      return columns.find((c) => c.mondayColType === "status") ?? null;

    case "pct":
      return columns.find(
        (c) => c.mondayColType === "numbers" && /\b(percent|pct|%|complete)\b/i.test(c.label),
      ) ?? null;

    case "personIds":
      return columns.find((c) => c.mondayColType === "people") ?? null;

    case "predecessors":
      return columns.find((c) => c.mondayColType === "dependency") ?? null;

    case "name":
      return null; // Handled separately via updateItemName

    default:
      return null;
  }
}
