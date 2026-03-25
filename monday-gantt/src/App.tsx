/** @module App — minimal monday.com connection → SVAR Gantt */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Gantt } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/style.css";
import { testConnection, fetchBoards, fetchBoardData, fetchUsers, updateItem, updateItemName } from "./services/mondayApi";
import { mapBoardToTasks, mapFieldToMondayValue } from "./services/dataMapper";
import { tasksToSvar, svarChangeToApp, resetIdMap } from "./services/svarAdapter";
import { logger } from "./services/logger";
import type { Task, Column, MondayBoard } from "./types";

/** Zoom scale presets for SVAR */
const SCALES = {
  day: [
    { unit: "month" as const, step: 1, format: "%F %Y" },
    { unit: "day" as const, step: 1, format: "%j" },
  ],
  week: [
    { unit: "month" as const, step: 1, format: "%F %Y" },
    { unit: "week" as const, step: 1, format: "Week %W" },
  ],
  month: [
    { unit: "year" as const, step: 1, format: "%Y" },
    { unit: "month" as const, step: 1, format: "%M" },
  ],
};

const GANTT_COLUMNS = [
  { id: "text", header: "Task Name", flexgrow: 1, width: 280 },
  { id: "start", header: "Start", width: 100 },
  { id: "duration", header: "Days", width: 60, align: "center" as const },
  { id: "progress", header: "%", width: 50, align: "center" as const },
];

// ─── Styles ──────────────────────────────────────────────────────

