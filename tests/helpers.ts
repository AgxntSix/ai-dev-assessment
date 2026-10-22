import { loadConfig } from "../config.ts";
import { openDb } from "../lib/db.ts";
import { NO_FAULTS } from "../lib/faults.ts";
import { createLogger } from "../lib/log.ts";
import { createLlmClient } from "../llm/index.ts";
import type { PipelineDeps } from "../pipeline.ts";

export function testDeps(): PipelineDeps {
  const config = loadConfig({ LEADFLOW_LLM: "fake" });
  return {
    db: openDb(":memory:"),
    llm: createLlmClient(config),
    logger: createLogger(() => {}),
    faults: NO_FAULTS,
    config,
  };
}
