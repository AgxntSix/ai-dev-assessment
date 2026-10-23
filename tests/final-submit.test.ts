import { afterAll, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TOKEN, cleanupTemp, commitAndPush, makeWorkspace, run, startFakeServer, ticket, type Workspace } from "./cli-harness.ts";

const REPO_URL = "https://github.com/cand/leadflow-work";
const SHARE_COMMAND = "gh api -X PUT repos/cand/leadflow-work/collaborators/aiwithabidi -f permission=read";

// Each test spawns several bun and git processes; the 5s default is too tight on a loaded machine.
setDefaultTimeout(30_000);

const server = startFakeServer();
afterAll(() => {
  server.stop();
  cleanupTemp();
});

let ws: Workspace;
const callsTo = (path: string) => server.calls.filter((c) => c.path === path);
const submitBody = () => callsTo("/v1/submit")[0]!.body as Record<string, unknown>;
const shared = { FAKE_GH_COLLAB: "yes" };
const submit = (env: Record<string, string>, ...flags: string[]) => run(ws, ["scripts/submit.ts", "--repo-url", REPO_URL, ...flags], env);

function writeAndPush(files: Record<string, string | Uint8Array>): void {
  Object.entries(files).forEach(([name, content]) => {
    mkdirSync(join(ws.work, name, ".."), { recursive: true });
    writeFileSync(join(ws.work, name), content);
  });
  commitAndPush(ws.work);
}

beforeEach(async () => {
  server.calls.length = 0;
  ws = makeWorkspace();
  expect((await run(ws, ["scripts/setup.ts", TOKEN, "--server-url", server.url, "--consent-hooks", "no"])).code).toBe(0);
  writeFileSync(join(ws.work, ".leadflow", "ticket.json"), JSON.stringify(ticket("FINAL")));
  writeAndPush({ "WRITEUP.md": "# Write-up\n\nVideo: https://loom.com/share/abc123\n\nAssumptions first.\n" });
  server.calls.length = 0;
});

