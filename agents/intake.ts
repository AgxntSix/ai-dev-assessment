import type { LlmClient } from "../llm/index.ts";
import type { Category, InboundMessage } from "./types.ts";

const SYSTEM_PROMPT = `You are the intake agent for a healthcare clinic's CRM.
Classify the inbound message into exactly one category:
- new_lead: someone new asking about services, pricing or booking
- follow_up: an existing contact continuing a conversation
- support: a question or problem about an existing appointment, bill or account
Reply with JSON only: {"category": "new_lead" | "follow_up" | "support", "summary": "<one sentence>"}`;

export type IntakeResult = Readonly<{ category: Category; summary: string }>;

export async function runIntake(llm: LlmClient, message: InboundMessage): Promise<IntakeResult> {
  const content = await llm.complete({
    agent: "intake",
    input: message.body,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `From: ${message.from.name} <${message.from.email ?? ""}>\nSubject: ${message.subject}\n\n${message.body}` },
    ],
  });
  const parsed = JSON.parse(content) as IntakeResult;
  return { category: parsed.category, summary: parsed.summary ?? "" };
}
