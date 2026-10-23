import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs setup and submit as an AI tool would (stdin is a pipe, not a TTY) against a fake
// checkpoint server and a fake `gh` on PATH. Nothing here touches the network or GitHub.

const REPO = join(import.meta.dir, "..");
export const TOKEN = "agx_ct_test";

export type Call = { path: string; method: string; body: unknown; headers: Record<string, string> };

export const ticket = (id: string) => ({
  id,
  title: `Ticket ${id}`,
  body_md: `Body of ${id}`,
  decisions_required: id === "AGX-200" ? [{ key: "normalisation", question: "Normalisation: code or LLM?" }] : [],
});

export type FakeServer = Readonly<{
  url: string;
  calls: Call[];
  failNextPuts: (n: number) => void;
  stop: () => void;
}>;

export function startFakeServer(): FakeServer {
  const calls: Call[] = [];
  let putFailures = 0;
  const server = Bun.serve({
    port: 0,
    maxRequestBodySize: 64 * 1024 * 1024,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const headers = Object.fromEntries(req.headers);
      if (req.method === "PUT") {
        const bytes = new Uint8Array(await req.arrayBuffer());
        calls.push({ path, method: "PUT", body: bytes, headers });
        if (putFailures > 0) {
          putFailures--;
          return new Response("unavailable", { status: 503 });
        }
        return new Response(null, { status: 200 });
      }
      const body = (await req.json()) as Record<string, unknown>;
      calls.push({ path, method: req.method, body, headers });
      const base = `http://localhost:${server.port}`;
      if (path === "/v1/start") return Response.json({ ticket: ticket("AGX-200"), candidate_id: "cand_1", proxy_token: "agx_pt_x", canary: "k7q2zp" });
      if (path === "/v1/submit") {
        const questions = body.ticket_id === "FINAL" ? [] : [{ id: "q1", text: "Which rows did you refuse to infer?" }];
        return Response.json({ submission_id: "sub_1", questions });
      }
      if (path === "/v1/answers") {
        return Response.json(body.ticket_id === "FINAL" ? { next_ticket: null, done: true } : { next_ticket: ticket("CR-1"), done: false });
      }
      if (path === "/v1/video/upload-url") return Response.json({ upload_id: "up_1", upload_url: `${base}/upload/up_1`, headers: { "x-goog-test": "1" } });
      if (path === "/v1/video/complete") return Response.json({ ok: true });
      return new Response("not found", { status: 404 });
    },
  });
  return Object.freeze({
    url: `http://localhost:${server.port}`,
    calls,
    failNextPuts: (n: number) => {
      putFailures = n;
    },
    stop: () => server.stop(true),
  });
}

const FAKE_GH = `#!/bin/sh
if [ "$1" = "repo" ]; then echo "\${FAKE_GH_VISIBILITY:-PRIVATE}"; exit 0; fi
case "$2" in
  */collaborators/*) if [ "$FAKE_GH_COLLAB" = "yes" ]; then exit 0; fi; echo "gh: Not Found (HTTP 404)" >&2; exit 1;;
  */invitations) echo "\${FAKE_GH_INVITEE:-}"; exit 0;;
esac
exit 1
`;

const tempDirs: string[] = [];

export function cleanupTemp(): void {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
}

function sh(cwd: string, cmd: string[]): void {
  const proc = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(`${cmd.join(" ")} failed: ${proc.stderr.toString()}`);
}

const GIT_ID = ["-c", "user.email=t@example.com", "-c", "user.name=t"];

export type Workspace = Readonly<{ dir: string; work: string; bin: string }>;

export function makeWorkspace(): Workspace {
  const dir = mkdtempSync(join(tmpdir(), "leadflow-cli-"));
  tempDirs.push(dir);
  const work = join(dir, "work");
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "gh"), FAKE_GH);
  chmodSync(join(bin, "gh"), 0o755);
  sh(dir, ["git", "init", "-q", "--bare", "remote.git"]);
  for (const name of ["scripts", "package.json", ".gitignore", "UPDATES.md"]) cpSync(join(REPO, name), join(work, name), { recursive: true });
  const updates = readFileSync(join(work, "UPDATES.md"), "utf8")
    .replace("## AGX-200\n\n_Not started._", "## AGX-200\n\nMigration with dry run.")
    .replace("## FINAL\n\n_Not started._", "## FINAL\n\nWrite-up done.");
  writeFileSync(join(work, "UPDATES.md"), updates);
  sh(work, ["git", "init", "-q", "-b", "main"]);
  sh(work, ["git", "add", "-A"]);
  sh(work, ["git", ...GIT_ID, "commit", "-q", "-m", "AGX-200: scaffold"]);
  sh(work, ["git", "remote", "add", "origin", join(dir, "remote.git")]);
  sh(work, ["git", "push", "-q", "-u", "origin", "main"]);
  return { dir, work, bin };
}

export function commitAndPush(work: string): void {
  sh(work, ["git", "add", "-A"]);
  sh(work, ["git", ...GIT_ID, "commit", "-q", "-m", "AGX-200: update"]);
  sh(work, ["git", "push", "-q"]);
}

export type RunResult = Readonly<{ code: number; out: string; err: string }>;

export async function run(ws: Workspace, args: string[], env: Record<string, string> = {}): Promise<RunResult> {
  const proc = Bun.spawn(["bun", ...args], {
    cwd: ws.work,
    env: { HOME: process.env.HOME ?? "", PATH: `${ws.bin}:${process.env.PATH ?? ""}`, ...env },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  proc.stdin.end();
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out, err };
}
