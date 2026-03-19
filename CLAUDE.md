# monday-project — CLAUDE.md

> This file is the architectural source of truth for the project.
> Claude Code reads it at the start of every session.
> Update it whenever a significant pattern or decision changes.

---

## What This App Is

A browser-based project management tool that gives monday.com boards an MS Project–style interface: an editable spreadsheet grid on the left, a Gantt chart on the right, with bidirectional sync to monday.com via GraphQL API. Multiple users will use this app against their own monday.com accounts.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Build | Vite | Fast dev server, simple config |
| UI | React 19 (TSX) | Component model fits the split-pane layout |
| Language | TypeScript (strict mode) | Enforced type safety at every data boundary — monday.com API responses, data mapper transforms, reducer actions, component props. Catches mismatched column value shapes at build time instead of runtime. Claude Code writes the types; the human reviews readable interfaces instead of opaque JSDoc comments. |
| Styling | CSS Modules (`.module.css`) | One CSS module per component. No inline styles, no global CSS beyond a single `reset.css` and `tokens.css` for design tokens |
| State | React Context + `useReducer` | One reducer for app-level state (tasks, columns, connection). No external state library |
| HTTP | Native `fetch` | No axios. The monday.com client wraps fetch with retry/error handling |
| Charts | Custom SVG | The Gantt bars, arrows, and timeline are hand-drawn SVG — no charting library |
| Grid | Custom implementation | The spreadsheet grid is custom React — no AG Grid or similar |
| Testing | Vitest + React Testing Library | Unit tests for services and data logic; component tests for critical interactions |

### What We Deliberately Don't Use
- CSS-in-JS or Tailwind (CSS Modules are simpler to reason about and debug)
- External grid/gantt libraries (the tight coupling between grid rows and Gantt bars requires unified control)
- Global state libraries (the data flow is tree-shaped, not graph-shaped — Context + reducer is sufficient)
- `any` type (use `unknown` + narrowing when the shape is truly dynamic; prefer discriminated unions for monday.com column values)

---

## Project Structure