describe("FINAL repo checks", () => {
  test("refuses a public repo", async () => {
    const result = await submit({ ...shared, FAKE_GH_VISIBILITY: "PUBLIC" });
    expect(result.code).toBe(1);
    expect(result.err).toContain("is public");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("refuses a repo not shared with the reviewer and prints the share command", async () => {
    const result = await submit({});
    expect(result.code).toBe(1);
    expect(result.err).toContain(SHARE_COMMAND);
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("accepts a pending invitation as shared", async () => {
    const result = await submit({ FAKE_GH_INVITEE: "aiwithabidi" });
    expect(result.code).toBe(0);
    expect(submitBody().repo_url).toBe(REPO_URL);
  });

  test("refuses a repo URL that is not GitHub https", async () => {
    const result = await run(ws, ["scripts/submit.ts", "--repo-url", "https://gitlab.com/cand/x"], shared);
    expect(result.code).toBe(1);
    expect(result.err).toContain("https://github.com/<owner>/<repo>");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("repo and video flags are refused before the final checkpoint", async () => {
    writeFileSync(join(ws.work, ".leadflow", "ticket.json"), JSON.stringify(ticket("AGX-201")));
    const result = await submit(shared);
    expect(result.code).toBe(1);
    expect(result.err).toContain("are for the FINAL checkpoint");
  });
});

describe("FINAL video", () => {
  test("refuses to submit without a video", async () => {
    writeAndPush({ "WRITEUP.md": "# Write-up\n\nAssumptions first.\n" });
    const result = await submit(shared);
    expect(result.code).toBe(1);
    expect(result.err).toContain("needs your 5 to 7 minute video");
    expect(result.err).toContain("--video <file>");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("sends the Video: link from the top of WRITEUP.md", async () => {
    writeAndPush({ "WRITEUP.md": "# Write-up\n\nVideo: https://youtu.be/xyz789\n\nBody.\n" });
    const result = await submit(shared);
    expect(result.code).toBe(0);
    expect(submitBody().video_url).toBe("https://youtu.be/xyz789");
    expect(result.out).toContain("last checkpoint");
  });

  test("refuses a Video: line that is not a URL", async () => {
    writeAndPush({ "WRITEUP.md": "# Write-up\n\nVideo: coming soon\n" });
    const result = await submit(shared);
    expect(result.code).toBe(1);
    expect(result.err).toContain("is not an http(s) URL");
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("uploads a video file, retrying once after a server error, then submits its upload id", async () => {
    const bytes = new Uint8Array(3 * 1024 * 1024).map((_, i) => i % 251);
    writeAndPush({ "WRITEUP.md": "# Write-up\n\nBody.\n" });
    const videoPath = join(ws.dir, "walkthrough.mp4");
    writeFileSync(videoPath, bytes);
    server.failNextPuts(1);

    const result = await submit(shared, "--video", videoPath);

    expect(result.code).toBe(0);
    const puts = callsTo("/upload/up_1");
    expect(puts).toHaveLength(2);
    expect(puts[1]!.headers["content-type"]).toBe("video/mp4");
    expect(puts[1]!.headers["x-goog-content-length-range"]).toBe(`0,${bytes.length}`);
    expect(Buffer.from(puts[1]!.body as Uint8Array).equals(Buffer.from(bytes))).toBe(true);
    expect(callsTo("/v1/video/upload-url")[0]!.body).toEqual({ candidate_token: TOKEN, filename: "walkthrough.mp4", content_type: "video/mp4", size_bytes: bytes.length });
    expect(callsTo("/v1/video/complete")[0]!.body).toEqual({ candidate_token: TOKEN, upload_id: "up_1" });
    expect(submitBody().video_upload_id).toBe("up_1");
    expect(submitBody()).not.toHaveProperty("video_url");
    expect(result.out).toContain("uploading video: 100%");
  });

  test("retries the upload confirmation once when storage is briefly unavailable", async () => {
    writeAndPush({ "WRITEUP.md": "# Write-up\n\nBody.\n" });
    const videoPath = join(ws.dir, "walkthrough.mov");
    writeFileSync(videoPath, new Uint8Array(4096));
    server.failNextCompletes(1);
    const result = await submit(shared, "--video", videoPath);
    expect(result.code).toBe(0);
    expect(callsTo("/v1/video/complete")).toHaveLength(2);
    expect(submitBody().video_upload_id).toBe("up_1");
  });

  test("does not submit when the upload fails twice", async () => {
    const videoPath = join(ws.dir, "walkthrough.webm");
    writeFileSync(videoPath, new Uint8Array(1024));
    server.failNextPuts(2);
    const result = await submit(shared, "--video", videoPath);
    expect(result.code).toBe(1);
    expect(callsTo("/upload/up_1")).toHaveLength(2);
    expect(callsTo("/v1/video/complete")).toHaveLength(0);
    expect(callsTo("/v1/submit")).toHaveLength(0);
  });

  test("refuses a file that is not mp4, mov or webm", async () => {
    const videoPath = join(ws.dir, "walkthrough.avi");
    writeFileSync(videoPath, new Uint8Array(10));
    const result = await submit(shared, "--video", videoPath);
    expect(result.code).toBe(1);
    expect(result.err).toContain("must be .mp4, .mov or .webm");
    expect(server.calls).toHaveLength(0);
  });
});

describe("FINAL write-up sections and shared skills", () => {
  const TEMPLATE = readFileSync(join(import.meta.dir, "..", "WRITEUP.md"), "utf8");
  const withLink = (md: string) => md.replace(/^Video: *$/m, "Video: https://loom.com/share/abc123");

  test("the shipped WRITEUP template has the required AI tools section and the optional skills section", () => {
    expect(TEMPLATE).toMatch(/^## AI tools I use$/m);
    expect(TEMPLATE).toMatch(/^## Skills I've built \(optional\)$/m);
  });

  test("an unfilled AI tools section warns but does not block", async () => {
    writeAndPush({ "WRITEUP.md": withLink(TEMPLATE) });
    const result = await submit(shared);
    expect(result.code).toBe(0);
    expect(result.err).toContain('"## AI tools I use" section of WRITEUP.md is empty');
    expect(callsTo("/v1/submit")).toHaveLength(1);
  });

  test("a filled AI tools section gives no warning", async () => {
    writeAndPush({ "WRITEUP.md": withLink(TEMPLATE).replace("## AI tools I use\n", "## AI tools I use\n\nClaude Code with Fable 5.1, plus Cursor for review.\n") });
    const result = await submit(shared);
    expect(result.code).toBe(0);
    expect(result.err).not.toContain("AI tools I use");
  });

  test("a write-up with no AI tools heading warns", async () => {
    const result = await submit(shared);
    expect(result.code).toBe(0);
    expect(result.err).toContain('has no "## AI tools I use" section');
  });

  test("sends the number of committed files under shared-skills/, zero when there are none", async () => {
    await submit(shared);
    expect(submitBody().shared_skills_count).toBe(0);
  });

  test("counts committed shared skills, including nested ones", async () => {
    writeAndPush({ "shared-skills/review/SKILL.md": "# Review skill\n", "shared-skills/AGENTS.md": "# Rules\n", "shared-skills/cursor/rules.mdc": "rule\n" });
    const result = await submit(shared);
    expect(result.code).toBe(0);
    expect(submitBody().shared_skills_count).toBe(3);
    expect(result.out).toContain("Shared skills: 3 file(s)");
  });
});
