/** @module Structured logging utility — info/warn/error levels, stores LogEntry objects */

import type { LogEntry } from "../types";

const logStore: LogEntry[] = [];
let idCounter = 0;

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

  const consoleFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.info;
  consoleFn(`[${level.toUpperCase()}] ${message}`, details !== undefined ? details : "");

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
} as const;
