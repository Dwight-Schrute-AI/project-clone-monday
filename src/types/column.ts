/** @module Column definition and editor type union */

import type { MondayColumnType } from "./monday";

export type EditorType = "text" | "date" | "number" | "status" | "people" | "dropdown";

export interface Column {
  key: string;
  label: string;
  width: number;
  editable: boolean;
  editorType: EditorType;
  mondayColId: string | null;
  mondayColType: MondayColumnType | null;
  options: ColumnOption[] | null;
  fixed: boolean;
}

export interface ColumnOption {
  label: string;
  color?: string;
}
