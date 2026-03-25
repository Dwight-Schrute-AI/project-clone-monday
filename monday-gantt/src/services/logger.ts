/** @module Structured logging utility — info/warn/error levels, bridges to reducer */

import type { LogEntry } from "../types";

const logStore: LogEntry[] = [];
let idCounter = 0;

/**
 * Optional dispatch function to bridge logger entries into the reducer's
 * state.log (shown in the Log Drawer). Call `logger.setDispatch(dispatch)`
 * once after the reducer is initialized.
 */
let dispatchFn: ((entry: LogEntry) => void) | null = null;

function createEntry(
  level: LogEntry["level"],
  message: string,
  details?: unknown
): LogEntry {
  const entry: LogEntry = {
    id: `log-${String(++idCounter)}`,
    level,
    message,
    timestamp: Date.now(),
    details,
  };
  logStore.push(entry);

  // Write to browser console
  const consoleFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  consoleFn(`[${level.toUpperCase()}] ${message}`, details !== undefined ? details : "");

  // Bridge to reducer (Log Drawer) if dispatch is wired
  if (dispatchFn) {
    dispatchFn(entry);
  }

  return entry;
}

export const logger = {
  info(message: string, details?: unknown): LogEntry {
    return createEntry("info", message, details);
  },
  warn(message: string, details?: unknown): LogEntry {
    return createEntry("warn", message, details);
  },
  error(message: string, details?: unknown): LogEntry {
    return createEntry("error", message, details);
  },
  getEntries(): readonly LogEntry[] {
    return logStore;
  },
  clear(): void {
    logStore.length = 0;
  },
  /** Wire the logger to the app reducer so entries appear in the Log Drawer */
  setDispatch(fn: (entry: LogEntry) => void): void {
    dispatchFn = fn;
  },
} as const;