```
monday-project/
├── CLAUDE.md                          # This file — architecture source of truth
├── package.json
├── tsconfig.json                      # Strict mode, no implicit any, path aliases
├── vite.config.ts
├── index.html
├── public/
├── src/
│   ├── main.tsx                       # ReactDOM entry, error boundary wrapper
│   ├── App.tsx                        # Shell: auth, board selection, data loading
│   ├── tokens.css                     # Design tokens (CSS custom properties for theming)
│   ├── reset.css                      # Minimal CSS reset
│   │
│   ├── types/
│   │   ├── task.ts                    # Task, GroupRow, and related interfaces
│   │   ├── column.ts                  # Column definition + editor type union
│   │   ├── monday.ts                  # monday.com API response shapes + column value discriminated union
│   │   ├── state.ts                   # AppState, Action (discriminated union), and selector signatures
│   │   └── index.ts                   # Re-exports all types
│   │
│   ├── services/
│   │   ├── mondayClient.ts            # Low-level GraphQL client (fetch, retry, rate limits)
│   │   ├── mondayQueries.ts           # All GraphQL query/mutation strings as tagged templates
│   │   ├── mondayApi.ts               # High-level API functions (fetchBoard, updateItem, etc.)
│   │   ├── dataMapper.ts              # monday.com <-> app model transformations
│   │   └── logger.ts                  # Structured logging utility (replaces console interception)
│   │
│   ├── state/
│   │   ├── appReducer.ts              # Top-level reducer: tasks, columns, connection, theme
│   │   ├── actions.ts                 # Action creators (types live in types/state.ts)
│   │   └── selectors.ts              # Derived data: visibleTasks, groupBoundaries, dependency graph
│   │
│   ├── components/
│   │   ├── Shell/
│   │   │   ├── Shell.tsx              # Layout frame: toolbar, split pane, status bar, log drawer
│   │   │   └── Shell.module.css
│   │   ├── BoardSelector/
│   │   │   ├── BoardSelector.tsx
│   │   │   └── BoardSelector.module.css
│   │   ├── Settings/
│   │   │   ├── SettingsDialog.tsx     # API token, theme toggle, board config
│   │   │   └── SettingsDialog.module.css
│   │   ├── Grid/
│   │   │   ├── Grid.tsx               # Grid container: header row, body, summary row
│   │   │   ├── GridRow.tsx            # Single row: cells, selection, context menu trigger
│   │   │   ├── GridCell.tsx           # Cell renderer + inline editor dispatch
│   │   │   ├── editors/
│   │   │   │   ├── TextEditor.tsx
│   │   │   │   ├── DateEditor.tsx
│   │   │   │   ├── NumberEditor.tsx
│   │   │   │   ├── StatusEditor.tsx   # Dropdown for status columns
│   │   │   │   ├── PeopleEditor.tsx   # Searchable people picker
│   │   │   │   └── DropdownEditor.tsx # Generic dropdown (dept, priority, etc.)
│   │   │   ├── ColumnHeader.tsx       # Resize handle, drag-to-reorder
│   │   │   └── Grid.module.css
│   │   ├── Gantt/
│   │   │   ├── Gantt.tsx              # Gantt container: time header, bar area, today line
│   │   │   ├── GanttBar.tsx           # Single bar: normal, milestone, summary modes
│   │   │   ├── GanttArrows.tsx        # Dependency arrows (SVG right-angle connectors)
│   │   │   ├── TimeHeader.tsx         # Day/week/month scale header
│   │   │   └── Gantt.module.css
│   │   ├── SplitPane/
│   │   │   ├── SplitPane.tsx          # Draggable vertical splitter
│   │   │   └── SplitPane.module.css
│   │   ├── ContextMenu/
│   │   │   ├── ContextMenu.tsx
│   │   │   └── ContextMenu.module.css
│   │   ├── DetailDialog/
│   │   │   ├── DetailDialog.tsx       # Tabbed modal: Details, Updates, Activity
│   │   │   └── DetailDialog.module.css
│   │   └── common/
│   │       ├── LoadingOverlay.tsx
│   │       ├── ErrorBoundary.tsx      # Catches render errors, shows recovery UI
│   │       └── StatusBar.tsx          # Bottom bar: task counts, budget total, sync status
│   │
│   ├── hooks/
│   │   ├── useScrollSync.ts           # Syncs vertical scroll between grid and Gantt
│   │   ├── useDragResize.ts           # Generic pointer-drag hook (bars, columns, splitter)
│   │   ├── useUndoStack.ts            # Undo/redo with Ctrl+Z / Ctrl+Shift+Z
│   │   └── useMondaySync.ts           # Orchestrates load, write-back, and optimistic updates
│   │
│   └── utils/
│       ├── dateUtils.ts               # Date math: add days, business days, date ranges
│       ├── dependencyGraph.ts         # Build graph, topological sort, cascade logic
│       └── idUtils.ts                 # Hierarchical display IDs (1, 2, 2.1, 2.2, 3)
```

### Structural Rules
- **One component per file.** No co-locating multiple components in a single file.
- **Each component folder** contains a `.tsx` and its `.module.css`. Nothing else unless there's a compelling reason.
- **All types live in `src/types/`.** Components and services import types from there — never define interfaces inline except for component-local state.
- **Services never import from components.** Components import from services, never the reverse.
- **Hooks are generic and reusable.** App-specific orchestration lives in `useMondaySync`, not scattered across components.
- **No file over 300 lines.** If a component approaches this, decompose it. The v1 bug density correlated directly with the 1100-line monolith.
- **No `any`.** Use `unknown` with type narrowing when handling truly dynamic data. Prefer discriminated unions (see Core Data Model below).

---

## Core Data Model

All components work with these two shapes. They are the contract between the service layer and the UI. These interfaces live in `src/types/` and are the single source of truth.

