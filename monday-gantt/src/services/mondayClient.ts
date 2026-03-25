/** @module Low-level GraphQL client for the monday.com API — fetch, retry, rate limits */

import { logger } from "./logger";

const MONDAY_API_URL = "https://api.monday.com/v2";
const API_VERSION = "2024-10";
const MAX_RETRIES = 3;

export interface GraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

export class MondayApiError extends Error {
  readonly statusCode: number;
  readonly graphqlErrors: ReadonlyArray<GraphQLError>;
  readonly isComplexityError: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    statusCode: number,
    graphqlErrors: ReadonlyArray<GraphQLError>,
    isComplexityError: boolean,
    retryAfterSeconds: number | null
  ) {
    super(message);
    this.name = "MondayApiError";
    this.statusCode = statusCode;
    this.graphqlErrors = graphqlErrors;
    this.isComplexityError = isComplexityError;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isComplexityException(error: GraphQLError): boolean {
  const code = error.extensions?.["code"];
  return (
    code === "ComplexityException" ||
    error.message.toLowerCase().includes("complexity")
  );
}

function getRetrySeconds(error: GraphQLError): number {
  const retryIn = error.extensions?.["retry_in_seconds"];
  if (typeof retryIn === "number" && retryIn > 0) {
    return retryIn;
  }
  return 5;
}

interface MondayResponse {
  data?: unknown;
  errors?: GraphQLError[];
}

export async function mondayFetch<T = unknown>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: token,
    "API-Version": API_VERSION,
  };
  const body = JSON.stringify({ query, variables });

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Response;

    try {
      response = await fetch(MONDAY_API_URL, { method: "POST", headers, body });
    } catch (err: unknown) {
      if (attempt < MAX_RETRIES - 1) {
        const waitMs = 1000 * 2 ** attempt;
        logger.warn(`Network error, retrying in ${String(waitMs)}ms`, err);
        await delay(waitMs);
        continue;
      }
      const message = err instanceof Error ? err.message : "Network error";
      logger.error("monday.com API network error after retries", err);
      throw new MondayApiError(message, 0, [], false, null);
    }

    if (!response.ok) {
      if (attempt < MAX_RETRIES - 1) {
        const waitMs = 1000 * 2 ** attempt;
        logger.warn(
          `HTTP ${String(response.status)}, retrying in ${String(waitMs)}ms`
        );
        await delay(waitMs);
        continue;
      }
      logger.error(`monday.com API HTTP error: ${String(response.status)}`);
      throw new MondayApiError(
        `HTTP ${String(response.status)}: ${response.statusText}`,
        response.status,
        [],
        false,
        null
      );
    }

    const json = (await response.json()) as MondayResponse;

    if (json.errors && json.errors.length > 0) {
      const complexityError = json.errors.find(isComplexityException);

      if (complexityError && attempt < MAX_RETRIES - 1) {
        const retrySeconds = getRetrySeconds(complexityError);
        logger.warn(
          `ComplexityException, waiting ${String(retrySeconds)}s before retry`
        );
        await delay(retrySeconds * 1000);
        continue;
      }

      const errorMessage = json.errors.map((e) => e.message).join("; ");
      const hasComplexity = json.errors.some(isComplexityException);
      logger.error("monday.com GraphQL error", json.errors);
      throw new MondayApiError(
        errorMessage,
        response.status,
        json.errors,
        hasComplexity,
        hasComplexity
          ? getRetrySeconds(json.errors.find(isComplexityException)!)
          : null
      );
    }

    if (json.data === undefined || json.data === null) {
      logger.error("monday.com API returned no data", json);
      throw new MondayApiError(
        "API returned no data",
        response.status,
        [],
        false,
        null
      );
    }

    return json.data as T;
  }

  throw new MondayApiError(
    "Exhausted retries without success",
    0,
    [],
    false,
    null
  );
}
