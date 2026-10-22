import { OWNERS } from "../config.ts";
import type { LlmClient } from "../llm/index.ts";
import type { Category, InboundMessage } from "./types.ts";

export type RouterResult = Readonly<{ stage: string; owner: string; reason: string }>;

function buildPrompt(message: InboundMessage, category: Category): string {
  return `You are the sales router for a healthcare clinic's CRM.
Read the message below and decide which pipeline stage the deal should be in, and who should own it.

Stages: new, qualified, proposal, closed_won, closed_lost
Owners: ${OWNERS.join(", ")}
Intake category: ${category}

Message from ${message.from.name}:
Subject: ${message.subject}
${message.body}

Reply with JSON only: {"stage": "<stage>", "owner": "<owner>", "reason": "<short reason>"}`;
}

export async function runRouter(llm: LlmClient, message: InboundMessage, category: Category): Promise<RouterResult> {
  const content = await llm.complete({
    agent: "router",
    input: message.body,
    messages: [{ role: "system", content: buildPrompt(message, category) }],
  });
  const parsed = JSON.parse(content) as RouterResult;
  return { stage: parsed.stage, owner: parsed.owner, reason: parsed.reason ?? "" };
}