### Task and Column (src/types/task.ts, src/types/column.ts)

```ts
// src/types/task.ts

export interface Task {
  id: string;                    // App-level unique ID (stable across sessions)
  mondayId: string;              // monday.com item ID (string — monday uses large integers)
  name: string;
  start: string | null;          // ISO date string "YYYY-MM-DD" or null
  end: string | null;            // ISO date string "YYYY-MM-DD" or null
  pct: number;                   // Percent complete 0-100
  status: string;                // Status label from monday.com (e.g. "Working on it")
  personIds: string[];           // monday.com user IDs assigned to this task
  predecessors: string[];        // Task IDs this depends on (Finish-to-Start)
  indent: number;                // Hierarchy depth: 0 = top-level, 1 = subitem
  groupId: string;               // App-level group ID
  mondayGroupId: string;         // monday.com group ID
  isGroupRow: boolean;           // True for synthetic group header rows
  isSubitem: boolean;            // True for monday.com subitems
  extras: Record<string, unknown>; // Additional column values (budget, dept, notes, etc.)
}

// src/types/column.ts

export type EditorType = "text" | "date" | "number" | "status" | "people" | "dropdown";

export interface Column {
  key: string;                       // App-level key (used in task.extras)
  label: string;                     // Display name
  width: number;                     // Width in pixels
  editable: boolean;
  editorType: EditorType;
  mondayColId: string | null;        // monday.com column ID (null for computed columns)
  mondayColType: MondayColumnType | null;
  options: ColumnOption[] | null;    // For status/dropdown columns
  fixed: boolean;                    // If true, column doesn't scroll horizontally
}

export interface ColumnOption {
  label: string;
  color?: string;
}
```

### monday.com API Types (src/types/monday.ts)

The monday.com API returns column values in different shapes depending on column type. This is modeled as a **discriminated union** — the most important type safety boundary in the app. If a new column type handler is added to the data mapper but the union isn't updated, the compiler catches it.

```ts
// src/types/monday.ts

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
  group: { id: string };
  column_values: MondayRawColumnValue[];
  subitems: MondayItem[];
}

export interface MondayRawColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;  // JSON string — parsed and narrowed into MondayColumnValue by dataMapper
}
```

### Reducer State and Actions (src/types/state.ts)

```ts
// src/types/state.ts

import type { Task, Column } from "./index";

export interface PendingWrite {
  fieldKey: string;
  value: unknown;
  previousValue: unknown;
  timestamp: number;
}

export interface AppState {
  tasks: Task[];
  columns: Column[];
  connection: {
    status: "disconnected" | "connecting" | "connected" | "error";
    token: string | null;
    userId: string | null;
    userName: string | null;
    error: string | null;
  };
  boards: Array<{ id: string; name: string; workspaceName: string }>;
  activeBoardId: string | null;
  userDirectory: Map<string, { id: string; name: string; email: string }>;
  theme: "light" | "dark";
  pendingWrites: Map<string, PendingWrite>;
  log: LogEntry[];
}

export interface LogEntry {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: number;
  details?: unknown;
}

// Discriminated union for all reducer actions.
// Adding a new action type without handling it in the reducer is a compile error.
export type AppAction =
  | { type: "CONNECTION_START" }
  | { type: "CONNECTION_SUCCESS"; userId: string; userName: string; token: string }
  | { type: "CONNECTION_FAILED"; error: string }
  | { type: "BOARDS_LOADED"; boards: AppState["boards"] }
  | { type: "BOARD_DATA_LOADED"; tasks: Task[]; columns: Column[]; boardId: string }
  | { type: "USERS_LOADED"; userDirectory: AppState["userDirectory"] }
  | { type: "TASK_FIELD_UPDATED"; taskId: string; fieldKey: string; value: unknown; previousValue: unknown }
  | { type: "TASKS_BATCH_UPDATED"; updates: Array<{ taskId: string; fields: Partial<Task> }> }
  | { type: "WRITE_CONFIRMED"; taskId: string; fieldKey: string }
  | { type: "WRITE_FAILED"; taskId: string; fieldKey: string; previousValue: unknown; error: string }
  | { type: "TASK_CREATED"; task: Task }
  | { type: "TASK_DELETED"; taskId: string }
  | { type: "THEME_TOGGLED" }
  | { type: "LOG_ADDED"; entry: LogEntry };
```

