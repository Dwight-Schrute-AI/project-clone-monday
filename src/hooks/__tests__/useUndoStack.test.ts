// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndoStack } from "../useUndoStack";
import type { AppAction } from "../../types";

describe("useUndoStack", () => {
  let mockDispatch: Mock<(action: AppAction) => void>;

  beforeEach(() => {
    mockDispatch = vi.fn();
  });

  function setup(): { wrappedDispatch: React.Dispatch<AppAction> } {
    const { result } = renderHook(() => useUndoStack(mockDispatch));
    return { wrappedDispatch: result.current };
  }

  it("passes through TASK_FIELD_UPDATED to original dispatch", () => {
    const { wrappedDispatch } = setup();
    const action: AppAction = {
      type: "TASK_FIELD_UPDATED",
      taskId: "t1",
      fieldKey: "name",
      value: "New",
      previousValue: "Old",
    };
    act(() => { wrappedDispatch(action); });
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it("passes through non-edit actions without recording", () => {
    const { wrappedDispatch } = setup();
    const action: AppAction = { type: "THEME_TOGGLED" };
    act(() => { wrappedDispatch(action); });
    expect(mockDispatch).toHaveBeenCalledWith(action);
  });

  it("Ctrl+Z dispatches undo with swapped values", () => {
    const { wrappedDispatch } = setup();

    act(() => {
      wrappedDispatch({
        type: "TASK_FIELD_UPDATED",
        taskId: "t1",
        fieldKey: "name",
        value: "New",
        previousValue: "Old",
      });
    });

    mockDispatch.mockClear();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
      );
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: "TASK_FIELD_UPDATED",
      taskId: "t1",
      fieldKey: "name",
      value: "Old",
      previousValue: "New",
    });
  });

  it("Ctrl+Shift+Z redoes an undone edit", () => {
    const { wrappedDispatch } = setup();

    act(() => {
      wrappedDispatch({
        type: "TASK_FIELD_UPDATED",
        taskId: "t1",
        fieldKey: "name",
        value: "New",
        previousValue: "Old",
      });
    });

    // Undo
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
      );
    });

    mockDispatch.mockClear();

    // Redo
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }),
      );
    });

    expect(mockDispatch).toHaveBeenCalledWith({
      type: "TASK_FIELD_UPDATED",
      taskId: "t1",
      fieldKey: "name",
      value: "New",
      previousValue: "Old",
    });
  });

  it("Ctrl+Z with empty stack does nothing", () => {
    setup();
    mockDispatch.mockClear();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
      );
    });

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("BOARD_DATA_LOADED clears undo stack", () => {
    const { wrappedDispatch } = setup();

    act(() => {
      wrappedDispatch({
        type: "TASK_FIELD_UPDATED",
        taskId: "t1",
        fieldKey: "name",
        value: "New",
        previousValue: "Old",
      });
    });

    act(() => {
      wrappedDispatch({
        type: "BOARD_DATA_LOADED",
        tasks: [],
        columns: [],
        boardId: "b2",
      });
    });

    mockDispatch.mockClear();

    // Undo should do nothing — stack was cleared
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
      );
    });

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("new edit clears redo stack", () => {
    const { wrappedDispatch } = setup();

    // Edit 1
    act(() => {
      wrappedDispatch({
        type: "TASK_FIELD_UPDATED",
        taskId: "t1",
        fieldKey: "name",
        value: "Edit1",
        previousValue: "Original",
      });
    });

    // Undo Edit 1
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
      );
    });

    // New edit — should clear redo stack
    act(() => {
      wrappedDispatch({
        type: "TASK_FIELD_UPDATED",
        taskId: "t1",
        fieldKey: "name",
        value: "Edit2",
        previousValue: "Original",
      });
    });

    mockDispatch.mockClear();

    // Redo should do nothing — redo stack was cleared by new edit
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }),
      );
    });

    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
