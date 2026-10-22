import { existsSync, rmSync } from "node:fs";
import { ApiError, postJson } from "./lib/api.ts";
import { askChoice, askRequired, confirm } from "./lib/ask.ts";
import { checkRepoReady } from "./lib/git.ts";
import {
  PENDING_ANSWERS_PATH,
  loadCandidate,
  loadCurrentTicket,
  parseTicket,
  readJson,
  saveTicket,
  writePrivateJson,
  type Answer,
  type Candidate,
  type PendingAnswers,
  type Ticket,
} from "./lib/state.ts";
import { isUnfilled, readUpdatesEntry } from "./lib/updates.ts";

const CHOICES = ["code", "llm", "hybrid"] as const;

type Decision = Readonly<{ key: string; choice: (typeof CHOICES)[number]; why: string }>;
type Question = Readonly<{ id: string; text: string }>;

function askDecisions(ticket: Ticket): Decision[] {
  if (ticket.decisions_required.length === 0) return [];
  console.log(`\n${ticket.id} has ${ticket.decisions_required.length} decision question(s). One or two lines each.\n`);
  return ticket.decisions_required.map((d) => {
    console.log(d.question);
    const choice = askChoice("  Code, LLM or hybrid?", CHOICES);
    const why = askRequired("  Why?", 500);
    return { key: d.key, choice, why };
  });
}

function parseQuestions(value: unknown): Question[] {
  const questions = (value as { questions?: unknown })?.questions;
  if (!Array.isArray(questions)) throw new Error("/v1/submit response has no questions list");
  return questions.map((q) => {
    if (typeof q?.id !== "string" || typeof q?.text !== "string") throw new Error("/v1/submit sent a malformed question");
    return { id: q.id, text: q.text };
  });
}

function askQuestions(questions: readonly Question[]): Answer[] {
  if (questions.length === 0) return [];
  console.log("\nA few questions about this checkpoint. Answer in your own words.\n");
  return questions.map((q, i) => {
    console.log(`${i + 1}. ${q.text}`);
    return { id: q.id, text: askRequired("  >") };
  });
}

async function sendAnswers(candidate: Candidate, pending: PendingAnswers): Promise<void> {
  writePrivateJson(PENDING_ANSWERS_PATH, pending);
  const result = (await postJson(candidate.server_url, "/v1/answers", {
    candidate_token: candidate.candidate_token,
    ticket_id: pending.ticket_id,
    answers: pending.answers,
  })) as { next_ticket?: unknown; done?: unknown };
  rmSync(PENDING_ANSWERS_PATH, { force: true });

  if (result.next_ticket) {
    const next = parseTicket(result.next_ticket);
    const path = saveTicket(next);
    console.log(`\nNext up: ${next.id}: ${next.title}\nSaved to ${path}. Commit it, then read it before you start.`);
    return;
  }
  if (result.done === true) {
    console.log("\nThat was the last checkpoint. Thank you. We will be in touch about the next step.");
    return;
  }
  console.log("\nAnswers received. The server has not released the next ticket yet; check back later.");
}

async function resumePending(candidate: Candidate): Promise<boolean> {
  if (!existsSync(PENDING_ANSWERS_PATH)) return false;
  const pending = readJson(PENDING_ANSWERS_PATH) as PendingAnswers;
  console.log(`Found answers for ${pending.ticket_id} that did not reach the server. Sending them again.`);
  await sendAnswers(candidate, pending);
  return true;
}

async function submit(candidate: Candidate, ticket: Ticket): Promise<void> {
  const repo = checkRepoReady();
  const updates_entry = readUpdatesEntry(ticket.id);
  if (isUnfilled(updates_entry) && !confirm(`UPDATES.md has no entry for ${ticket.id} yet. Submit anyway?`)) {
    console.log("Stopped. Fill in UPDATES.md, commit, push and run bun run submit again.");
    return;
  }
  const decisions = askDecisions(ticket);

  console.log(`\nSubmitting ${ticket.id} at ${repo.commit_sha.slice(0, 12)} from ${repo.repo_url}.`);
  if (!confirm("This locks the ticket. Submit now?")) {
    console.log("Not submitted.");
    return;
  }

  const response = await postJson(candidate.server_url, "/v1/submit", {
    candidate_token: candidate.candidate_token,
    ticket_id: ticket.id,
    commit_sha: repo.commit_sha,
    repo_url: repo.repo_url,
    updates_entry,
    decisions,
  });
  console.log(`Submitted (${(response as { submission_id?: string }).submission_id ?? "no id"}).`);
  await sendAnswers(candidate, { ticket_id: ticket.id, answers: askQuestions(parseQuestions(response)) });
}

function explain(err: unknown): string {
  if (err instanceof ApiError && err.status === 409) {
    return `The server refused this submission: ${err.message}\nThe ticket is either already submitted or not your current one. Check TICKETS/ for the latest ticket.`;
  }
  if (err instanceof ApiError && err.status === null) {
    return `${err.message}\nCheck your connection and the server_url in .leadflow/candidate.json, then run bun run submit again. Nothing was lost.`;
  }
  if (err instanceof ApiError && err.status === 401) {
    return `${err.message}\nYour candidate token was not accepted. Contact us rather than re-running setup.`;
  }
  return (err as Error).message;
}

async function main(): Promise<number> {
  const candidate = loadCandidate();
  if (await resumePending(candidate)) return 0;
  await submit(candidate, loadCurrentTicket());
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(await main());
  } catch (err) {
    console.error(`\nsubmit failed: ${explain(err)}`);
    process.exit(1);
  }
}