### Critical Rule: Identify by ID, Never by Index

The v1 codebase used array indices to correlate visible rows to data, which caused off-by-one bugs when groups were collapsed or filtered. The new codebase identifies everything by `task.id`. Every callback, every update, every selection references a task ID. Array position is only used for pixel-offset rendering, computed fresh on each render via a selector.

---

## State Architecture

### Single Reducer, Dispatched Actions, Derived Selectors

```
App.tsx
  └── useReducer(appReducer, initialState)
        │
        ├── state.tasks[]           — Source of truth for all task data
        ├── state.columns[]         — Column definitions
        ├── state.connection        — { status, token, userId, userName }
        ├── state.boards[]          — Board list for selector
        ├── state.activeBoardId     — Currently loaded board
        ├── state.userDirectory     — Map<userId, {id, name, email}>
        ├── state.theme             — "light" | "dark"
        ├── state.pendingWrites     — Map<taskId, {fieldKey, value, timestamp}>
        └── state.log[]             — Structured log entries
```

### Optimistic Updates with Rollback

This is the most important architectural pattern. When a user edits a cell:

1. **Dispatch immediately** — `dispatch({ type: 'TASK_FIELD_UPDATED', taskId, fieldKey, value, previousValue })`
2. **UI updates instantly** from new state
3. **API write-back fires** asynchronously via `useMondaySync`
4. **On success** — `dispatch({ type: 'WRITE_CONFIRMED', taskId, fieldKey })`
5. **On failure** — `dispatch({ type: 'WRITE_FAILED', taskId, fieldKey, previousValue })` → rolls back the field and surfaces an error via the log/status bar

The `pendingWrites` map tracks in-flight mutations. The UI can show a subtle indicator (e.g., a small dot) on cells with unconfirmed writes. This replaces the v1 pattern of `localEditRef` counters and `commitRef` mutable refs, which were fragile and caused stale closure bugs.

### Derived Data (Selectors)

Selectors in `state/selectors.ts` compute derived data from the reducer state. They are pure functions, called in component render paths. For expensive computations (dependency graph, row pixel offsets), wrap in `useMemo` at the component level.

Key selectors:
- `selectVisibleTasks(state)` — filters by collapsed groups, returns ordered task list
- `selectRowGeometry(visibleTasks)` — computes y-offset for each visible row (accounting for group headers and "add task" rows)
- `selectDependencyGraph(tasks)` — builds adjacency list for arrow rendering and cascade logic
- `selectDisplayIds(visibleTasks)` — computes hierarchical numbering (1, 2, 2.1, 2.2, 3)

---

## monday.com API Integration

### Client Architecture (three-layer)

```
mondayClient.ts     — fetch wrapper: auth header, API-Version header, retry on
                      ComplexityException (back off for retry_in_seconds), retry on
                      network errors (max 3 attempts), rate limit tracking.
                      NEVER swallows errors silently. Always throws or returns
                      a structured error object. Returns typed responses.

mondayQueries.ts    — All GraphQL strings live here as named exports.
                      No query is ever constructed by string concatenation elsewhere.
                      Uses inline fragments for typed column values.

mondayApi.ts        — High-level functions that compose client + queries:
                      testConnection, fetchBoards, fetchBoardData (with full
                      cursor pagination), fetchUsers, updateItem,
                      createItem, deleteItem.
                      Each function has explicit return types (e.g., Promise<Task[]>)
                      and throws typed errors on failure.
```

### Pagination Pattern

monday.com uses cursor-based pagination for items. The `fetchBoardData` function must paginate exhaustively:

