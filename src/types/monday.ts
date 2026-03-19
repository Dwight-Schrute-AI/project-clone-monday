/** @module monday.com API response shapes and column value discriminated union */

export type MondayColumnType =
  | "status"
  | "date"
  | "timeline"
  | "numbers"
  | "people"
  | "dependency"
  | "text"
  | "long_text"
  | "dropdown"
  | "color_picker"
  | "checkbox";

export type MondayColumnValue =
  | { type: "status"; label: string; index: number }
  | { type: "date"; date: string; time: string | null }
  | { type: "timeline"; from: string; to: string }
  | { type: "numbers"; number: number | null }
  | { type: "people"; personsAndTeams: Array<{ id: number; kind: "person" | "team" }> }
  | { type: "dependency"; linkedItemIds: string[] }
  | { type: "text"; text: string }
  | { type: "long_text"; text: string }
  | { type: "dropdown"; labels: string[] }
  | { type: "checkbox"; checked: boolean };

export interface MondayBoard {
  id: string;
  name: string;
  groups: MondayGroup[];
  columns: MondayColumnDef[];
  items_page: MondayItemsPage;
}

export interface MondayGroup {
  id: string;
  title: string;
  color: string;
  position: string;
}

export interface MondayColumnDef {
  id: string;
  title: string;
  type: MondayColumnType;
  settings_str: string;
}

export interface MondayItemsPage {
  cursor: string | null;
  items: MondayItem[];
}

export interface MondayItem {
  id: string;
  name: string;
  board?: { id: string };
  group: { id: string };
  column_values: MondayRawColumnValue[];
  subitems: MondayItem[];
}

export interface MondayRawColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
}
