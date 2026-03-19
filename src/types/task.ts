/** @module Task and related interfaces for the app data model */

export interface Task {
  id: string;
  mondayId: string;
  name: string;
  start: string | null;
  end: string | null;
  pct: number;
  status: string;
  personIds: string[];
  predecessors: string[];
  indent: number;
  groupId: string;
  mondayGroupId: string;
  isGroupRow: boolean;
  isSubitem: boolean;
  extras: Record<string, unknown>;
}
