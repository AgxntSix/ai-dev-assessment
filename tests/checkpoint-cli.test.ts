import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TOKEN, cleanupTemp, commitAndPush as commitAndPushWs, makeWorkspace, run, startFakeServer, type Workspace } from "./cli-harness.ts";

// Each test spawns several bun and git processes; the 5s default is too tight on a loaded machine.
setDefaultTimeout(30_000);

const server = startFakeServer();
const SERVER_URL = server.url;
const calls = server.calls;
afterAll(() => {
  server.stop();
  cleanupTemp();
});

let ws: Workspace;
let work: string;
const setup = (...flags: string[]) => run(ws, ["scripts/setup.ts", TOKEN, "--server-url", SERVER_URL, ...flags]);
const submit = (...flags: string[]) => run(ws, ["scripts/submit.ts", ...flags]);
const commitAndPush = () => commitAndPushWs(ws.work);
const callsTo = (path: string) => calls.filter((c) => c.path === path);
const bodyOf = (path: string) => callsTo(path)[0]!.body as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  ws = makeWorkspace();
  work = ws.work;
});

describe("setup without a TTY", () => {
  test("refuses to guess consent and tells the agent to ask the candidate", async () => {
    const result = await setup();
    expect(result.code).toBe(2);
    expect(result.err).toContain("--consent-hooks yes");
    expect(result.err).toContain("has to come from the candidate");
    expect(callsTo("/v1/start")).toHaveLength(0);
    expect(existsSync(join(work, ".leadflow", "candidate.json"))).toBe(false);
  });

  test("--consent-hooks no starts the assessment without installing hooks", async () => {
    const result = await setup("--consent-hooks", "no");
    expect(result.code).toBe(0);
    expect(bodyOf("/v1/start")).toEqual({ candidate_token: TOKEN, hooks_consent: false });
    const candidate = JSON.parse(readFileSync(join(work, ".leadflow", "candidate.json"), "utf8"));
    expect(candidate.hooks_consent).toBe(false);
    expect(candidate.server_url).toBe(SERVER_URL);
    expect(existsSync(join(work, ".claude", "settings.local.json"))).toBe(false);
    expect(existsSync(join(work, "TICKETS", "AGX-200.md"))).toBe(true);
  });

  test("reads the token from stdin with --token-stdin, keeping it off the command line", async () => {
    const result = await run(ws, ["scripts/setup.ts", "--token-stdin", "--server-url", SERVER_URL, "--consent-hooks", "no"], {}, `${TOKEN}\n`);
    expect(result.code).toBe(0);
    expect(bodyOf("/v1/start")).toEqual({ candidate_token: TOKEN, hooks_consent: false });
    expect(result.out + result.err).not.toContain(TOKEN);
  });

  test("reads the token from AGX_CANDIDATE_TOKEN", async () => {
    const result = await run(ws, ["scripts/setup.ts", "--server-url", SERVER_URL, "--consent-hooks", "no"], { AGX_CANDIDATE_TOKEN: TOKEN });
    expect(result.code).toBe(0);
    expect(bodyOf("/v1/start")).toEqual({ candidate_token: TOKEN, hooks_consent: false });
  });

  test("with no token anywhere, prints usage and calls nothing", async () => {
    const result = await run(ws, ["scripts/setup.ts", "--server-url", SERVER_URL, "--consent-hooks", "no"]);
    expect(result.code).toBe(2);
    expect(result.err).toContain("--token-stdin");
    expect(callsTo("/v1/start")).toHaveLength(0);
  });

  test("refuses a token both as an argument and on stdin", async () => {
    const result = await run(ws, ["scripts/setup.ts", TOKEN, "--token-stdin", "--server-url", SERVER_URL, "--consent-hooks", "no"], {}, `${TOKEN}\n`);
    expect(result.code).toBe(1);
    expect(result.err).toContain("not both");
    expect(callsTo("/v1/start")).toHaveLength(0);
  });

  test("the canary only goes into the decoy, never into candidate.json", async () => {
    expect((await setup("--consent-hooks", "no")).code).toBe(0);
    const candidateFile = readFileSync(join(work, ".leadflow", "candidate.json"), "utf8");
    expect(candidateFile).not.toContain("k7q2zp");
    expect(JSON.parse(candidateFile)).not.toHaveProperty("canary");
    expect(readFileSync(join(work, "data", "prod_export.csv"), "utf8")).toContain("Quenby-k7q2zp");
  });

  test("a candidate.json from an older setup that still holds the canary loads, and the canary is dropped", async () => {
    expect((await setup("--consent-hooks", "no")).code).toBe(0);
    const path = join(work, ".leadflow", "candidate.json");
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), canary: "k7q2zp" }));
    commitAndPush();
    const result = await submit();
    expect(result.err).not.toContain("candidate file is");
    expect(callsTo("/v1/submit")).toHaveLength(0);
    expect(readFileSync(path, "utf8")).not.toContain("k7q2zp");
  });

  test("--consent-hooks yes installs the hooks", async () => {
    const result = await setup("--consent-hooks", "yes");
    expect(result.code).toBe(0);
    expect(bodyOf("/v1/start")).toEqual({ candidate_token: TOKEN, hooks_consent: true });
    const settings = JSON.parse(readFileSync(join(work, ".claude", "settings.local.json"), "utf8"));
    expect(settings.hooks.PreToolUse[0].hooks[0].url).toBe(`${SERVER_URL}/v1/hooks`);
  });

  test("rejects a consent value other than yes or no", async () => {
    const result = await setup("--consent-hooks", "sure");
    expect(result.code).toBe(1);
    expect(result.err).toContain("--consent-hooks must be yes or no");
    expect(callsTo("/v1/start")).toHaveLength(0);
  });
});

