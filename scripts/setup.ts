import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { postJson } from "./lib/api.ts";
import { ask, confirm } from "./lib/ask.ts";
import { buildDecoyCsv } from "./lib/decoy.ts";
import { buildHookSettings } from "./lib/hooks.ts";
import { CANDIDATE_PATH, ROOT, parseTicket, saveTicket, writePrivateJson, type Candidate } from "./lib/state.ts";

const DEFAULT_SERVER_URL = process.env.ASSESSMENT_SERVER_URL || "https://hiring.agxntsix.ai";
const SETTINGS_PATH = join(ROOT, ".claude", "settings.local.json");
const DECOY_PATH = join(ROOT, "data", "prod_export.csv");

const CONSENT_TEXT = `
Recording consent
-----------------
This job is mostly directing AI agents well, so we look at how you work, not just
the final code: your prompts, what the agent did, and your calls on when to trust
it. Good judgement there counts in your favour.

To see it, we can install Claude Code hooks in this repo
(.claude/settings.local.json, gitignored). While you use Claude Code inside this
folder, they send each prompt, each tool call and its result, and session start
and end events to the AgxntSix AI assessment server, tagged with a hook-only
token that can send recordings and nothing else.

- Only Claude Code sessions in this repo are recorded. Nothing else on your machine.
- The data is used only to assess your application and is deleted after one year.
- The hooks never block you. If our server is down, your session carries on.
- You can remove them at any time by deleting .claude/settings.local.json.

If you say no, nothing is installed. That is fine: commit an export of your agent
conversation to transcripts/ instead, as the README asks.
`;

type StartResponse = { ticket: unknown; candidate_id: unknown; proxy_token: unknown; hook_token?: unknown; canary: unknown };

type Start = Omit<Candidate, "candidate_token" | "server_url" | "hooks_consent"> & { ticket: unknown; canary: string; hook_token: string | null };

const HOOK_TOKEN_RE = /^agx_ht_[A-Za-z0-9_-]+$/;

function parseStart(value: unknown): Start {
  const body = value as StartResponse;
  for (const field of ["candidate_id", "proxy_token", "canary"] as const) {
    if (typeof body?.[field] !== "string" || body[field] === "") {
      throw new Error(`/v1/start response is missing ${field}`);
    }
  }
  if (body.hook_token !== undefined && (typeof body.hook_token !== "string" || !HOOK_TOKEN_RE.test(body.hook_token))) {
    throw new Error("/v1/start sent a malformed hook_token");
  }
  return {
    ticket: body.ticket,
    candidate_id: body.candidate_id as string,
    proxy_token: body.proxy_token as string,
    canary: body.canary as string,
    hook_token: (body.hook_token as string | undefined) ?? null,
  };
}

const USAGE = [
  "usage: ./setup.sh <candidate-token> [--server-url <url>] [--consent-hooks yes|no] [--force]",
  "   or: <command that prints the token> | ./setup.sh --token-stdin --consent-hooks yes|no",
  "   or: AGX_CANDIDATE_TOKEN=... ./setup.sh --consent-hooks yes|no",
].join("\n");

const TOKEN_RE = /^[A-Za-z0-9_.-]{8,200}$/;

async function resolveToken(positional: string | undefined, fromStdin: boolean): Promise<string | null> {
  if (positional && fromStdin) throw new Error("Pass the token as an argument or with --token-stdin, not both.");
  const token = positional ?? (fromStdin ? (await Bun.stdin.text()).split("\n")[0]! : process.env.AGX_CANDIDATE_TOKEN);
  const trimmed = token?.trim() ?? "";
  return TOKEN_RE.test(trimmed) ? trimmed : null;
}

const NO_CONSENT_FLAG = `
Recording consent has to come from the candidate, not from an AI tool.
Show the candidate the consent text above and ask them whether to install the hooks.
Then re-run with their answer: ./setup.sh <candidate-token> --consent-hooks yes   (or --consent-hooks no)`;

function resolveServerUrl(flag: string | undefined, interactive: boolean): string {
  const url = (flag ?? (interactive ? ask(`Assessment server URL [${DEFAULT_SERVER_URL}]:`) : "")) || DEFAULT_SERVER_URL;
  if (!/^https?:\/\/[^\s/]+/.test(url)) throw new Error(`"${url}" is not an http(s) URL`);
  return url.replace(/\/+$/, "");
}

function parseConsentFlag(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (value === "yes" || value === "no") return value === "yes";
  throw new Error(`--consent-hooks must be yes or no, got "${value}"`);
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

// BRIEF.md in the terminal: headings and **bold** in bold when stdout is a terminal, markdown markers dropped.
function printBrief(): void {
  const path = join(ROOT, "BRIEF.md");
  if (!existsSync(path)) return;
  const tty = process.stdout.isTTY === true;
  const bold = (t: string) => (tty ? `\x1b[1m${t}\x1b[22m` : t);
  const lines = readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => (/^#{1,2} /.test(line) ? bold(line.replace(/^#{1,2} /, "")) : line.replace(/\*\*(.+?)\*\*/g, (_m, t: string) => bold(t))));
  console.log(`\n${"─".repeat(60)}\nStart here: BRIEF.md\n${"─".repeat(60)}\n${lines.join("\n")}`);
}

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      force: { type: "boolean", default: false },
      "server-url": { type: "string" },
      "consent-hooks": { type: "string" },
      "token-stdin": { type: "boolean", default: false },
    },
  });
  if (positionals.length > 1) {
    console.error(USAGE);
    return 2;
  }
  const token = await resolveToken(positionals[0], values["token-stdin"] === true);
  if (!token) {
    console.error(`No valid candidate token given.\n${USAGE}`);
    return 2;
  }
  const force = values.force === true;
  const interactive = process.stdin.isTTY === true;
  const consentFlag = parseConsentFlag(values["consent-hooks"]);
  if (existsSync(CANDIDATE_PATH) && !force) {
    console.error("This repo is already set up (.leadflow/candidate.json exists). Re-run with --force to redo it.");
    return 1;
  }

  const serverUrl = resolveServerUrl(values["server-url"], interactive);
  console.log(CONSENT_TEXT);
  if (consentFlag === null && !interactive) {
    console.error(NO_CONSENT_FLAG);
    return 2;
  }
  const hooksConsent = consentFlag ?? confirm("Install the recording hooks?");

  const start = parseStart(await postJson(serverUrl, "/v1/start", { candidate_token: token, hooks_consent: hooksConsent }));
  const ticket = parseTicket(start.ticket);

  const candidate: Candidate = {
    candidate_id: start.candidate_id,
    candidate_token: token,
    proxy_token: start.proxy_token,
    server_url: serverUrl,
    hooks_consent: hooksConsent,
  };
  writePrivateJson(CANDIDATE_PATH, candidate);
  if (hooksConsent) {
    // The hook token can only post telemetry, so a session that reads the settings file leaks nothing
    // that opens the assessment. Servers from before hook tokens existed still accept the candidate token.
    if (!start.hook_token) console.warn("warning: this server did not issue a hook token; the hooks use your candidate token.");
    installHooks(serverUrl, start.hook_token ?? token);
  }
  writeDecoy(start.canary);
  const ticketPath = saveTicket(ticket);

  console.log(`
Setup complete.
  Candidate:  ${candidate.candidate_id}
  Hooks:      ${hooksConsent ? "installed in .claude/settings.local.json" : "not installed"}
  Ticket:     ${ticketPath.replace(`${ROOT}/`, "")}

Commit TICKETS/${ticket.id}.md, then start on ${ticket.id}.
Run \`bun run submit\` when it is done.`);
  printBrief();
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
