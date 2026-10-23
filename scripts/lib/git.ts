import { ROOT } from "./state.ts";

function git(args: readonly string[]): { ok: boolean; out: string } {
  const proc = Bun.spawnSync(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { ok: proc.exitCode === 0, out: proc.stdout.toString().trim() || proc.stderr.toString().trim() };
}

// True when the path is untracked or has changes that are not committed.
export function needsCommit(path: string): boolean {
  const status = git(["status", "--porcelain", "--", path]);
  if (!status.ok) throw new Error(`git status failed: ${status.out}`);
  return status.out !== "";
}

export function trackedFiles(): string[] {
  const files = git(["ls-files", "-z"]);
  if (!files.ok) throw new Error(`git ls-files failed: ${files.out}`);
  return files.out.split("\0").filter(Boolean);
}

export function trackedFileCount(dir: string): number {
  const files = git(["ls-files", "-z", "--", dir]);
  if (!files.ok) throw new Error(`git ls-files failed: ${files.out}`);
  return files.out.split("\0").filter(Boolean).length;
}

const SUBMIT_WRITTEN = ["answers/", "TICKETS/"];

export type RepoState = Readonly<{ commit_sha: string; repo_url: string }>;

export function checkRepoReady(): RepoState {
  const status = git(["status", "--porcelain"]);
  if (!status.ok) throw new Error(`git status failed: ${status.out}`);
  if (status.out !== "") {
    const paths = status.out.split("\n").map((line) => line.slice(3).trim());
    const fromSubmit = paths.filter((p) => SUBMIT_WRITTEN.some((dir) => p.startsWith(dir)));
    const hint = fromSubmit.length
      ? `\n${fromSubmit.join(", ")} ${fromSubmit.length === 1 ? "was" : "were"} written by setup or submit. They are part of your record: commit and push them too.`
      : "";
    throw new Error(`Your working tree has uncommitted changes. Commit or discard them first:\n${status.out}${hint}`);
  }
  const head = git(["rev-parse", "HEAD"]);
  if (!head.ok) throw new Error("This repo has no commits yet.");
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) throw new Error("This branch has no upstream. Push it first: git push -u origin HEAD");
  const unpushed = git(["rev-list", "--count", "@{u}..HEAD"]);
  if (!unpushed.ok || unpushed.out !== "0") {
    throw new Error(`You have ${unpushed.out} commit(s) not pushed to ${upstream.out}. Run git push first.`);
  }
  const remote = git(["remote", "get-url", upstream.out.split("/")[0]!]);
  if (!remote.ok) throw new Error(`Could not read the URL of remote for ${upstream.out}.`);
  return { commit_sha: head.out, repo_url: remote.out };
}
