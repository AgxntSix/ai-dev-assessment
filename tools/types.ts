import type { Database } from "bun:sqlite";
import type { Faults } from "../lib/faults.ts";
import type { Logger } from "../lib/log.ts";

export type ToolContext = Readonly<{
  db: Database;
  faults: Faults;
  logger: Logger;
}>;

export type ToolResult<T> = Readonly<{ ok: true; data?: T }>;