```
First request:  boards(ids: [...]) { items_page(limit: 200) { cursor, items {...} } }
Loop:           next_items_page(cursor: $cursor, limit: 200) { cursor, items {...} }
Stop when:      cursor === null
```

### Rate Limits to Respect

- **Complexity budget**: 10,000,000 points/minute (personal tokens)
- **Mutation limit**: 2,000 mutations/minute
- **IP limit**: 5,000 requests/10 seconds
- On `ComplexityException`: read `retry_in_seconds` from error extensions, wait, retry
- Batch field updates: always use `change_multiple_column_values` (one mutation per task, not per field)

### Error Handling Contract

Every API function must:
1. Return a structured result on success
2. Throw a typed error on failure (not return null, not return undefined, not console.log and continue)
3. Include the GraphQL error message and code in thrown errors
4. Log the error via `logger.ts` before throwing

The UI layer catches these errors in `useMondaySync` and dispatches `WRITE_FAILED` actions or shows user-facing error messages. **No API error is ever silently swallowed.**

---

## Data Mapping Rules

`dataMapper.ts` is the boundary between monday.com's data shape and the app's data shape. It is the only file that knows about monday.com column value JSON formats. It accepts `MondayRawColumnValue` objects (with their `value` field as an unparsed JSON string) and returns typed `Task` and `Column` objects. The discriminated `MondayColumnValue` union ensures exhaustive handling — a `switch` on `type` without a `default` case will fail to compile if a new column type is added to the union but not handled here.

### Inbound (monday.com → app)
- `mapBoardToTasks(boardData, userDirectory)` → `{ tasks: Task[], columns: Column[] }`
- Groups become synthetic `isGroupRow: true` entries in the flat task list
- Subitems are placed immediately after their parent, with `indent: 1` and `isSubitem: true`
- Timeline columns map to `start` and `end`; individual Date columns map to `start` or `end` based on column name heuristics (contains "start"/"begin" → start, contains "end"/"due"/"finish" → end)
- Status column → `status`; the first status-type column encountered is used
- People column → `personIds` array; resolved to names via `userDirectory`
- Dependency column → `predecessors` array of monday item IDs
- Numbers column → stored in `extras` under the column key
- All other columns → stored in `extras`

### Outbound (app → monday.com)
- `mapFieldToMondayValue(fieldKey, value, column, task)` → monday.com column_values JSON fragment
- This function returns the JSON string that goes into `change_multiple_column_values`
- It handles the quirks: status takes `{"label": "..."}`, timeline takes `{"from": "...", "to": "..."}`, people takes `{"personsAndTeams": [...]}`

### Column Type Mapping
The v1 used heuristic name matching, which was brittle. The new approach:
1. Use `column.type` from the monday.com API as the primary discriminator
2. Fall back to name-pattern heuristics only when a board has multiple columns of the same type and we need to distinguish (e.g., two date columns — which is start and which is end?)
3. Store the mapping decisions in state so the user can override them in settings if the heuristic is wrong

---

## Theme System

Design tokens are defined in `tokens.css` as CSS custom properties on `:root` (light) and `[data-theme="dark"]` (dark):

```css
:root {
  --bg-primary: #ffffff;
  --bg-surface: #f8f9fa;
  --bg-elevated: #ffffff;
  --text-primary: #1a1a2e;
  --text-secondary: #6b7280;
  --border: #e5e7eb;
  --accent: #0073ea;          /* monday.com blue */
  --accent-hover: #0060c0;
  --gantt-bar: #0073ea;
  --gantt-bar-progress: #00c875;
  --gantt-milestone: #fdab3d;
  --gantt-summary: #6b7280;
  --gantt-weekend: rgba(0,0,0,0.03);
  --gantt-today: #e44258;
  --row-hover: rgba(0,115,234,0.04);
  --row-selected: rgba(0,115,234,0.08);
  /* ... additional tokens as needed */
}

[data-theme="dark"] {
  --bg-primary: #1a1a2e;
  --bg-surface: #16213e;
  /* ... dark overrides */
}
```

