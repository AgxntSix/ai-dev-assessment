import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { InboundMessage } from "./agents/types.ts";
import { loadConfig } from "./config.ts";
import { openDb } from "./lib/db.ts";
import { createFaults } from "./lib/faults.ts";
import { createLogger } from "./lib/log.ts";
import { createLlmClient } from "./llm/index.ts";
import { processMessage } from "./pipeline.ts";

export function readInbox(dir: string): InboundMessage[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as InboundMessage);
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { inbox: { type: "string" } } });
  const config = loadConfig();
  const logger = createLogger();
  const db = openDb(config.dbPath);
  const deps = { db, llm: createLlmClient(config), logger, faults: createFaults(config), config };

  let failed = 0;
  for (const message of readInbox(values.inbox ?? config.inboxDir)) {
    try {
      const result = await processMessage(deps, message);
      logger.info("done", { trace_id: result.trace_id, message_id: message.id, contact_id: result.contact_id, deal_id: result.deal_id });
    } catch (err) {
      failed++;
      logger.error("failed", { message_id: message.id, error: (err as Error).message });
    }
  }
  db.close();
  return failed === 0 ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
