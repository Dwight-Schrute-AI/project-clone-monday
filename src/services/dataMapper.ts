/** @module Bidirectional data mapper between monday.com API shapes and app Task/Column model */

import type {
  Task,
  Column,
  EditorType,
  MondayBoard,
  MondayItem,
  MondayRawColumnValue,
  MondayColumnType,
  MondayColumnValue,
  ColumnOption,
} from "../types";
import { logger } from "./logger";

export interface BoardMappingResult {
  tasks: Task[];
  columns: Column[];
}

// --- Column type mapping ---

const MONDAY_TYPE_TO_EDITOR: Record<MondayColumnType, EditorType> = {
  status: "status",
  date: "date",
  timeline: "date",
  numbers: "number",
  people: "people",
  dependency: "text",
  text: "text",
  long_text: "text",
  dropdown: "dropdown",
  color_picker: "dropdown",
  checkbox: "dropdown",
};

const KNOWN_COLUMN_TYPES = new Set<string>(Object.keys(MONDAY_TYPE_TO_EDITOR));

const DEFAULT_WIDTHS: Record<MondayColumnType, number> = {
  status: 130,
  date: 110,
  timeline: 150,
  numbers: 90,
  people: 130,
  dependency: 120,
  text: 150,
  long_text: 200,
  dropdown: 130,
  color_picker: 90,
  checkbox: 70,
};

// --- Inbound mapping ---

interface SpecialColumns {
  timelineColId: string | null;
  startDateColId: string | null;
  endDateColId: string | null;
  statusColId: string | null;
  peopleColId: string | null;
  dependencyColId: string | null;
  pctColId: string | null;
}

function inferDateRole(title: string): "start" | "end" | null {
  const lower = title.toLowerCase();
  if (/\b(start|begin|from)\b/.test(lower)) return "start";
  if (/\b(end|due|finish|deadline|to)\b/.test(lower)) return "end";
  return null;
}

function parseStatusOptions(settingsStr: string): ColumnOption[] {
  try {
    const settings = JSON.parse(settingsStr) as Record<string, unknown>;
    const labels = settings["labels"] as
      | Record<string, string>
      | undefined;
    const labelColors = settings["labels_colors"] as
      | Record<string, { color: string }>
      | undefined;

    if (!labels) return [];

    return Object.entries(labels)
      .filter(([, label]) => typeof label === "string" && label.length > 0)
      .map(([index, label]) => ({
        label: label as string,
        color: labelColors?.[index]?.color,
      }));
  } catch {
    return [];
  }
}

function parseDropdownOptions(settingsStr: string): ColumnOption[] {
  try {
    const settings = JSON.parse(settingsStr) as Record<string, unknown>;
    const labels = settings["labels"] as
      | Array<{ id: number; name: string }>
      | undefined;

    if (!Array.isArray(labels)) return [];

    return labels.map((item) => ({ label: item.name }));
  } catch {
    return [];
  }
}

function parseColumnValue(
  raw: MondayRawColumnValue
): MondayColumnValue | null {
  if (raw.value === null || raw.value === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.value);
  } catch {
    logger.warn(`Failed to parse column value for ${raw.id}`, raw.value);
    return null;
  }

  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  switch (raw.type) {
    case "status": {
      const label = typeof obj["label"] === "string" ? obj["label"] : "";
      const index = typeof obj["index"] === "number" ? obj["index"] : 0;
      return { type: "status", label, index };
    }
    case "date": {
      const date = typeof obj["date"] === "string" ? obj["date"] : "";
      const time =
        typeof obj["time"] === "string" ? obj["time"] : null;
      return date ? { type: "date", date, time } : null;
    }
    case "timeline": {
      const from = typeof obj["from"] === "string" ? obj["from"] : "";
      const to = typeof obj["to"] === "string" ? obj["to"] : "";
      return from && to ? { type: "timeline", from, to } : null;
    }
    case "numbers": {
      const num =
        typeof obj["number"] === "number" ? obj["number"] : null;
      return { type: "numbers", number: num };
    }
    case "people": {
      const persons = Array.isArray(obj["personsAndTeams"])
        ? (obj["personsAndTeams"] as Array<{
            id: number;
            kind: "person" | "team";
          }>)
        : [];
      return { type: "people", personsAndTeams: persons };
    }
    case "dependency": {
      const ids = Array.isArray(obj["linkedPulseIds"])
        ? (obj["linkedPulseIds"] as Array<{ linkedPulseId: number }>).map(
            (lp) => String(lp.linkedPulseId)
          )
        : [];
      return { type: "dependency", linkedItemIds: ids };
    }
    case "text":
      return { type: "text", text: raw.text ?? "" };
    case "long_text": {
      const text = typeof obj["text"] === "string" ? obj["text"] : (raw.text ?? "");
      return { type: "long_text", text };
    }
    case "dropdown": {
      const labels = Array.isArray(obj["labels"])
        ? (obj["labels"] as string[])
        : [];
      return { type: "dropdown", labels };
    }
    case "checkbox": {
      const checked = obj["checked"] === "true" || obj["checked"] === true;
      return { type: "checkbox", checked };
    }
    default:
      logger.warn(`Unknown column type: ${raw.type}`);
      return null;
  }
}

