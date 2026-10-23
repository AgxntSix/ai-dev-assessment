import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs setup and submit as an AI tool would (stdin is a pipe, not a TTY) against a fake checkpoint server.

const REPO = join(import.meta.dir, "..");
const TOKEN = "agx_ct_test";

type Call = { path: string; body: Record<string, unknown> };

const ticket = (id: string) => ({
  id,
  title: `Ticket ${id}`,
  body_md: `Body of ${id}`,
  decisions_required: id === "AGX-200" ? [{ key: "normalisation", question: "Normalisation: code or LLM?" }] : [],
});

const calls: Call[] = [];
const workspaces: string[] = [];
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    calls.push({ path, body: (await req.json()) as Record<string, unknown> });
    if (path === "/v1/start") return Response.json({ ticket: ticket("AGX-200"), candidate_id: "cand_1", proxy_token: "agx_pt_x", canary: "k7q2zp" });
    if (path === "/v1/submit") return Response.json({ submission_id: "sub_1", questions: [{ id: "q1", text: "Which rows did you refuse to infer?" }] });
    if (path === "/v1/answers") return Response.json({ next_ticket: ticket("CR-1"), done: false });
    return new Response("not found", { status: 404 });
  },
});
const SERVER_URL = `http://localhost:${server.port}`;

afterAll(() => server.stop(true));

function sh(cwd: string, cmd: string[]): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed: ${proc.stderr.toString()}`);
}

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "leadflow-cli-"));
  workspaces.push(dir);
  const work = join(dir, "work");
  sh(dir, ["git", "init", "-q", "--bare", "remote.git"]);
  for (const name of ["scripts", "package.json", ".gitignore", "UPDATES.md"]) cpSync(join(REPO, name), join(work, name), { recursive: true });
  const updates = readFileSync(join(work, "UPDATES.md"), "utf8").replace("## AGX-200\n\n_Not started._", "## AGX-200\n\nMigration with dry run.");
  writeFileSync(join(work, "UPDATES.md"), updates);
  sh(work, ["git", "init", "-q", "-b", "main"]);
  sh(work, ["git", "add", "-A"]);
  sh(work, ["git", "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "AGX-200: scaffold"]);
  sh(work, ["git", "remote", "add", "origin", join(dir, "remote.git")]);
  sh(work, ["git", "push", "-q", "-u", "origin", "main"]);
  return work;
}

function commitAndPush(work: string): void {
  sh(work, ["git", "add", "-A"]);
  sh(work, ["git", "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-q", "-m", "AGX-200: answers"]);
  sh(work, ["git", "push", "-q"]);
}

async function run(work: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["bun", ...args], { cwd: work, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin.end();
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out, err };
}

const setup = (work: string, ...flags: string[]) => run(work, ["scripts/setup.ts", TOKEN, "--server-url", SERVER_URL, ...flags]);
const submit = (work: string, ...flags: string[]) => run(work, ["scripts/submit.ts", ...flags]);
const callsTo = (path: string) => calls.filter((c) => c.path === path);

let work: string;
beforeEach(() => {
  calls.length = 0;
  work = makeWorkspace();
});
afterAll(() => workspaces.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe("setup without a TTY", () => {
  test("refuses to guess consent and tells the agent to ask the candidate", async () => {
    const result = await setup(work);
    expect(result.code).toBe(2);
    expect(result.err).toContain("--consent-hooks yes");
    expect(result.err).toContain("has to come from the candidate");
    expect(callsTo("/v1/start")).toHaveLength(0);
    expect(existsSync(join(work, ".leadflow", "candidate.json"))).toBe(false);
  });

  test("--consent-hooks no starts the assessment without installing hooks", async () => {
    const result = await setup(work, "--consent-hooks", "no");
    expect(result.code).toBe(0);
    expect(callsTo("/v1/start")[0]!.body).toEqual({ candidate_token: TOKEN });
    const candidate = JSON.parse(readFileSync(join(work, ".leadflow", "candidate.json"), "utf8"));
    expect(candidate.hooks_consent).toBe(false);
    expect(candidate.server_url).toBe(SERVER_URL);
    expect(existsSync(join(work, ".claude", "settings.local.json"))).toBe(false);
    expect(existsSync(join(work, "TICKETS", "AGX-200.md"))).toBe(true);
  });

  test("--consent-hooks yes installs the hooks", async () => {
    const result = await setup(work, "--consent-hooks", "yes");
    expect(result.code).toBe(0);
    const settings = JSON.parse(readFileSync(join(work, ".claude", "settings.local.json"), "utf8"));
    expect(settings.hooks.PreToolUse[0].hooks[0].url).toBe(`${SERVER_URL}/v1/hooks`);
  });

  test("rejects a consent value other than yes or no", async () => {
    const result = await setup(work, "--consent-hooks", "sure");
    expect(result.code).toBe(1);
    expect(result.err).toContain("--consent-hooks must be yes or no");
    expect(callsTo("/v1/start")).toHaveLength(0);
  });
});

describe("submit without a TTY", () => {
  beforeEach(async () => {
    expect((await setup(work, "--consent-hooks", "no")).code).toBe(0);
    commitAndPush(work);
    calls.length = 0;
  });

  test("writes a decisions template and does not submit when answers are missing", async () => {
    const result = await submit(work);
    expect(result.code).toBe(1);
    expect(result.err).toContain("normalisation");
    expect(readFileSync(join(work, "answers", "AGX-200.md"), "utf8")).toContain("## normalisation");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("lists the unanswered keys when the answers file is still empty", async () => {
    await submit(work);
    commitAndPush(work);
    const result = await submit(work);
    expect(result.code).toBe(1);
    expect(result.err).toContain("normalisation: choice must be one of");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("submits file answers, then collects follow-ups through --followup", async () => {
    await submit(work);
    const path = join(work, "answers", "AGX-200.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("choice: \n\nwhy: ", "choice: code\n\nwhy: Formats are fixed rules."));
    commitAndPush(work);

    const first = await submit(work);
    expect(first.code).toBe(3);
    expect(first.err).toContain("bun run submit --followup");
    const sent = callsTo("/v1/submit")[0]!.body;
    expect(sent.answer_mode).toBe("file");
    expect(sent.decisions).toEqual([{ key: "normalisation", choice: "code", why: "Formats are fixed rules." }]);
    expect(callsTo("/v1/answers")).toHaveLength(0);

    const unanswered = await submit(work, "--followup");
    expect(unanswered.code).toBe(1);
    expect(unanswered.err).toContain("q1: answer is empty");

    const followup = join(work, "answers", "AGX-200-followup.md");
    writeFileSync(followup, readFileSync(followup, "utf8") + "Ambiguous DOBs.\n");
    const done = await submit(work, "--followup");
    expect(done.code).toBe(0);
    const answers = callsTo("/v1/answers")[0]!.body;
    expect(answers.answer_mode).toBe("file");
    expect(answers.answers).toEqual([{ id: "q1", text: "Ambiguous DOBs." }]);
    expect(existsSync(join(work, "TICKETS", "CR-1.md"))).toBe(true);
  });
});
