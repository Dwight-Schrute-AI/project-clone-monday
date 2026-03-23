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
  dependency: "dependency",
  board_relation: "text",
  text: "text",
  long_text: "text",
  dropdown: "dropdown",
  color_picker: "dropdown",
  checkbox: "dropdown",
};

const KNOWN_COLUMN_TYPES = new Set<string>([
  ...Object.keys(MONDAY_TYPE_TO_EDITOR),
  "color", // monday.com may report status columns as "color" in column_values
]);

/** Column labels to exclude from the grid (case-insensitive match) */
const HIDDEN_COLUMN_LABELS = new Set(["priority"]);

const DEFAULT_WIDTHS: Record<MondayColumnType, number> = {
  status: 130,
  date: 110,
  timeline: 150,
  numbers: 90,
  people: 130,
  dependency: 120,
  board_relation: 120,
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

    // Primary format: labels as { "0": "Label", "1": "Label2", ... }
    const labels = settings["labels"] as
      | Record<string, string>
      | undefined;
    const labelColors = settings["labels_colors"] as
      | Record<string, { color: string }>
      | undefined;

    if (labels && typeof labels === "object" && !Array.isArray(labels)) {
      const result = Object.entries(labels)
        .filter(([, label]) => typeof label === "string" && label.length > 0)
        .map(([index, label]) => ({
          label: label as string,
          color: labelColors?.[index]?.color,
        }));
      if (result.length > 0) return result;
    }

    // Alternate format: labels_positions_v2 as [{ id, title, color, ... }]
    const positionsV2 = settings["labels_positions_v2"] as
      | Array<{ id?: number; title?: string; color?: string }>
      | undefined;
    if (Array.isArray(positionsV2)) {
      const result = positionsV2
        .filter((item) => typeof item.title === "string" && item.title.length > 0)
        .map((item) => ({
          label: item.title!,
          color: item.color,
        }));
      if (result.length > 0) return result;
    }

    return [];
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
    case "status":
    case "color": {
      // monday.com column_values may report type as "color" for status columns
      const label = typeof obj["label"] === "string" && obj["label"].length > 0
        ? obj["label"]
        : (raw.text && raw.text.length > 0 ? raw.text : "");
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
    case "people":
    case "multiple-person": {
      const persons = Array.isArray(obj["personsAndTeams"])
        ? (obj["personsAndTeams"] as Array<{
            id: number;
            kind: "person" | "team";
          }>)
        : [];
      return { type: "people", personsAndTeams: persons };
    }
    case "dependency":
    case "board_relation": {
      // Both "dependency" and "board_relation" (Connect boards) columns
      // use linkedPulseIds to reference related items
      const ids: string[] = [];
      if (Array.isArray(obj["linkedPulseIds"])) {
        for (const lp of obj["linkedPulseIds"] as Array<Record<string, unknown>>) {
          const pid = lp["linkedPulseId"];
          if (typeof pid === "number") ids.push(String(pid));
          else if (typeof pid === "string" && pid.length > 0) ids.push(pid);
        }
      } else if (Array.isArray(obj["item_ids"])) {
        for (const id of obj["item_ids"] as unknown[]) {
          if (typeof id === "number") ids.push(String(id));
          else if (typeof id === "string" && id.length > 0) ids.push(id);
        }
      }
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
    } else if ((col.type === "status" || col.type === "color") && !result.statusColId) {
      result.statusColId = col.id;
    } else if (col.type === "people" && !result.peopleColId) {
      result.peopleColId = col.id;
    } else if (col.type === "dependency" && !result.dependencyColId) {
      // Only true dependency columns map to task.predecessors (intra-board).
      // board_relation columns are cross-board links stored in extras.
      result.dependencyColId = col.id;
    } else if (col.type === "numbers" && !result.pctColId) {
      if (/\b(percent|pct|%|complete)\b/i.test(col.title)) {
        result.pctColId = col.id;
      }
    }
  }

  // Log every column definition for diagnostics
  for (const col of columns) {
    logger.info(`[COL-DEF] id="${col.id}" title="${col.title}" type="${col.type}"`);
  }

  logger.info(`[DEP] Special columns identified: ${JSON.stringify({
    timeline: result.timelineColId,
    startDate: result.startDateColId,
    endDate: result.endDateColId,
    status: result.statusColId,
    people: result.peopleColId,
    dependency: result.dependencyColId,
    pct: result.pctColId,
  })}`);

  if (!result.dependencyColId) {
    logger.warn(`[DEP] No dependency column found! Column types present: ${columns.map((c) => `${c.id}:${c.type}`).join(", ")}`);
  }

  return result;
}

