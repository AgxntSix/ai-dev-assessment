import type { Database } from "bun:sqlite";
import type { LlmClient } from "../llm/index.ts";
import { createContact, type ToolContext } from "../tools/index.ts";
import type { InboundMessage } from "./types.ts";

const CANDIDATE_LIMIT = 50;

const SYSTEM_PROMPT = `You decide whether two CRM records belong to the same person.
Consider name, email and phone. Reply with JSON only: {"same_person": true | false, "confidence": 0-1}`;

type ContactRow = { id: number; full_name: string; email: string | null; phone: string | null };

export type MatchResult = Readonly<{ contact_id: number | undefined; created: boolean }>;

function recentContacts(db: Database): ContactRow[] {
  return db
    .query<ContactRow, [number]>("SELECT id, full_name, email, phone FROM contacts ORDER BY id DESC LIMIT ?")
    .all(CANDIDATE_LIMIT);
}

async function isSamePerson(llm: LlmClient, message: InboundMessage, candidate: ContactRow): Promise<boolean> {
  const incoming = { name: message.from.name, email: message.from.email, phone: message.from.phone };
  const existing = { name: candidate.full_name, email: candidate.email, phone: candidate.phone };
  const content = await llm.complete({
    agent: "match",
    input: `${message.from.email ?? ""}|${candidate.email ?? ""}`,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Record A: ${JSON.stringify(incoming)}\nRecord B: ${JSON.stringify(existing)}` },
    ],
  });
  const parsed = JSON.parse(content) as { same_person: boolean };
  return parsed.same_person === true;
}

export async function runMatch(llm: LlmClient, ctx: ToolContext, message: InboundMessage): Promise<MatchResult> {
  for (const candidate of recentContacts(ctx.db)) {
    if (await isSamePerson(llm, message, candidate)) {
      return { contact_id: candidate.id, created: false };
    }
  }
  const result = createContact(ctx, {
    full_name: message.from.name,
    email: message.from.email,
    phone: message.from.phone,
  });
  return { contact_id: result.data?.contact_id, created: true };
}