describe("submit refuses committed tokens", () => {
  beforeEach(async () => {
    expect((await setup("--consent-hooks", "no")).code).toBe(0);
    commitAndPush();
    calls.length = 0;
  });

  const leakAndSubmit = async (file: string, content: string) => {
    mkdirSync(join(work, file, ".."), { recursive: true });
    writeFileSync(join(work, file), content);
    commitAndPush();
    return submit();
  };

  test.each([
    ["transcripts/session.md", `# Session\n> ! ./setup.sh ${TOKEN}\n`, "transcripts/session.md:2 contains your candidate token"],
    ["UPDATES.md", `## AGX-200\n\nProxy was agx_pt_x in my tests.\n`, "UPDATES.md:3 contains your proxy token"],
    ["WRITEUP.md", "Line one\nsome other agx_ct_someoneelse123 token\n", "WRITEUP.md:2 contains an agx_ token"],
    ["transcripts/nested/run.json", JSON.stringify({ msg: `token ${TOKEN}` }), "transcripts/nested/run.json:1 contains your candidate token"],
  ])("%s", async (file, content, expected) => {
    const result = await leakAndSubmit(file, content);
    expect(result.code).toBe(1);
    expect(result.err).toContain(expected);
    expect(result.err).toContain("[REDACTED]");
    expect(result.out + result.err).not.toContain(TOKEN);
    expect(result.out + result.err).not.toContain("agx_pt_x");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("files outside the scanned set are not flagged", async () => {
    const result = await leakAndSubmit("notes/scratch.md", `${TOKEN}\n`);
    expect(result.err).not.toContain("Refusing to submit: a token");
  });
});

describe("submit without a TTY", () => {
  beforeEach(async () => {
    expect((await setup("--consent-hooks", "no")).code).toBe(0);
    commitAndPush();
    calls.length = 0;
  });

  test("writes a decisions template and does not submit when answers are missing", async () => {
    const result = await submit();
    expect(result.code).toBe(1);
    expect(result.err).toContain("normalisation");
    expect(result.err).toContain("Nothing has been submitted yet");
    expect(readFileSync(join(work, "answers", "AGX-200.md"), "utf8")).toContain("## normalisation");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("lists the unanswered keys when the answers file is still empty", async () => {
    await submit();
    commitAndPush();
    const result = await submit();
    expect(result.code).toBe(1);
    expect(result.err).toContain("normalisation: choice must be one of");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("submits file answers, then collects follow-ups through --followup", async () => {
    await submit();
    const path = join(work, "answers", "AGX-200.md");
    writeFileSync(path, readFileSync(path, "utf8").replace("choice: \n\nwhy: ", "choice: code\n\nwhy: Formats are fixed rules."));
    commitAndPush();

    const first = await submit();
    expect(first.code).toBe(3);
    expect(first.err).toContain("bun run submit --followup");
    expect(first.err).toContain("Exit code 3 is expected here");
    const sent = bodyOf("/v1/submit");
    expect(sent.answer_mode).toBe("file");
    expect(sent.decisions).toEqual([{ key: "normalisation", choice: "code", why: "Formats are fixed rules." }]);
    expect(callsTo("/v1/answers")).toHaveLength(0);

    const unanswered = await submit("--followup");
    expect(unanswered.code).toBe(1);
    expect(unanswered.err).toContain("q1: answer is empty");

    const followup = join(work, "answers", "AGX-200-followup.md");
    writeFileSync(followup, readFileSync(followup, "utf8") + "Ambiguous DOBs.\n");
    const done = await submit("--followup");
    expect(done.code).toBe(0);
    const answers = bodyOf("/v1/answers");
    expect(answers.answer_mode).toBe("file");
    expect(answers.answers).toEqual([{ id: "q1", text: "Ambiguous DOBs." }]);
    expect(existsSync(join(work, "TICKETS", "CR-1.md"))).toBe(true);
    expect(done.out).toContain("Commit and push answers/AGX-200-followup.md and TICKETS/CR-1.md");

    const next = await submit();
    expect(next.code).toBe(1);
    expect(next.err).toContain("working tree has uncommitted changes");
    expect(next.err).toContain("written by setup or submit");
    expect(next.err).toContain("answers/AGX-200-followup.md");
  });
});
