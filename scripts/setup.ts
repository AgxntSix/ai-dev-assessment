import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { postJson } from "./lib/api.ts";
import { ask, confirm } from "./lib/ask.ts";
import { buildDecoyCsv } from "./lib/decoy.ts";
import { buildHookSettings } from "./lib/hooks.ts";
import { CANDIDATE_PATH, ROOT, parseTicket, saveTicket, writePrivateJson, type Candidate } from "./lib/state.ts";

const DEFAULT_SERVER_URL = process.env.ASSESSMENT_SERVER_URL || "http://localhost:8787";
const SETTINGS_PATH = join(ROOT, ".claude", "settings.local.json");
const DECOY_PATH = join(ROOT, "data", "prod_export.csv");

const CONSENT_TEXT = `
Recording consent
-----------------
To see how you work with AI tools, we can install Claude Code hooks in this repo
(.claude/settings.local.json, gitignored). While you use Claude Code inside this
folder, they send each prompt, each tool call and its result, and session start
and end events to the AgxntSix AI assessment server, tagged with your candidate
token.

- Only Claude Code sessions in this repo are recorded. Nothing else on your machine.
- The data is used only to assess your application and is deleted after 90 days.
- The hooks never block you. If our server is down, your session carries on.
- You can remove them at any time by deleting .claude/settings.local.json.

If you say no, nothing is installed. That is fine: commit an export of your agent
conversation to transcripts/ instead, as the README asks.
`;

type StartResponse = { ticket: unknown; candidate_id: unknown; proxy_token: unknown; canary: unknown };

function parseStart(value: unknown): Omit<Candidate, "candidate_token" | "server_url" | "hooks_consent"> & { ticket: unknown } {
  const body = value as StartResponse;
  for (const field of ["candidate_id", "proxy_token", "canary"] as const) {
    if (typeof body?.[field] !== "string" || body[field] === "") {
      throw new Error(`/v1/start response is missing ${field}`);
    }
  }
  return {
    ticket: body.ticket,
    candidate_id: body.candidate_id as string,
    proxy_token: body.proxy_token as string,
    canary: body.canary as string,
  };
}

function askServerUrl(): string {
  const url = ask(`Assessment server URL [${DEFAULT_SERVER_URL}]:`) || DEFAULT_SERVER_URL;
  if (!/^https?:\/\/[^\s/]+/.test(url)) throw new Error(`"${url}" is not an http(s) URL`);
  return url.replace(/\/+$/, "");
}

function installHooks(serverUrl: string, token: string): void {
  const existing = existsSync(SETTINGS_PATH) ? (JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) as Record<string, unknown>) : {};
  const existingHooks = (existing.hooks ?? {}) as Record<string, unknown>;
  const settings = { ...existing, hooks: { ...existingHooks, ...buildHookSettings(serverUrl, token) } };
  mkdirSync(join(ROOT, ".claude"), { recursive: true });
  writePrivateJson(SETTINGS_PATH, settings);
}

function writeDecoy(canary: string): void {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(DECOY_PATH, buildDecoyCsv(canary), { mode: 0o600 });
}

async function main(argv: readonly string[]): Promise<number> {
  const force = argv.includes("--force");
  const token = argv.find((arg) => !arg.startsWith("--"));
  if (!token || /\s/.test(token)) {
    console.error("usage: ./setup.sh <candidate-token> [--force]");
    return 2;
  }
  if (existsSync(CANDIDATE_PATH) && !force) {
    console.error("This repo is already set up (.leadflow/candidate.json exists). Re-run with --force to redo it.");
    return 1;
  }

  const serverUrl = askServerUrl();
  console.log(CONSENT_TEXT);
  const hooksConsent = confirm("Install the recording hooks?");

  const start = parseStart(await postJson(serverUrl, "/v1/start", { candidate_token: token }));
  const ticket = parseTicket(start.ticket);

  const candidate: Candidate = {
    candidate_id: start.candidate_id,
    candidate_token: token,
    proxy_token: start.proxy_token,
    server_url: serverUrl,
    canary: start.canary,
    hooks_consent: hooksConsent,
  };
  writePrivateJson(CANDIDATE_PATH, candidate);
  if (hooksConsent) installHooks(serverUrl, token);
  writeDecoy(start.canary);
  const ticketPath = saveTicket(ticket);

  console.log(`
Setup complete.
  Candidate:  ${candidate.candidate_id}
  Hooks:      ${hooksConsent ? "installed in .claude/settings.local.json" : "not installed"}
  Ticket:     ${ticketPath.replace(`${ROOT}/`, "")}

Commit TICKETS/${ticket.id}.md, read the README and RULES.md, then start on ${ticket.id}.
Run \`bun run submit\` when it is done.`);
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (err) {
    console.error(`setup failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
