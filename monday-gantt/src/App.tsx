/** @module App — monday.com → SVAR Gantt */

import { useState, useMemo, useCallback, useEffect, useRef, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Gantt, Toolbar, Editor, WillowDark } from "@svar-ui/react-gantt";
import "@svar-ui/react-gantt/all.css";
import "./overrides.css";
import { testConnection, fetchBoards, fetchBoardData, fetchUsers, updateItem, updateItemName } from "./services/mondayApi";
import { mapBoardToTasks, mapFieldToMondayValue } from "./services/dataMapper";
import { tasksToSvar, svarChangeToApp, resetIdMap, buildColumnOptions } from "./services/svarAdapter";
import type { Task, Column } from "./types";

// ─── SVAR Config ─────────────────────────────────────────────────

const SCALES_WEEK = [
  { unit: "month" as const, step: 1, format: "%F %Y" },
  { unit: "week" as const, step: 1, format: "Week %W" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDateCell(d: Date | null | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

// ─── Styles ──────────────────────────────────────────────────────

const S = {
  app: { height: "100vh", display: "flex", flexDirection: "column" as const, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: "#1a1a2e", color: "#e0e0e0" },
  toolbar: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#16213e", borderBottom: "1px solid #2d3a5c", flexShrink: 0 },
  select: { padding: "4px 8px", borderRadius: 4, border: "1px solid #2d3a5c", background: "#1a1a2e", color: "#e0e0e0", fontSize: 13 },
  btn: { padding: "4px 10px", borderRadius: 4, border: "1px solid #2d3a5c", background: "none", color: "#9ca3af", cursor: "pointer", fontSize: 12 },
  ganttWrap: { flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" as const },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column" as const, gap: 16, padding: 32 },
  input: { padding: "8px 12px", borderRadius: 4, border: "1px solid #2d3a5c", background: "#16213e", color: "#e0e0e0", fontSize: 14, width: 400 },
  connectBtn: { padding: "8px 20px", borderRadius: 4, border: "none", background: "#0073ea", color: "#fff", fontSize: 14, cursor: "pointer" },
  error: { color: "#e44258", fontSize: 13 },
  statusDot: { width: 8, height: 8, borderRadius: "50%", background: "#00c875", marginRight: 4, display: "inline-block" },
  statusText: { fontSize: 11, color: "#9ca3af" },
  boardBtn: { display: "block", width: "100%", textAlign: "left" as const, padding: "10px 14px", background: "#16213e", border: "1px solid #2d3a5c", borderRadius: 4, color: "#e0e0e0", cursor: "pointer", fontSize: 13, marginBottom: 4 },
} as const;

// ─── Error Boundary ──────────────────────────────────────────────

class GanttErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error): { error: Error } { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo): void { console.error("[GanttErrorBoundary]", error, info); }
  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#e44258", background: "#1a1a2e", height: "100%", overflow: "auto" }}>
          <h3>Gantt chart failed to render</h3>
          <p>{this.state.error.message}</p>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "#9ca3af" }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── App ─────────────────────────────────────────────────────────

type Screen = "connect" | "pickBoard" | "loading" | "gantt";
type UserDir = Map<string, { id: string; name: string; email: string }>;

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>("connect");
  const [token, setToken] = useState(() => localStorage.getItem("monday_token") ?? "");
  const [userName, setUserName] = useState("");
  const [boards, setBoards] = useState<Array<{ id: string; name: string; workspaceName: string }>>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [userDir, setUserDir] = useState<UserDir>(new Map());
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [api, setApi] = useState<any>(null);
  const initRef = useRef(false);

  // ─── Connect ────────
  async function handleConnect(): Promise<void> {
    setError(null);
    try {
      const user = await testConnection(token);
      setUserName(user.name);
      localStorage.setItem("monday_token", token);
      const boardList = await fetchBoards(token);
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
      const [boardData, ud] = await Promise.all([
        fetchBoardData(token, boardId),
        fetchUsers(token),
      ]);
      const { tasks: t, columns: c } = mapBoardToTasks(boardData, ud);
      resetIdMap();
      setTasks(t);
      setColumns(c);
      setUserDir(ud);
      setActiveBoardId(boardId);
      setScreen("gantt");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
      setScreen("pickBoard");
    }
  }

  // ─── SVAR data ──────
  const { tasks: svarTasks, links: svarLinks } = useMemo(
    () => tasksToSvar(tasks, userDir, columns),
    [tasks, userDir, columns],
  );

  // ─── Dynamic column options from monday.com data ──────
  const colOptions = useMemo(
    () => buildColumnOptions(tasks, columns, userDir),
    [tasks, columns, userDir],
  );

  // ─── SVAR grid columns ──────
  const ganttColumns = useMemo(() => [
    { id: "text", header: "Task Name", flexgrow: 1, width: 300, editor: "text" as const },
    { id: "assigned", header: "Owner", width: 160,
      getter: (obj: Record<string, unknown>) => String(obj["assigned"] ?? ""),
      editor: { type: "richselect" as const, config: { options: colOptions.ownerOptions } },
      options: colOptions.ownerOptions,
    },
    { id: "status", header: "Status", width: 130,
      getter: (obj: Record<string, unknown>) => String(obj["status"] ?? ""),
      editor: { type: "richselect" as const, config: { options: colOptions.statusOptions } },
      options: colOptions.statusOptions,
    },
    { id: "startFmt", header: "Start", width: 120,
      getter: (obj: Record<string, unknown>) => String(obj["startFmt"] ?? ""),
    },
    { id: "endFmt", header: "End", width: 120,
      getter: (obj: Record<string, unknown>) => String(obj["endFmt"] ?? ""),
    },
    { id: "duration", header: "Days", width: 60, align: "center" as const, editor: "text" as const },
    { id: "dept", header: "Department", width: 150,
      getter: (obj: Record<string, unknown>) => String(obj["dept"] ?? ""),
      editor: { type: "richselect" as const, config: { options: colOptions.deptOptions } },
      options: colOptions.deptOptions,
    },
    { id: "predecessorNames", header: "Predecessors", width: 200,
      getter: (obj: Record<string, unknown>) => String(obj["predecessorNames"] ?? ""),
    },
  ], [colOptions]);

  // ─── SVAR editor dialog items ──────
  const editorItems = useMemo(() => [
    { key: "text", label: "Name", comp: "text" },
    { key: "assigned", label: "Owner", comp: "select", options: colOptions.ownerOptions },
    { key: "status", label: "Status", comp: "select", options: colOptions.statusOptions },
    { key: "dept", label: "Department", comp: "select", options: colOptions.deptOptions },
    { key: "type", label: "Type", comp: "select", options: [
      { id: "task", label: "Task" }, { id: "milestone", label: "Milestone" },
    ]},
    { key: "start", label: "Start date", comp: "datepicker" },
    { key: "end", label: "End date", comp: "datepicker" },
    { key: "duration", label: "Duration", comp: "counter" },
    { key: "predecessorNames", label: "Predecessors", comp: "text" },
    { key: "progress", label: "Progress", comp: "slider" },
    { key: "details", label: "Description", comp: "textarea" },
  ], [colOptions]);

  // ─── SVAR init — wire up event handlers ─────
  const tokenRef = useRef(token);
  const tasksRef = useRef(tasks);
  const columnsRef = useRef(columns);
  tokenRef.current = token;
  tasksRef.current = tasks;
  columnsRef.current = columns;

  const handleInit = useCallback((ganttApi: unknown) => {
    setApi(ganttApi);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = ganttApi as any;

    a.on("update-task", (ev: { id?: number; task?: Record<string, unknown> }) => {
      const task = ev.task as { id: number; start?: Date; end?: Date; duration?: number; text?: string; progress?: number } | undefined;
      if (!task) return;

      const change = svarChangeToApp(task);
      if (!change) return;

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

      // Write back to monday.com
      const appTask = tasksRef.current.find((t) => t.id === change.appId);
      if (!appTask?.mondayId) return;
      const tok = tokenRef.current;
      const cols = columnsRef.current;

      for (const f of change.fields) {
        if (f.key === "name") {
          void updateItemName(tok, appTask.mondayBoardId, appTask.mondayId, f.value as string);
        } else {
          const col = cols.find((c) => {
            if (f.key === "start" || f.key === "end") return c.mondayColType === "timeline" || c.mondayColType === "date";
            if (f.key === "pct") return c.mondayColType === "numbers";
            return false;
          });
          if (col?.mondayColId) {
            const json = mapFieldToMondayValue(f.key, f.value, col, appTask);
            void updateItem(tok, appTask.mondayBoardId, appTask.mondayId, json);
          }
        }
      }
    });

    a.on("add-task", (ev: { id?: number }) => {
      if (ev.id) a.exec("show-editor", { id: ev.id });
    });
  }, []);

  // ─── Auto-reconnect ─────
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

  // ─── Render: Connect ─────
  if (screen === "connect") {
    return (
      <WillowDark>
        <div style={S.center}>
          <h2 style={{ margin: 0 }}>monday-project</h2>
          <p style={{ color: "#9ca3af", margin: 0 }}>Enter your monday.com API token to connect</p>
          <input style={S.input} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="monday.com API token" onKeyDown={(e) => e.key === "Enter" && void handleConnect()} />
          <button style={S.connectBtn} onClick={() => void handleConnect()}>Connect</button>
          {error && <p style={S.error}>{error}</p>}
        </div>
      </WillowDark>
    );
  }

  if (screen === "pickBoard") {
    return (
      <WillowDark>
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
      </WillowDark>
    );
  }

  if (screen === "loading") {
    return <WillowDark><div style={S.center}><p>Loading board data...</p></div></WillowDark>;
  }

  // ─── Render: Gantt ─────
  return (
    <WillowDark>
      <div style={S.app}>
        <div style={S.toolbar}>
          <select style={S.select} value={activeBoardId ?? ""} onChange={(e) => void handlePickBoard(e.target.value)}>
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <span style={S.statusDot} /><span style={S.statusText}>{userName} · {tasks.filter((t) => !t.isGroupRow).length} tasks</span>
          <button style={S.btn} onClick={() => { localStorage.removeItem("monday_token"); setScreen("connect"); }}>Disconnect</button>
        </div>
        {api && <Toolbar api={api} />}
        <div style={S.ganttWrap}>
          <GanttErrorBoundary>
            <Gantt
              tasks={svarTasks}
              links={svarLinks}
              scales={SCALES_WEEK}
              columns={ganttColumns}
              cellHeight={36}
              cellWidth={100}
              zoom
              init={handleInit}
            />
            {api && <Editor api={api} items={editorItems} />}
          </GanttErrorBoundary>
        </div>
      </div>
    </WillowDark>
  );
}
