/** @module All GraphQL query and mutation strings for the monday.com API */

export const TEST_CONNECTION_QUERY = `
  query {
    me {
      id
      name
    }
  }
`;

export const FETCH_BOARDS_QUERY = `
  query {
    boards(limit: 200) {
      id
      name
      workspace {
        name
      }
    }
  }
`;

const ITEM_FIELDS = `
  id
  name
  group { id }
  column_values {
    id
    type
    text
    value
  }
`;

const SUBITEM_FIELDS = `
  subitems {
    ${ITEM_FIELDS}
    board { id }
    subitems { id }
  }
`;

export const FETCH_BOARD_DATA_QUERY = `
  query ($boardId: [ID!]!) {
    boards(ids: $boardId) {
      id
      name
      groups {
        id
        title
        color
        position
      }
      columns {
        id
        title
        type
        settings_str
      }
      items_page(limit: 200) {
        cursor
        items {
          ${ITEM_FIELDS}
          ${SUBITEM_FIELDS}
        }
      }
    }
  }
`;

export const NEXT_ITEMS_PAGE_QUERY = `
  query ($cursor: String!) {
    next_items_page(cursor: $cursor, limit: 200) {
      cursor
      items {
        ${ITEM_FIELDS}
        ${SUBITEM_FIELDS}
      }
    }
  }
`;

export const FETCH_USERS_QUERY = `
  query {
    users(limit: 1000) {
      id
      name
      email
    }
  }
`;

export const UPDATE_ITEM_MUTATION = `
  mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
    change_multiple_column_values(
      board_id: $boardId
      item_id: $itemId
      column_values: $columnValues
    ) {
      id
    }
  }
`;

export const CREATE_ITEM_MUTATION = `
  mutation ($boardId: ID!, $groupId: String!, $itemName: String!) {
    create_item(
      board_id: $boardId
      group_id: $groupId
      item_name: $itemName
    ) {
      ${ITEM_FIELDS}
    }
  }
`;

export const DELETE_ITEM_MUTATION = `
  mutation ($itemId: ID!) {
    delete_item(item_id: $itemId) {
      id
    }
  }
`;