Components reference tokens exclusively. No hardcoded colors anywhere in `.module.css` files or JSX.

---

## Scroll Synchronization

The grid body scrolls vertically; the Gantt body scrolls both vertically and horizontally. These must stay synchronized:

- **Vertical sync**: The `useScrollSync` hook connects the grid body's `scrollTop` to the Gantt body's `scrollTop` (and vice versa). Uses `requestAnimationFrame` to debounce, and a flag to prevent circular updates.
- **Horizontal sync (grid only)**: The grid header and grid summary row mirror the grid body's `scrollLeft`. The Gantt has its own independent horizontal scroll.

This is implemented as a hook, not wired ad-hoc inside components.

---

## Dependency Cascade

When a task's end date changes and other tasks depend on it (Finish-to-Start), the downstream tasks must shift. The logic lives in `utils/dependencyGraph.ts`:

1. Build an adjacency list from all tasks' `predecessors` arrays
2. When a task's end date changes, find all direct successors
3. For each successor: if the predecessor's new end date is later than the successor's start date, push the successor's start (and end, preserving duration) forward
4. Recurse through the graph (topological order to avoid cycles)
5. Return the set of all modified tasks so the reducer can batch-update them

This runs synchronously in the reducer (or in a selector that feeds back into a dispatch). Each cascaded task change triggers its own write-back to monday.com.

---

## Module Build Order

Build and test in this sequence — each module depends only on what comes before it:

1. **Project scaffolding** — Vite config, tsconfig.json (strict mode), folder structure, `src/types/` with all interfaces, tokens.css, reset.css, ErrorBoundary, logger
2. **monday.com service layer** — mondayClient, mondayQueries, mondayApi, dataMapper (test against real API with a test board)
3. **State layer** — appReducer, actions, selectors (unit tested with mock data)
4. **Shell + Settings + BoardSelector** — The app frame, token entry, board picker (first end-to-end: enter token → pick board → see raw data in console)
5. **Grid component** — Grid, GridRow, GridCell, editors (render task data in a table; inline editing dispatches to reducer)
6. **Gantt component** — Gantt, GanttBar, TimeHeader, GanttArrows (render bars from task dates; click/drag interactions)
7. **SplitPane + scroll sync** — Wire grid and Gantt side by side with synced scrolling
8. **Write-back + optimistic updates** — useMondaySync hook, pendingWrites, rollback on failure
9. **Dependency cascade** — dependencyGraph utility, wired into reducer
10. **Polish** — ContextMenu, DetailDialog, undo/redo, status bar, loading states

---

## Conventions for Claude Code Sessions

### Starting a Session
1. Read this CLAUDE.md
2. Run `ls src/` and `ls src/types/` to see current state
3. Ask which module we're working on (or read the session prompt)

### Writing Code
- Every new file gets a brief `/** @module */` comment at the top explaining its purpose
- All exported functions have explicit parameter types and return types — no inferred return types on public APIs
- All component props are defined as named interfaces (e.g., `interface GridRowProps`) — no inline object types
- Every error path either throws or dispatches a visible error — never `console.log` and continue
- Prefer early returns over deep nesting
- Prefer named functions over anonymous arrows for event handlers (easier to debug)
- Use `satisfies` for compile-time checks on config objects without widening the type
- Use discriminated unions and exhaustive `switch` statements for column type handling (the compiler enforces completeness)

### Committing
- Each session should end with working, testable code
- Commit message format: `feat(module): description` or `fix(module): description`
- Don't commit commented-out code or TODO placeholders for future modules

### What to Ask When Unsure
- "Does this pattern match what's in CLAUDE.md?" — if not, update CLAUDE.md or change the code
- "Would this break if two users edited the same task simultaneously?" — if yes, rethink
- "What happens if the API call fails?" — if the answer is "nothing visible", that's a bug
