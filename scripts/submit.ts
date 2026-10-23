import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { ApiError, postJson } from "./lib/api.ts";
import {
  AnswersFileError,
  CHOICES,
  decisionsTemplate,
  followupTemplate,
  parseDecisions,
  parseFollowup,
  type Decision,
  type Question,
} from "./lib/answers-file.ts";
import { askChoice, askRequired, confirm } from "./lib/ask.ts";
import { FINAL_TICKET, FinalCheckError, checkFinalRepo, resolveVideoUrl } from "./lib/final.ts";
import { checkRepoReady } from "./lib/git.ts";
import {
  ANSWERS_DIR,
  FOLLOWUP_STATE_PATH,
  PENDING_ANSWERS_PATH,
  ROOT,
  loadCandidate,
  loadCurrentTicket,
  parseTicket,
  readJson,
  saveTicket,
  writePrivateJson,
  type Answer,
  type AnswerMode,
  type Candidate,
  type PendingAnswers,
  type Ticket,
} from "./lib/state.ts";
import { isUnfilled, readUpdatesEntry } from "./lib/updates.ts";
import { checkVideoFile, uploadVideo, type VideoFile } from "./lib/video.ts";

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_FOLLOWUP_NEEDED = 3;

type FollowupState = Readonly<{ ticket_id: string; questions: readonly Question[] }>;

type Flags = Readonly<{ followup: boolean; repoUrl?: string; videoUrl?: string; video?: string }>;

type FinalPlan = Readonly<{ repo_url: string; video_url: string | null; video: VideoFile | null }>;

const USAGE = "usage: bun run submit [--followup] [--repo-url <url>] [--video-url <url> | --video <file>]";

const rel = (path: string) => relative(ROOT, path);
const decisionsPath = (ticketId: string) => join(ANSWERS_DIR, `${ticketId}.md`);
const followupPath = (ticketId: string) => join(ANSWERS_DIR, `${ticketId}-followup.md`);

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

