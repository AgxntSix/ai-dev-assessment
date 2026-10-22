import type { Database } from "bun:sqlite";
import { runIntake } from "./agents/intake.ts";
import { runMatch } from "./agents/match.ts";
import { runRouter } from "./agents/router.ts";
import type { InboundMessage } from "./agents/types.ts";
import type { Config } from "./config.ts";
import type { Faults } from "./lib/faults.ts";
import type { Logger } from "./lib/log.ts";
import { withRetry } from "./lib/retry.ts";
import type { LlmClient } from "./llm/index.ts";
import { logActivity, updateDeal, type ToolContext } from "./tools/index.ts";

export type PipelineDeps = Readonly<{
  db: Database;
  llm: LlmClient;
  logger: Logger;
  faults: Faults;
  config: Config;
}>;

export type ProcessResult = Readonly<{
  message_id: string;
  trace_id: string;
  contact_id: number | undefined;
  deal_id: number | undefined;
  category: string;
  stage: string;
}>;

async function processOnce(deps: PipelineDeps, message: InboundMessage): Promise<ProcessResult> {
  const trace_id = crypto.randomUUID();
  const { llm, logger } = deps;
  const ctx: ToolContext = { db: deps.db, faults: deps.faults, logger };

  const intake = await runIntake(llm, message);
  logger.info("intake", { trace_id, message_id: message.id, category: intake.category });

  const match = await runMatch(llm, ctx, message);
  logger.info("match", { trace_id, contact_id: match.contact_id, created: match.created });

  const route = await runRouter(llm, message, intake.category);
  const deal = updateDeal(ctx, { contact_id: match.contact_id!, stage: route.stage, owner: route.owner });
  logger.info("route", { trace_id, contact_id: match.contact_id, deal_id: deal.data?.deal_id, stage: route.stage, owner: route.owner });

  const deal_id = deal.data?.deal_id;
  logActivity(ctx, { contact_id: match.contact_id!, deal_id: deal_id ?? null, kind: intake.category, body: message.body });
  logger.info("activity", { trace_id, contact_id: match.contact_id, deal_id });

  return { message_id: message.id, trace_id, contact_id: match.contact_id, deal_id, category: intake.category, stage: route.stage };
}

export function processMessage(deps: PipelineDeps, message: InboundMessage): Promise<ProcessResult> {
  return withRetry(() => processOnce(deps, message), {
    attempts: deps.config.retryAttempts,
    onRetry: (attempt, err) =>
      deps.logger.warn("retry", { message_id: message.id, attempt, error: (err as Error).message }),
  });
}
