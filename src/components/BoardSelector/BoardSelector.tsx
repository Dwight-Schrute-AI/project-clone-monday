/** @module BoardSelector — board picker shown when connected but no board loaded */

import { useState, useMemo } from "react";
import { useAppContext } from "../../state/AppContext";
import { boardDataLoaded, usersLoaded, logAdded } from "../../state/actions";
import { fetchBoardData, fetchUsers } from "../../services/mondayApi";
import { mapBoardToTasks } from "../../services/dataMapper";
import { logger } from "../../services/logger";
import styles from "./BoardSelector.module.css";

interface WorkspaceGroup {
  workspaceName: string;
  boards: Array<{ id: string; name: string }>;
}

function groupByWorkspace(
  boards: Array<{ id: string; name: string; workspaceName: string }>,
): WorkspaceGroup[] {
  const map = new Map<string, Array<{ id: string; name: string }>>();

  for (const board of boards) {
    const existing = map.get(board.workspaceName);
    if (existing) {
      existing.push({ id: board.id, name: board.name });
    } else {
      map.set(board.workspaceName, [{ id: board.id, name: board.name }]);
    }
  }

  return Array.from(map.entries()).map(([workspaceName, wsBoards]) => ({
    workspaceName,
    boards: wsBoards,
  }));
}

export function BoardSelector(): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredGroups = useMemo(() => {
    const lower = filter.toLowerCase();
    const filtered = lower
      ? state.boards.filter(
          (b) =>
            b.name.toLowerCase().includes(lower) ||
            b.workspaceName.toLowerCase().includes(lower),
        )
      : state.boards;
    return groupByWorkspace(filtered);
  }, [state.boards, filter]);

  async function handleSelectBoard(boardId: string): Promise<void> {
    const token = state.connection.token;
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const [boardData, userDir] = await Promise.all([
        fetchBoardData(token, boardId),
        fetchUsers(token),
      ]);

      const { tasks, columns } = mapBoardToTasks(boardData, userDir);
      dispatch(usersLoaded(userDir));
      dispatch(boardDataLoaded(tasks, columns, boardId));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load board";
      setError(message);
      logger.error("Board load failed", { boardId, error: message });
      dispatch(
        logAdded({
          id: `log-board-fail-${Date.now()}`,
          level: "error",
          message: `Failed to load board: ${message}`,
          timestamp: Date.now(),
          details: { boardId },
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Select a Board</h2>

      <input
        className={styles.filter}
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search boards\u2026"
      />

      {error && <p className={styles.error}>{error}</p>}

      {loading && <p className={styles.loading}>Loading board data\u2026</p>}

      <div className={styles.list}>
        {filteredGroups.map((group) => (
          <div key={group.workspaceName} className={styles.group}>
            <h3 className={styles.workspaceName}>{group.workspaceName}</h3>
            {group.boards.map((board) => (
              <button
                key={board.id}
                className={styles.boardRow}
                onClick={() => void handleSelectBoard(board.id)}
                disabled={loading}
                type="button"
              >
                {board.name}
              </button>
            ))}
          </div>
        ))}

        {filteredGroups.length === 0 && !loading && (
          <p className={styles.empty}>No boards found</p>
        )}
      </div>
    </div>
  );
}
