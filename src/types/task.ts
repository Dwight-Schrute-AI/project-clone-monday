/** @module Task and related interfaces for the app data model */

export interface Task {
  id: string;
  mondayId: string;
  mondayBoardId: string;
  name: string;
  start: string | null;
  end: string | null;
  pct: number;
  status: string;
  personIds: string[];
  predecessors: string[];
  /** Maps predecessor task ID → display label from the API (for cross-board refs) */
  predecessorLabels: Record<string, string>;
  indent: number;
  groupId: string;
  mondayGroupId: string;
  isGroupRow: boolean;
  isSubitem: boolean;
  extras: Record<string, unknown>;
  /** Maps field keys (e.g. "status", "personIds") to the actual monday.com column ID for this task's board */
  mondayColMap: Record<string, string>;
}