const S = {
  app: { height: "100vh", display: "flex", flexDirection: "column" as const, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#1a1a2e", color: "#e0e0e0" },
  toolbar: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#16213e", borderBottom: "1px solid #2d3a5c", flexShrink: 0 },
  select: { padding: "4px 8px", borderRadius: 4, border: "1px solid #2d3a5c", background: "#1a1a2e", color: "#e0e0e0", fontSize: 13 },
  btn: { padding: "4px 10px", borderRadius: 4, border: "1px solid #2d3a5c", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 },
  ganttWrap: { flex: 1, overflow: "hidden" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column" as const, gap: 16, padding: 32 },
  input: { padding: "8px 12px", borderRadius: 4, border: "1px solid #2d3a5c", background: "#16213e", color: "#e0e0e0", fontSize: 14, width: 400 },
  connectBtn: { padding: "8px 20px", borderRadius: 4, border: "none", background: "#0073ea", color: "#fff", fontSize: 14, cursor: "pointer" },
  error: { color: "#e44258", fontSize: 13 },
  statusDot: { width: 8, height: 8, borderRadius: "50%", background: "#00c875", marginRight: 4, display: "inline-block" },
  statusText: { fontSize: 11, color: "#9ca3af" },
  boardBtn: { display: "block", width: "100%", textAlign: "left" as const, padding: "10px 14px", background: "#16213e", border: "1px solid #2d3a5c", borderRadius: 4, color: "#e0e0e0", cursor: "pointer", fontSize: 13, marginBottom: 4 },
} as const;

// ─── App ─────────────────────────────────────────────────────────

type Screen = "connect" | "pickBoard" | "loading" | "gantt";

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("connect");
  const [token, setToken] = useState(() => localStorage.getItem("monday_token") ?? "");
  const [userName, setUserName] = useState("");
  const [boards, setBoards] = useState<Array<{ id: string; name: string; workspaceName: string }>>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const initRef = useRef(false);

  // ─── Connect ────────
  async function handleConnect(): Promise<void> {
    setError(null);
    try {
      const user = await testConnection(token);
      setUserName(user.name);
      localStorage.setItem("monday_token", token);

      const boardList = await fetchBoards(token);
      // Filter to project boards (T followed by digits)
      setBoards(boardList.filter((b) => /^T\d+/.test(b.name)));
      setScreen("pickBoard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }

  // ─── Load board ─────
  async function handlePickBoard(boardId: string): Promise<void> {
    setScreen("loading");
    setError(null);
    try {
      const [boardData, userDir] = await Promise.all([
        fetchBoardData(token, boardId),
        fetchUsers(token),
      ]);
      const { tasks: t, columns: c } = mapBoardToTasks(boardData, userDir);
      resetIdMap();
      setTasks(t);
      setColumns(c);
      setActiveBoardId(boardId);
      setScreen("gantt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
      setScreen("pickBoard");
    }
  }

  // ─── SVAR data ──────
  const { tasks: svarTasks, links: svarLinks } = useMemo(
    () => tasksToSvar(tasks),
    [tasks],
  );

  // ─── SVAR event handling ─────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleInit = useCallback((api: any) => {
    api.on("update-task", (ev: Record<string, unknown>) => {
      const task = ev["task"] as { id: number; start?: Date; duration?: number; text?: string; progress?: number } | undefined;
      if (!task) return;

      const change = svarChangeToApp(task);
      if (!change) return;

      // Update local state optimistically
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== change.appId) return t;
          const updated = { ...t };
          for (const f of change.fields) {
            if (f.key === "name") updated.name = f.value as string;
            else if (f.key === "start") updated.start = f.value as string;
            else if (f.key === "end") updated.end = f.value as string;
            else if (f.key === "pct") updated.pct = f.value as number;
          }
          return updated;
        }),
      );

      // Write back to monday.com async
      const appTask = tasks.find((t) => t.id === change.appId);
      if (!appTask || !appTask.mondayId) return;

      // Fire-and-forget API updates
      for (const f of change.fields) {
        if (f.key === "name") {
          void updateItemName(token, appTask.mondayBoardId, appTask.mondayId, f.value as string);
        } else {
          const col = columns.find((c) => {
            if (f.key === "start" || f.key === "end") return c.mondayColType === "timeline" || c.mondayColType === "date";
            if (f.key === "pct") return c.mondayColType === "numbers";
            return false;
          });
          if (col?.mondayColId) {
            const json = mapFieldToMondayValue(f.key, f.value, col, appTask);
            void updateItem(token, appTask.mondayBoardId, appTask.mondayId, json);
          }
        }
      }
    });
  }, [token, tasks, columns]);

  // ─── Auto-reconnect on reload ─────
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const saved = localStorage.getItem("monday_token");
    if (saved) {
      setToken(saved);
      void (async () => {
        try {
          const user = await testConnection(saved);
          setUserName(user.name);
          const boardList = await fetchBoards(saved);
          setBoards(boardList.filter((b) => /^T\d+/.test(b.name)));
          setScreen("pickBoard");
        } catch { /* stay on connect screen */ }
      })();
    }
  }, []);

  // ─── Render ─────────

  if (screen === "connect") {
    return (
      <div style={S.center}>
        <h2 style={{ margin: 0 }}>monday-project</h2>
        <p style={{ color: "#9ca3af", margin: 0 }}>Enter your monday.com API token to connect</p>
        <input
          style={S.input}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="monday.com API token"
          onKeyDown={(e) => e.key === "Enter" && void handleConnect()}
        />
        <button style={S.connectBtn} onClick={() => void handleConnect()}>Connect</button>
        {error && <p style={S.error}>{error}</p>}
      </div>
    );
  }

  if (screen === "pickBoard") {
    return (
      <div style={S.center}>
        <h2 style={{ margin: 0 }}>Select a Board</h2>
        <p style={{ color: "#9ca3af", margin: 0 }}>Connected as {userName}</p>
        {error && <p style={S.error}>{error}</p>}
        <div style={{ width: 500, maxHeight: 400, overflow: "auto" }}>
          {boards.map((b) => (
            <button key={b.id} style={S.boardBtn} onClick={() => void handlePickBoard(b.id)}>
              {b.name}
              <span style={{ color: "#6b7280", fontSize: 11, marginLeft: 8 }}>{b.workspaceName}</span>
            </button>
          ))}
          {boards.length === 0 && <p style={{ color: "#6b7280" }}>No project boards found</p>}
        </div>
        <button style={S.btn} onClick={() => { localStorage.removeItem("monday_token"); setScreen("connect"); }}>Disconnect</button>
      </div>
    );
  }

  if (screen === "loading") {
    return (
      <div style={S.center}>
        <p>Loading board data...</p>
      </div>
    );
  }

  // ─── Gantt screen ─────
  const boardName = boards.find((b) => b.id === activeBoardId)?.name ?? "";

  return (
    <div style={S.app}>
      <div style={S.toolbar}>
        <select style={S.select} value={activeBoardId ?? ""} onChange={(e) => void handlePickBoard(e.target.value)}>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select style={S.select} value={zoom} onChange={(e) => setZoom(e.target.value as "day" | "week" | "month")}>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
        <div style={{ flex: 1 }} />
        <span style={S.statusDot} /><span style={S.statusText}>{userName} · {tasks.filter((t) => !t.isGroupRow).length} tasks</span>
        <button style={S.btn} onClick={() => { localStorage.removeItem("monday_token"); setScreen("connect"); }}>Disconnect</button>
      </div>
      <div style={S.ganttWrap}>
        <Gantt
          tasks={svarTasks}
          links={svarLinks}
          scales={SCALES[zoom]}
          columns={GANTT_COLUMNS}
          init={handleInit}
        />
      </div>
    </div>
  );
}