/**
 * Extracts linked item IDs from a dependency/board_relation column value.
 * Tries multiple approaches in order of preference:
 * 1. linked_item_ids from GraphQL inline fragment (2024-01+ API)
 * 2. linkedPulseIds from raw.value JSON (legacy API)
 * 3. item_ids from raw.value JSON (alternate format)
 * 4. Comma-separated numeric IDs from raw.text (last resort)
 */
function parseDependencyIds(raw: MondayRawColumnValue): string[] {
  // Approach 1: linked_item_ids from inline fragment (modern API)
  if (Array.isArray(raw.linked_item_ids) && raw.linked_item_ids.length > 0) {
    return raw.linked_item_ids.map(String);
  }

  // Approach 2+3: Parse from raw.value JSON (legacy API)
  if (raw.value) {
    try {
      const parsed = JSON.parse(raw.value) as unknown;
      if (parsed !== null && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;

        // Standard format: {"linkedPulseIds":[{"linkedPulseId":12345}]}
        if (Array.isArray(obj["linkedPulseIds"])) {
          const ids = (obj["linkedPulseIds"] as Array<Record<string, unknown>>)
            .map((lp) => {
              const id = lp["linkedPulseId"];
              if (typeof id === "number") return String(id);
              if (typeof id === "string" && id.length > 0) return id;
              return null;
            })
            .filter((id): id is string => id !== null);
          if (ids.length > 0) return ids;
        }

        // Alternate format: {"item_ids":[12345, 67890]}
        if (Array.isArray(obj["item_ids"])) {
          const ids = (obj["item_ids"] as unknown[])
            .map((id) => {
              if (typeof id === "number") return String(id);
              if (typeof id === "string" && id.length > 0) return id;
              return null;
            })
            .filter((id): id is string => id !== null);
          if (ids.length > 0) return ids;
        }
      }
    } catch {
      // Fall through
    }
  }

  // Approach 4: display_value or text may contain item names (not IDs)
  // but for board_relation it may contain comma-separated numeric IDs
  const textSource = raw.display_value ?? raw.text;
  if (textSource) {
    const numericIds = textSource
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s));
    if (numericIds.length > 0) return numericIds;
  }

  return [];
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
  const predecessorLabels: Record<string, string> = {};
  let pct = 0;
  const extras: Record<string, unknown> = {};
  const mondayColMap: Record<string, string> = {};

  // For subitems, match columns by TYPE instead of by parent board column ID,
  // since subitems live on a separate board with different column IDs.
  for (const raw of item.column_values) {
    const val = parseColumnValue(raw);

    // Match by column ID for parent items, by column type for subitems
    const matchesSpecial = (specialColId: string | null): boolean =>
      isSubitem ? false : raw.id === specialColId;
    const matchesType = (colType: string): boolean =>
      isSubitem && raw.type === colType;

    if ((matchesSpecial(special.timelineColId) || matchesType("timeline")) && val?.type === "timeline") {
      start = val.from;
      end = val.to;
      mondayColMap["start"] = raw.id;
      mondayColMap["end"] = raw.id;
    } else if ((matchesSpecial(special.startDateColId) || (isSubitem && raw.type === "date" && !start)) && val?.type === "date") {
      start = val.date;
      mondayColMap["start"] = raw.id;
    } else if ((matchesSpecial(special.endDateColId) || (isSubitem && raw.type === "date" && start && !end)) && val?.type === "date") {
      end = val.date;
      mondayColMap["end"] = raw.id;
    } else if (matchesSpecial(special.statusColId) || matchesType("status") || matchesType("color")) {
      // Extract status label: prefer parsed value, fall back to raw.text
      if (val?.type === "status") {
        status = val.label;
      } else if (raw.text && raw.text.length > 0) {
        status = raw.text;
      }
      mondayColMap["status"] = raw.id;
    } else if (matchesSpecial(special.peopleColId) || matchesType("people") || matchesType("multiple-person")) {
      // Extract people: prefer parsed value, fall back to empty
      if (val?.type === "people") {
        personIds = val.personsAndTeams.map((p) => String(p.id));
      }
      mondayColMap["personIds"] = raw.id;
    } else if (matchesSpecial(special.pctColId) && val?.type === "numbers") {
      pct = val.number ?? 0;
      mondayColMap["pct"] = raw.id;
    } else if (val !== null) {
      extras[raw.id] = raw.text ?? "";
    }
  }

  // --- Dedicated dependency pass ---
  // Scan ALL column_values for dependency-shaped data, regardless of type.
  // This runs as a second pass so it cannot be blocked by the else-if chain.
  for (const raw of item.column_values) {
    // Already found dependencies? Skip.
    if (predecessors.length > 0) break;

    // Approach 1: check if this column is an intra-board dependency column.
    // board_relation columns are cross-board links — they don't feed predecessors.
    const isDependencyCol =
      raw.id === special.dependencyColId ||
      raw.type === "dependency";

    // Approach 2: check for linked_item_ids from inline fragment
    const hasLinkedItemIds = Array.isArray(raw.linked_item_ids) && raw.linked_item_ids.length > 0;

    // Approach 3: probe the raw JSON for dependency-shaped data
    let hasDepShape = false;
    if (raw.value) {
      try {
        const probe = JSON.parse(raw.value) as Record<string, unknown>;
        hasDepShape = Array.isArray(probe["linkedPulseIds"]) || Array.isArray(probe["item_ids"]);
      } catch { /* ignore */ }
    }

    if (isDependencyCol || hasLinkedItemIds || hasDepShape) {
      const depIds = parseDependencyIds(raw);
      logger.info(
        `[DEP] item="${item.name}" (${item.id}) col="${raw.id}" type="${raw.type}" ` +
        `isDependencyCol=${String(isDependencyCol)} hasLinkedItemIds=${String(hasLinkedItemIds)} ` +
        `linked_item_ids=${JSON.stringify(raw.linked_item_ids ?? null)} ` +
        `display_value=${raw.display_value ?? "null"} ` +
        `raw.value=${raw.value ?? "null"} raw.text=${raw.text ?? "null"} ` +
        `parsedIds=[${depIds.join(",")}]`
      );
      if (depIds.length > 0) {
        predecessors = depIds.map((id) => `task-${id}`);
        mondayColMap["predecessors"] = raw.id;
        // Store display labels from API for cross-board predecessor display
        const displayVal = raw.display_value ?? raw.text;
        if (displayVal && depIds.length > 0) {
          const labels = displayVal.split(",").map((s) => s.trim());
          for (let i = 0; i < depIds.length; i++) {
            const label = labels[i];
            if (label && label.length > 0) {
              predecessorLabels[`task-${depIds[i]}`] = label;
            }
          }
        }
      }
    }
  }

  // Log items that HAVE a dependency column but produced no predecessors
  if (predecessors.length === 0 && special.dependencyColId) {
    const depRaw = item.column_values.find((r) => r.id === special.dependencyColId);
    if (depRaw) {
      logger.warn(
        `[DEP] item="${item.name}" (${item.id}) has dependency column ` +
        `"${depRaw.id}" (type="${depRaw.type}") but no predecessors extracted. ` +
        `raw.value=${depRaw.value ?? "null"} raw.text=${depRaw.text ?? "null"}`
      );
    }
  }

  // For parent items, populate mondayColMap from special columns
  if (!isSubitem) {
    if (special.timelineColId) { mondayColMap["start"] = special.timelineColId; mondayColMap["end"] = special.timelineColId; }
    if (special.startDateColId) mondayColMap["start"] = special.startDateColId;
    if (special.endDateColId) mondayColMap["end"] = special.endDateColId;
    if (special.statusColId) mondayColMap["status"] = special.statusColId;
    if (special.peopleColId) mondayColMap["personIds"] = special.peopleColId;
    if (special.dependencyColId) mondayColMap["predecessors"] = special.dependencyColId;
    if (special.pctColId) mondayColMap["pct"] = special.pctColId;
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
    predecessorLabels,
    indent,
    groupId,
    mondayGroupId,
    isGroupRow: false,
    isSubitem,
    extras,
    mondayColMap,
  };
}

