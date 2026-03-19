/** @module High-level monday.com API functions — composes client + queries */

import type {
  MondayBoard,
  MondayGroup,
  MondayColumnDef,
  MondayItem,
  MondayRawColumnValue,
} from "../types";
import { mondayFetch, MondayApiError } from "./mondayClient";
import {
  TEST_CONNECTION_QUERY,
  FETCH_BOARDS_QUERY,
  FETCH_BOARD_DATA_QUERY,
  NEXT_ITEMS_PAGE_QUERY,
  FETCH_USERS_QUERY,
  UPDATE_ITEM_MUTATION,
  CREATE_ITEM_MUTATION,
  DELETE_ITEM_MUTATION,
} from "./mondayQueries";
import { logger } from "./logger";

export interface UserInfo {
  id: string;
  name: string;
}

export interface BoardListEntry {
  id: string;
  name: string;
  workspaceName: string;
}

export interface UserDirectoryEntry {
  id: string;
  name: string;
  email: string;
}

// --- Response shapes for type narrowing ---

interface TestConnectionResponse {
  me: { id: string; name: string } | null;
}

interface FetchBoardsResponse {
  boards: Array<{
    id: string;
    name: string;
    workspace: { name: string } | null;
  }>;
}

interface FetchBoardDataResponse {
  boards: Array<{
    id: string;
    name: string;
    groups: MondayGroup[];
    columns: MondayColumnDef[];
    items_page: {
      cursor: string | null;
      items: MondayItem[];
    };
  }>;
}

interface NextItemsPageResponse {
  next_items_page: {
    cursor: string | null;
    items: MondayItem[];
  };
}

interface FetchUsersResponse {
  users: Array<{ id: string; name: string; email: string }>;
}

interface CreateItemResponse {
  create_item: {
    id: string;
    name: string;
    group: { id: string };
    column_values: MondayRawColumnValue[];
  };
}

// --- Public API functions ---

export async function testConnection(token: string): Promise<UserInfo> {
  const data = await mondayFetch<TestConnectionResponse>(
    token,
    TEST_CONNECTION_QUERY
  );

  if (!data.me) {
    throw new MondayApiError("No user data returned", 200, [], false, null);
  }

  logger.info(`Connected as ${data.me.name} (id: ${data.me.id})`);
  return { id: data.me.id, name: data.me.name };
}

export async function fetchBoards(token: string): Promise<BoardListEntry[]> {
  const data = await mondayFetch<FetchBoardsResponse>(
    token,
    FETCH_BOARDS_QUERY
  );

  return data.boards.map((board) => ({
    id: board.id,
    name: board.name,
    workspaceName: board.workspace?.name ?? "Main",
  }));
}

export async function fetchBoardData(
  token: string,
  boardId: string
): Promise<MondayBoard> {
  const data = await mondayFetch<FetchBoardDataResponse>(
    token,
    FETCH_BOARD_DATA_QUERY,
    { boardId: [boardId] }
  );

  const board = data.boards[0];
  if (!board) {
    throw new MondayApiError(
      `Board ${boardId} not found`,
      200,
      [],
      false,
      null
    );
  }

  const allItems: MondayItem[] = [...board.items_page.items];
  let cursor: string | null = board.items_page.cursor;
  let pageCount = 1;

  while (cursor !== null) {
    logger.info(`Fetching items page ${String(++pageCount)}...`);
    const pageData = await mondayFetch<NextItemsPageResponse>(
      token,
      NEXT_ITEMS_PAGE_QUERY,
      { cursor }
    );

    allItems.push(...pageData.next_items_page.items);
    cursor = pageData.next_items_page.cursor;
  }

  logger.info(
    `Loaded board "${board.name}": ${String(allItems.length)} items across ${String(pageCount)} page(s)`
  );

  return {
    id: board.id,
    name: board.name,
    groups: board.groups,
    columns: board.columns,
    items_page: {
      cursor: null,
      items: allItems,
    },
  };
}

export async function fetchUsers(
  token: string
): Promise<Map<string, UserDirectoryEntry>> {
  const data = await mondayFetch<FetchUsersResponse>(
    token,
    FETCH_USERS_QUERY
  );

  const directory = new Map<string, UserDirectoryEntry>();
  for (const user of data.users) {
    directory.set(user.id, {
      id: user.id,
      name: user.name,
      email: user.email,
    });
  }

  logger.info(`Loaded ${String(directory.size)} users`);
  return directory;
}

export async function updateItem(
  token: string,
  boardId: string,
  itemId: string,
  columnValues: string
): Promise<void> {
  await mondayFetch(token, UPDATE_ITEM_MUTATION, {
    boardId,
    itemId,
    columnValues,
  });

  logger.info(`Updated item ${itemId} on board ${boardId}`);
}

export async function createItem(
  token: string,
  boardId: string,
  groupId: string,
  itemName: string
): Promise<MondayItem> {
  const data = await mondayFetch<CreateItemResponse>(
    token,
    CREATE_ITEM_MUTATION,
    { boardId, groupId, itemName }
  );

  const created = data.create_item;
  logger.info(`Created item "${itemName}" (id: ${created.id})`);

  return {
    id: created.id,
    name: created.name,
    group: created.group,
    column_values: created.column_values,
    subitems: [],
  };
}

export async function deleteItem(
  token: string,
  itemId: string
): Promise<void> {
  await mondayFetch(token, DELETE_ITEM_MUTATION, { itemId });
  logger.info(`Deleted item ${itemId}`);
}
