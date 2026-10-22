import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MODEL_ID = "deepseek/deepseek-v4.1-flash-1017";

export const OWNERS = ["dana", "marcus", "priya"] as const;

export const CANDIDATE_FILE = join(import.meta.dir, ".leadflow", "candidate.json");

export type LlmMode = "fake" | "proxy";

export type Config = Readonly<{
  llmMode: LlmMode;
  llmBaseUrl: string;
  proxyToken: string;
  model: string;
  dbPath: string;
  inboxDir: string;
  fakeFixturesDir: string;
  fakeLogPath: string | null;
  failAfterWrite: string | null;
  toolError: string | null;
  failAtRow: number | null;
  retryAttempts: number;
}>;

type CandidateFile = { server_url?: string; proxy_token?: string };

function readCandidateFile(): CandidateFile {
  if (!existsSync(CANDIDATE_FILE)) return {};
  return JSON.parse(readFileSync(CANDIDATE_FILE, "utf8")) as CandidateFile;
}

function parseMode(value: string | undefined): LlmMode {
  const mode = value ?? "proxy";
  if (mode !== "fake" && mode !== "proxy") {
    throw new Error(`LEADFLOW_LLM must be "fake" or "proxy", got "${mode}"`);
  }
  return mode;
}

function parseRow(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`LEADFLOW_FAIL_AT_ROW must be a positive integer, got "${value}"`);
  }
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const candidate = readCandidateFile();
  const serverUrl = candidate.server_url ?? "http://localhost:8787";
  return Object.freeze({
    llmMode: parseMode(env.LEADFLOW_LLM),
    llmBaseUrl: env.LEADFLOW_LLM_BASE_URL ?? `${serverUrl}/v1/llm`,
    proxyToken: env.LEADFLOW_PROXY_TOKEN ?? candidate.proxy_token ?? "",
    model: env.LEADFLOW_MODEL ?? MODEL_ID,
    dbPath: env.LEADFLOW_DB ?? "leadflow.db",
    inboxDir: env.LEADFLOW_INBOX ?? "inbox",
    fakeFixturesDir: env.LEADFLOW_FAKE_FIXTURES ?? join(import.meta.dir, "fixtures", "llm"),
    fakeLogPath: env.LEADFLOW_FAKE_LOG || null,
    failAfterWrite: env.LEADFLOW_FAIL_AFTER_WRITE || null,
    toolError: env.LEADFLOW_TOOL_ERROR || null,
    failAtRow: parseRow(env.LEADFLOW_FAIL_AT_ROW),
    retryAttempts: 3,
  });
}