export function mapBoardToTasks(
  board: MondayBoard,
  userDirectory: Map<string, { id: string; name: string; email: string }>
): BoardMappingResult {
  void userDirectory;

  const special = identifySpecialColumns(board.columns);

  // Log all column types for diagnostics
  const colSummary = board.columns.map((c) => `${c.title}(${c.type})`).join(", ");
  logger.info(`Board columns: ${colSummary}`);

  // Dump first item's column_values for dependency debugging
  const firstItem = board.items_page.items[0];
  if (firstItem) {
    logger.info(`[DEP] First item "${firstItem.name}" (${firstItem.id}) has ${String(firstItem.column_values.length)} column_values:`);
    for (const cv of firstItem.column_values) {
      const hasLinkedPulse = cv.value?.includes("linkedPulseIds") ?? false;
      const hasItemIds = cv.value?.includes("item_ids") ?? false;
      logger.info(
        `[DEP]   col="${cv.id}" type="${cv.type}" text="${cv.text ?? ""}" ` +
        `hasLinkedPulse=${String(hasLinkedPulse)} hasItemIds=${String(hasItemIds)} ` +
        `value=${cv.value ?? "null"}`
      );
    }
  }

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
    if (HIDDEN_COLUMN_LABELS.has(col.title.toLowerCase())) continue;

    // Normalize monday.com internal type names to our MondayColumnType
    const mondayType = (col.type === "color" ? "status" : col.type) as MondayColumnType;
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
      editable: true,
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
      predecessorLabels: {},
      indent: 0,
      groupId,
      mondayGroupId: group.id,
      isGroupRow: true,
      isSubitem: false,
      extras: { _groupColor: group.color },
      mondayColMap: {},
    });

    const groupItems = board.items_page.items.filter(
      (item) => item.group.id === group.id
    );

    // Map parent items with their subitems
    const parentTasks: Array<{ parent: Task; children: Task[] }> = [];
    for (const item of groupItems) {
      const parent = mapItem(item, board.id, groupId, group.id, 0, false, special);
      const children = item.subitems.map((sub) =>
        mapItem(sub, board.id, groupId, group.id, 1, true, special)
      );
      parentTasks.push({ parent, children });
    }

    // Sort parent items by start date ascending (nulls last)
    parentTasks.sort((a, b) => {
      const aDate = a.parent.start ?? a.parent.end;
      const bDate = b.parent.start ?? b.parent.end;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.localeCompare(bDate);
    });

    for (const { parent, children } of parentTasks) {
      tasks.push(parent);
      tasks.push(...children);
    }
  }

  // If settings_str parsing failed to produce options, fall back to
  // scanning actual item data for unique status labels.
  backfillStatusOptionsFromData(board, appColumns);

  // Collect subitem-specific status options from actual subitem data.
  // Subitems live on a different board with different column IDs, so
  // board.columns[].settings_str only covers parent items. We scan
  // subitem column_values to discover their unique status labels.
  collectSubitemStatusOptions(board, appColumns);

  const tasksWithDeps = tasks.filter((t) => t.predecessors.length > 0);
  const statusCol = appColumns.find((c) => c.mondayColType === "status");
  logger.info(
    `Mapped board: ${String(tasks.length)} tasks, ${String(appColumns.length)} columns, ` +
    `${String(tasksWithDeps.length)} with dependencies, ` +
    `status options: ${String(statusCol?.options?.length ?? 0)} parent / ${String(statusCol?.subitemOptions?.length ?? 0)} subitem`
  );

  return { tasks, columns: appColumns };
}