function readDecisionsFile(ticket: Ticket): Decision[] | null {
  if (ticket.decisions_required.length === 0) return [];
  const path = decisionsPath(ticket.id);
  if (!existsSync(path)) {
    mkdirSync(ANSWERS_DIR, { recursive: true });
    writeFileSync(path, decisionsTemplate(ticket.id, ticket.decisions_required));
    console.error(
      `${ticket.id} needs answers to ${ticket.decisions_required.length} decision question(s): ${ticket.decisions_required.map((d) => d.key).join(", ")}.\n` +
        `Wrote ${rel(path)} with one section per decision. The candidate fills it in: these answers are read as yours, ` +
        `and we ask about them on the call.\nThen commit and push it, and run bun run submit again.`,
    );
    return null;
  }
  return parseDecisions(readFileSync(path, "utf8"), ticket.decisions_required);
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
    answer_mode: pending.answer_mode ?? "tty",
  })) as { next_ticket?: unknown; done?: unknown };
  rmSync(PENDING_ANSWERS_PATH, { force: true });

  if (result.next_ticket) {
    const next = parseTicket(result.next_ticket);
    const path = saveTicket(next);
    console.log(`\nNext up: ${next.id}: ${next.title}\nSaved to ${rel(path)}. Commit it, then read it before you start.`);
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

function askForFollowupFile(ticketId: string, questions: readonly Question[]): number {
  const path = followupPath(ticketId);
  mkdirSync(ANSWERS_DIR, { recursive: true });
  writeFileSync(path, followupTemplate(ticketId, questions));
  writePrivateJson(FOLLOWUP_STATE_PATH, { ticket_id: ticketId, questions } satisfies FollowupState);
  console.error(
    `\nThe server asked ${questions.length} follow-up question(s) about ${ticketId}. They are in ${rel(path)}.\n` +
      `Answer these in that file, then run \`bun run submit --followup\`. The candidate writes these answers: ` +
      `we read them as yours, and we ask about them on the call.`,
  );
  return EXIT_FOLLOWUP_NEEDED;
}

async function postFollowup(candidate: Candidate): Promise<number> {
  if (!existsSync(FOLLOWUP_STATE_PATH)) {
    console.error("No follow-up questions are waiting. Run bun run submit to submit the current ticket.");
    return EXIT_ERROR;
  }
  const state = readJson(FOLLOWUP_STATE_PATH) as FollowupState;
  const path = followupPath(state.ticket_id);
  if (!existsSync(path)) throw new AnswersFileError(`${rel(path)} is missing`, state.questions.map((q) => q.id));
  const answers = parseFollowup(readFileSync(path, "utf8"), state.questions);
  await sendAnswers(candidate, { ticket_id: state.ticket_id, answers, answer_mode: "file" });
  rmSync(FOLLOWUP_STATE_PATH, { force: true });
  return EXIT_OK;
}

function planFinal(flags: Flags, remoteUrl: string): FinalPlan {
  const repo = checkFinalRepo(flags.repoUrl, remoteUrl);
  repo.warnings.forEach((w) => console.warn(`warning: ${w}`));
  const video = flags.video ? checkVideoFile(flags.video) : null;
  const video_url = resolveVideoUrl(flags.videoUrl);
  if (!video && !video_url) {
    throw new FinalCheckError(
      "The final checkpoint needs your 5 to 7 minute video. Either upload the file with " +
        "`bun run submit --video <file>` (mp4, mov or webm, up to 500 MB), or add a `Video: <link>` line " +
        "near the top of WRITEUP.md, commit, push and run bun run submit again.",
    );
  }
  return { repo_url: repo.repo_url, video_url, video };
}

async function finalFields(candidate: Candidate, plan: FinalPlan | null): Promise<Record<string, string>> {
  if (!plan) return {};
  const fields: Record<string, string> = plan.video_url ? { video_url: plan.video_url } : {};
  if (!plan.video) return fields;
  console.log(`Uploading ${plan.video.filename} (${(plan.video.size_bytes / 1024 / 1024).toFixed(1)} MB).`);
  const video_upload_id = await uploadVideo(candidate, plan.video, (line) => console.log(line));
  return { ...fields, video_upload_id };
}

async function submit(candidate: Candidate, ticket: Ticket, mode: AnswerMode, flags: Flags): Promise<number> {
  const isFinal = ticket.id === FINAL_TICKET;
  if (!isFinal && (flags.repoUrl || flags.videoUrl || flags.video)) {
    console.error(`--repo-url, --video-url and --video are for the ${FINAL_TICKET} checkpoint. The current ticket is ${ticket.id}.`);
    return EXIT_ERROR;
  }
  const repo = checkRepoReady();
  const updates_entry = readUpdatesEntry(ticket.id);
  if (isUnfilled(updates_entry)) {
    if (mode === "file") {
      console.error(`UPDATES.md has no entry for ${ticket.id} yet. Fill in its section, commit, push and run bun run submit again.`);
      return EXIT_ERROR;
    }
    if (!confirm(`UPDATES.md has no entry for ${ticket.id} yet. Submit anyway?`)) {
      console.log("Stopped. Fill in UPDATES.md, commit, push and run bun run submit again.");
      return EXIT_OK;
    }
  }

  const decisions = mode === "tty" ? askDecisions(ticket) : readDecisionsFile(ticket);
  if (decisions === null) return EXIT_ERROR;
  const plan = isFinal ? planFinal(flags, repo.repo_url) : null;
  const repo_url = plan?.repo_url ?? repo.repo_url;

  console.log(`\nSubmitting ${ticket.id} at ${repo.commit_sha.slice(0, 12)} from ${repo_url}. This locks the ticket.`);
  if (mode === "tty" && !confirm("Submit now?")) {
    console.log("Not submitted.");
    return EXIT_OK;
  }

  const response = await postJson(candidate.server_url, "/v1/submit", {
    candidate_token: candidate.candidate_token,
    ticket_id: ticket.id,
    commit_sha: repo.commit_sha,
    repo_url,
    updates_entry,
    decisions,
    answer_mode: mode,
    ...(await finalFields(candidate, plan)),
  });
  console.log(`Submitted (${(response as { submission_id?: string }).submission_id ?? "no id"}).`);

  const questions = parseQuestions(response);
  if (questions.length === 0) {
    await sendAnswers(candidate, { ticket_id: ticket.id, answers: [], answer_mode: mode });
    return EXIT_OK;
  }
  if (mode === "file") return askForFollowupFile(ticket.id, questions);
  await sendAnswers(candidate, { ticket_id: ticket.id, answers: askQuestions(questions), answer_mode: mode });
  return EXIT_OK;
}

function explain(err: unknown): string {
  if (err instanceof FinalCheckError) return err.message;
  if (err instanceof AnswersFileError) {
    return `${err.message}\nEvery one of these needs an answer: ${err.keys.join(", ")}.`;
  }
  if (err instanceof ApiError && err.status === 409) {
    return `The server refused this submission: ${err.message}\nThe ticket is either already submitted or not your current one. Check TICKETS/ for the latest ticket.`;
  }
  if (err instanceof ApiError && err.status === null) {
    return `${err.message}\nCheck your connection and the server_url in .leadflow/candidate.json, then run bun run submit again. Nothing was lost.`;
  }
  if (err instanceof ApiError && err.status === 429) {
    return `${err.message}\nToo many video upload attempts today. Try again tomorrow, or use a Video: <link> line in WRITEUP.md.`;
  }
  if (err instanceof ApiError && err.status === 401) {
    return `${err.message}\nYour candidate token was not accepted. Contact us rather than re-running setup.`;
  }
  return (err as Error).message;
}

function parseFlags(argv: readonly string[]): Flags {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      followup: { type: "boolean", default: false },
      "repo-url": { type: "string" },
      "video-url": { type: "string" },
      video: { type: "string" },
    },
  });
  if (positionals.length > 0) throw new Error(USAGE);
  if (values.video && values["video-url"]) throw new Error("Pass either --video <file> or --video-url <url>, not both.");
  return { followup: values.followup === true, repoUrl: values["repo-url"], videoUrl: values["video-url"], video: values.video };
}

async function main(argv: readonly string[]): Promise<number> {
  const flags = parseFlags(argv);
  const mode: AnswerMode = process.stdin.isTTY ? "tty" : "file";
  const candidate = loadCandidate();
  if (flags.followup) return postFollowup(candidate);
  if (await resumePending(candidate)) return EXIT_OK;
  if (existsSync(FOLLOWUP_STATE_PATH)) {
    const state = readJson(FOLLOWUP_STATE_PATH) as FollowupState;
    console.error(`Follow-up questions for ${state.ticket_id} are waiting in ${rel(followupPath(state.ticket_id))}. Answer them, then run \`bun run submit --followup\`.`);
    return EXIT_FOLLOWUP_NEEDED;
  }
  return submit(candidate, loadCurrentTicket(), mode, flags);
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (err) {
    console.error(`\nsubmit failed: ${explain(err)}`);
    process.exit(EXIT_ERROR);
  }
}