function identifySpecialColumns(
  columns: MondayBoard["columns"]
): SpecialColumns {
  const result: SpecialColumns = {
    timelineColId: null,
    startDateColId: null,
    endDateColId: null,
    statusColId: null,
    peopleColId: null,
    dependencyColId: null,
    pctColId: null,
  };

  for (const col of columns) {
    if (col.type === "timeline" && !result.timelineColId) {
      result.timelineColId = col.id;
    } else if (col.type === "date" && !result.timelineColId) {
      const role = inferDateRole(col.title);
      if (role === "start" && !result.startDateColId) {
        result.startDateColId = col.id;
      } else if (role === "end" && !result.endDateColId) {
        result.endDateColId = col.id;
      } else if (!result.startDateColId) {
        result.startDateColId = col.id;
      } else if (!result.endDateColId) {
        result.endDateColId = col.id;
      }
    } else if (col.type === "status" && !result.statusColId) {
      result.statusColId = col.id;
    } else if (col.type === "people" && !result.peopleColId) {
      result.peopleColId = col.id;
    } else if (col.type === "dependency" && !result.dependencyColId) {
      result.dependencyColId = col.id;
    } else if (col.type === "numbers" && !result.pctColId) {
      if (/\b(percent|pct|%|complete)\b/i.test(col.title)) {
        result.pctColId = col.id;
      }
    }
  }

  return result;
}

function mapItem(
  item: MondayItem,
  boardId: string,
  groupId: string,
  mondayGroupId: string,
  indent: number,
  isSubitem: boolean,
  special: SpecialColumns
): Task {
  let start: string | null = null;
  let end: string | null = null;
  let status = "";
  let personIds: string[] = [];
  let predecessors: string[] = [];
  let pct = 0;
  const extras: Record<string, unknown> = {};

  for (const raw of item.column_values) {
    const val = parseColumnValue(raw);

    if (raw.id === special.timelineColId && val?.type === "timeline") {
      start = val.from;
      end = val.to;
    } else if (raw.id === special.startDateColId && val?.type === "date") {
      start = val.date;
    } else if (raw.id === special.endDateColId && val?.type === "date") {
      end = val.date;
    } else if (raw.id === special.statusColId && val?.type === "status") {
      status = val.label;
    } else if (raw.id === special.peopleColId && val?.type === "people") {
      personIds = val.personsAndTeams.map((p) => String(p.id));
    } else if (
      raw.id === special.dependencyColId &&
      val?.type === "dependency"
    ) {
      predecessors = val.linkedItemIds.map((id) => `task-${id}`);
    } else if (raw.id === special.pctColId && val?.type === "numbers") {
      pct = val.number ?? 0;
    } else if (val !== null) {
      extras[raw.id] = raw.text ?? "";
    }
  }

  return {
    id: `task-${item.id}`,
    mondayId: item.id,
    mondayBoardId: isSubitem ? (item.board?.id ?? boardId) : boardId,
    name: item.name,
    start,
    end,
    pct,
    status,
    personIds,
    predecessors,
    indent,
    groupId,
    mondayGroupId,
    isGroupRow: false,
    isSubitem,
    extras,
  };
}