/**
 * Backfills column.options for status columns where parseStatusOptions
 * returned empty (settings_str format not recognized). Scans parent item
 * column_values to discover unique status labels from actual data.
 */
function backfillStatusOptionsFromData(
  board: MondayBoard,
  appColumns: Column[],
): void {
  const emptyStatusCols = appColumns.filter(
    (c) => c.mondayColType === "status" && (!c.options || c.options.length === 0),
  );
  if (emptyStatusCols.length === 0) return;

  const colIdSet = new Set(emptyStatusCols.map((c) => c.mondayColId));
  const labelsPerCol = new Map<string, Set<string>>();

  for (const item of board.items_page.items) {
    for (const raw of item.column_values) {
      if (!colIdSet.has(raw.id)) continue;

      // Try parsed value first, fall back to raw.text for the label
      let label: string | null = null;
      const val = parseColumnValue(raw);
      if (val?.type === "status" && val.label) {
        label = val.label;
      } else if (raw.text && raw.text.length > 0 && raw.text !== "0") {
        label = raw.text;
      }

      if (label) {
        let set = labelsPerCol.get(raw.id);
        if (!set) {
          set = new Set();
          labelsPerCol.set(raw.id, set);
        }
        set.add(label);
      }
    }
  }

  if (labelsPerCol.size > 0) {
    logger.info(`Backfilled status options from item data for ${String(labelsPerCol.size)} column(s)`);
  }

  for (const col of emptyStatusCols) {
    const labels = labelsPerCol.get(col.mondayColId!);
    if (labels && labels.size > 0) {
      col.options = [...labels].sort().map((label) => ({ label }));
    }
  }
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
        } else if (raw.text && raw.text.length > 0 && raw.text !== "0") {
          subitemLabels.add(raw.text);
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

    case "dependency":
    case "board_relation": {
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
