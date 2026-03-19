// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createElement } from "react";
import { AppContext } from "../../state/AppContext";
import { useMondaySync } from "../useMondaySync";
import * as mondayApi from "../../services/mondayApi";
import * as dataMapper from "../../services/dataMapper";
import type { AppState, AppAction, PendingWrite } from "../../types";
import type { Task, Column } from "../../types";
import { initialState } from "../../state/appReducer";

// --- Mocks ---

vi.mock("../../services/mondayApi", () => ({
  updateItem: vi.fn().mockResolvedValue(undefined),
  updateItemName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/dataMapper", () => ({
  mapFieldToMondayValue: vi.fn().mockReturnValue('{"status_col":{"label":"Done"}}'),
}));

vi.mock("../../services/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// --- Helpers ---

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    mondayId: "1001",
    mondayBoardId: "board1",
    name: "Test Task",
    start: "2026-03-01",
    end: "2026-03-10",
    pct: 0,
    status: "Working on it",
    personIds: [],
    predecessors: [],
    indent: 0,
    groupId: "g1",
    mondayGroupId: "mg1",
    isGroupRow: false,
    isSubitem: false,
    extras: {},
    ...overrides,
  };
}

function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    key: "status",
    label: "Status",
    width: 120,
    editable: true,
    editorType: "status",
    mondayColId: "status_col",
    mondayColType: "status",
    options: null,
    fixed: false,
    ...overrides,
  };
}

function makePendingWrite(overrides: Partial<PendingWrite> = {}): PendingWrite {
  return {
    fieldKey: "status",
    value: "Done",
    previousValue: "Working on it",
    timestamp: 1000,
    ...overrides,
  };
}

function connectedState(overrides: Partial<AppState> = {}): AppState {
  return {
    ...initialState,
    connection: {
      status: "connected",
      token: "test-token",
      userId: "u1",
      userName: "Test User",
      error: null,
    },
    activeBoardId: "board1",
    tasks: [makeTask()],
    columns: [makeColumn()],
    ...overrides,
  };
}

function renderUseMondaySync(state: AppState, dispatch: React.Dispatch<AppAction>) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(AppContext.Provider, { value: { state, dispatch } }, children);
  }

  return renderHook(() => useMondaySync(), { wrapper: Wrapper });
}

// --- Tests ---

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useMondaySync", () => {
  it("fires API call after debounce and dispatches WRITE_CONFIRMED", async () => {
    const dispatch = vi.fn();
    const pending = new Map([["t1:status", makePendingWrite()]]);
    const state = connectedState({ pendingWrites: pending });

    renderUseMondaySync(state, dispatch);

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mondayApi.updateItem).toHaveBeenCalledWith(
      "test-token",
      "board1",
      "1001",
      '{"status_col":{"label":"Done"}}',
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: "WRITE_CONFIRMED",
      taskId: "t1",
      fieldKey: "status",
    });
  });

  it("debounces rapid edits — only sends final value", async () => {
    const dispatch = vi.fn();
    const pending1 = new Map([
      ["t1:status", makePendingWrite({ value: "First", timestamp: 1000 })],
    ]);
    const state1 = connectedState({ pendingWrites: pending1 });

    const { rerender } = renderUseMondaySync(state1, dispatch);

    // 100ms later, user edits again
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const pending2 = new Map([
      ["t1:status", makePendingWrite({ value: "Second", timestamp: 1100 })],
    ]);
    const state2 = connectedState({ pendingWrites: pending2 });

    rerender(
      createElement(
        AppContext.Provider,
        { value: { state: state2, dispatch } },
        createElement(HookConsumer),
      ),
    );

    // Advance past debounce from second edit
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    // Should only have been called once (the second debounced call)
    expect(mondayApi.updateItem).toHaveBeenCalledTimes(1);
  });

  it("dispatches WRITE_FAILED with previousValue on API error", async () => {
    const dispatch = vi.fn();
    const error = new Error("Network failure");
    vi.mocked(mondayApi.updateItem).mockRejectedValueOnce(error);

    const pending = new Map([["t1:status", makePendingWrite()]]);
    const state = connectedState({ pendingWrites: pending });

    renderUseMondaySync(state, dispatch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "WRITE_FAILED",
      taskId: "t1",
      fieldKey: "status",
      previousValue: "Working on it",
      error: "Network failure",
    });
  });

  it("skips group rows and dispatches WRITE_CONFIRMED immediately", async () => {
    const dispatch = vi.fn();
    const groupTask = makeTask({ isGroupRow: true, mondayId: "" });
    const pending = new Map([["t1:status", makePendingWrite()]]);
    const state = connectedState({ tasks: [groupTask], pendingWrites: pending });

    renderUseMondaySync(state, dispatch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mondayApi.updateItem).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "WRITE_CONFIRMED",
      taskId: "t1",
      fieldKey: "status",
    });
  });

  it("skips fields with no column mapping and dispatches WRITE_CONFIRMED", async () => {
    const dispatch = vi.fn();
    const pending = new Map([["t1:_computed", makePendingWrite({ fieldKey: "_computed" })]]);
    const state = connectedState({
      pendingWrites: pending,
      columns: [makeColumn()], // No column with key "_computed"
    });

    renderUseMondaySync(state, dispatch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mondayApi.updateItem).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "WRITE_CONFIRMED",
      taskId: "t1",
      fieldKey: "_computed",
    });
  });

  it("uses updateItemName for name field instead of updateItem", async () => {
    const dispatch = vi.fn();
    const pending = new Map([
      ["t1:name", makePendingWrite({ fieldKey: "name", value: "New Name" })],
    ]);
    const state = connectedState({ pendingWrites: pending });

    renderUseMondaySync(state, dispatch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mondayApi.updateItemName).toHaveBeenCalledWith(
      "test-token",
      "board1",
      "1001",
      "New Name",
    );
    expect(mondayApi.updateItem).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "WRITE_CONFIRMED",
      taskId: "t1",
      fieldKey: "name",
    });
  });

  it("does not fire API calls when disconnected", async () => {
    const dispatch = vi.fn();
    const pending = new Map([["t1:status", makePendingWrite()]]);
    const state = connectedState({ pendingWrites: pending });
    state.connection = { ...state.connection, status: "disconnected", token: null };

    renderUseMondaySync(state, dispatch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(mondayApi.updateItem).not.toHaveBeenCalled();
  });

  it("resolves start field to timeline column", async () => {
    const dispatch = vi.fn();
    const timelineCol = makeColumn({
      key: "timeline",
      label: "Timeline",
      mondayColId: "timeline_col",
      mondayColType: "timeline",
    });
    const pending = new Map([
      ["t1:start", makePendingWrite({ fieldKey: "start", value: "2026-04-01" })],
    ]);
    const state = connectedState({
      pendingWrites: pending,
      columns: [timelineCol],
    });

    renderUseMondaySync(state, dispatch);

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(dataMapper.mapFieldToMondayValue).toHaveBeenCalledWith(
      "start",
      "2026-04-01",
      timelineCol,
      expect.objectContaining({ id: "t1" }),
    );
  });
});

// Helper component to consume the hook (needed for rerender)
function HookConsumer(): null {
  useMondaySync();
  return null;
}