export function mapBoardToTasks(
  board: MondayBoard,
  userDirectory: Map<string, { id: string; name: string; email: string }>
): BoardMappingResult {
  void userDirectory;

  const special = identifySpecialColumns(board.columns);

  // Build column definitions
  const appColumns: Column[] = [
    {
      key: "_rowNum",
      label: "#",
      width: 50,
      editable: false,
      editorType: "text",
      mondayColId: null,
      mondayColType: null,
      options: null,
      subitemOptions: null,
      fixed: true,
    },
    {
      key: "_name",
      label: "Task Name",
      width: 250,
      editable: true,
      editorType: "text",
      mondayColId: null,
      mondayColType: null,
      options: null,
      subitemOptions: null,
      fixed: true,
    },
  ];

  for (const col of board.columns) {
    if (col.id.startsWith("__")) continue;
    if (!KNOWN_COLUMN_TYPES.has(col.type)) continue;

    const mondayType = col.type as MondayColumnType;
    const editorType = MONDAY_TYPE_TO_EDITOR[mondayType];

    let options: ColumnOption[] | null = null;
    if (mondayType === "status") {
      options = parseStatusOptions(col.settings_str);
    } else if (mondayType === "dropdown") {
      options = parseDropdownOptions(col.settings_str);
    }

    appColumns.push({
      key: col.id,
      label: col.title,
      width: DEFAULT_WIDTHS[mondayType],
      editable: mondayType !== "dependency",
      editorType,
      mondayColId: col.id,
      mondayColType: mondayType,
      options,
      subitemOptions: null,
      fixed: false,
    });
  }

  // Build task list with group headers
  const tasks: Task[] = [];
  const sortedGroups = [...board.groups].sort((a, b) =>
    a.position.localeCompare(b.position)
  );

  for (const group of sortedGroups) {
    const groupId = `group-${group.id}`;

    tasks.push({
      id: groupId,
      mondayId: "",
      mondayBoardId: board.id,
      name: group.title,
      start: null,
      end: null,
      pct: 0,
      status: "",
      personIds: [],
      predecessors: [],
      indent: 0,
      groupId,
      mondayGroupId: group.id,
      isGroupRow: true,
      isSubitem: false,
      extras: { _groupColor: group.color },
    });

    const groupItems = board.items_page.items.filter(
      (item) => item.group.id === group.id
    );

    for (const item of groupItems) {
      tasks.push(
        mapItem(item, board.id, groupId, group.id, 0, false, special)
      );

      for (const subitem of item.subitems) {
        tasks.push(
          mapItem(subitem, board.id, groupId, group.id, 1, true, special)
        );
      }
    }
  }

  // Collect subitem-specific status options from actual subitem data.
  // Subitems live on a different board with different column IDs, so
  // board.columns[].settings_str only covers parent items. We scan
  // subitem column_values to discover their unique status labels.
  collectSubitemStatusOptions(board, appColumns);

  logger.info(
    `Mapped board: ${String(tasks.length)} tasks, ${String(appColumns.length)} columns`
  );

  return { tasks, columns: appColumns };
}

/**
 * Scans subitem column_values to discover status labels not available
 * in the parent board's column settings. Populates `subitemOptions`
 * on any status-type column where subitem labels differ from parent.
 */
function collectSubitemStatusOptions(
  board: MondayBoard,
  appColumns: Column[],
): void {
  const statusColumns = appColumns.filter((c) => c.mondayColType === "status");
  if (statusColumns.length === 0) return;

  // Collect unique status labels from subitems
  const subitemLabels = new Set<string>();
  for (const item of board.items_page.items) {
    for (const subitem of item.subitems) {
      for (const raw of subitem.column_values) {
        if (raw.type !== "status") continue;
        const val = parseColumnValue(raw);
        if (val?.type === "status" && val.label) {
          subitemLabels.add(val.label);
        }
      }
    }
  }

  if (subitemLabels.size === 0) return;

  // Build subitem options from discovered labels
  const subOpts: ColumnOption[] = [...subitemLabels]
    .sort()
    .map((label) => ({ label }));

  for (const col of statusColumns) {
    col.subitemOptions = subOpts;
  }
}

// --- Outbound mapping ---

export function mapFieldToMondayValue(
  fieldKey: string,
  value: unknown,
  column: Column,
  task: Task
): string {
  const colId = column.mondayColId;
  if (!colId) {
    throw new Error(`Column "${column.key}" has no monday.com column ID`);
  }

  const colValue = buildColumnValue(fieldKey, value, column, task);
  return JSON.stringify({ [colId]: colValue });
}

function buildColumnValue(
  fieldKey: string,
  value: unknown,
  column: Column,
  task: Task
): unknown {
  switch (column.mondayColType) {
    case "status":
      return { label: String(value) };

    case "date":
      return value ? { date: String(value) } : "";

    case "timeline": {
      const isStart = fieldKey === "start";
      const from = isStart ? String(value) : (task.start ?? String(value));
      const to = isStart ? (task.end ?? String(value)) : String(value);
      return { from, to };
    }

    case "numbers":
      return value === null || value === "" ? "" : Number(value);

    case "people": {
      const ids = Array.isArray(value) ? value : [];
      return {
        personsAndTeams: ids.map((id: unknown) => ({
          id: Number(id),
          kind: "person",
        })),
      };
    }

    case "text":
      return String(value ?? "");

    case "long_text":
      return { text: String(value ?? "") };

    case "dropdown": {
      const labels = Array.isArray(value) ? value : [String(value)];
      return { labels };
    }

    case "checkbox":
      return { checked: value ? "true" : "false" };

    case "color_picker":
      return { color: String(value ?? "") };

    case "dependency": {
      const itemIds = Array.isArray(value) ? value : [];
      return {
        linkedPulseIds: itemIds.map((id: unknown) => ({
          linkedPulseId: Number(String(id).replace("task-", "")),
        })),
      };
    }

    default:
      return String(value ?? "");
  }
}
