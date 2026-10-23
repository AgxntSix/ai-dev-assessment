import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const ROOT = join(import.meta.dir, "..", "..");
export const STATE_DIR = join(ROOT, ".leadflow");
export const CANDIDATE_PATH = join(STATE_DIR, "candidate.json");
export const TICKET_PATH = join(STATE_DIR, "ticket.json");
export const PENDING_ANSWERS_PATH = join(STATE_DIR, "pending-answers.json");
export const FOLLOWUP_STATE_PATH = join(STATE_DIR, "followup.json");
export const ANSWERS_DIR = join(ROOT, "answers");
export const TICKETS_DIR = join(ROOT, "TICKETS");

export type Candidate = Readonly<{
  candidate_id: string;
  candidate_token: string;
  proxy_token: string;
  server_url: string;
  canary: string;
  hooks_consent: boolean;
}>;

export type DecisionRequired = Readonly<{ key: string; question: string }>;

export type Ticket = Readonly<{
  id: string;
  title: string;
  body_md: string;
  decisions_required: readonly DecisionRequired[];
}>;

export type Answer = Readonly<{ id: string; text: string }>;

export type AnswerMode = "tty" | "file";

export type PendingAnswers = Readonly<{ ticket_id: string; answers: readonly Answer[]; answer_mode?: AnswerMode }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function parseTicket(value: unknown): Ticket {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.title) || typeof value.body_md !== "string") {
    throw new Error("server sent a ticket without id, title or body_md");
  }
  const decisions = value.decisions_required ?? [];
  if (!Array.isArray(decisions) || !decisions.every((d) => isRecord(d) && isNonEmptyString(d.key) && isNonEmptyString(d.question))) {
    throw new Error(`ticket ${value.id}: decisions_required must be a list of {key, question}`);
  }
  return {
    id: value.id,
    title: value.title,
    body_md: value.body_md,
    decisions_required: decisions.map((d) => ({ key: d.key as string, question: d.question as string })),
  };
}

export function parseCandidate(value: unknown): Candidate {
  if (!isRecord(value)) throw new Error("candidate file is not a JSON object");
  for (const field of ["candidate_id", "candidate_token", "proxy_token", "server_url", "canary"] as const) {
    if (!isNonEmptyString(value[field])) throw new Error(`candidate file is missing ${field}`);
  }
  return {
    candidate_id: value.candidate_id as string,
    candidate_token: value.candidate_token as string,
    proxy_token: value.proxy_token as string,
    server_url: value.server_url as string,
    canary: value.canary as string,
    hooks_consent: value.hooks_consent === true,
  };
}

export function writePrivateJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadCandidate(): Candidate {
  if (!existsSync(CANDIDATE_PATH)) {
    throw new Error("No .leadflow/candidate.json. Run ./setup.sh <candidate-token> first.");
  }
  return parseCandidate(readJson(CANDIDATE_PATH));
}

export function loadCurrentTicket(): Ticket {
  if (!existsSync(TICKET_PATH)) {
    throw new Error("No current ticket in .leadflow/ticket.json. Run ./setup.sh <candidate-token> first.");
  }
  return parseTicket(readJson(TICKET_PATH));
}

export function saveTicket(ticket: Ticket): string {
  mkdirSync(TICKETS_DIR, { recursive: true });
  const path = join(TICKETS_DIR, `${ticket.id}.md`);
  writeFileSync(path, `# ${ticket.id}: ${ticket.title}\n\n${ticket.body_md.trim()}\n`);
  writePrivateJson(TICKET_PATH, ticket);
  return path;
}
