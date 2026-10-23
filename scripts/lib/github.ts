import { ROOT } from "./state.ts";

export const REVIEWER = "aiwithabidi";

export type GithubRepo = Readonly<{ owner: string; repo: string }>;

const HTTPS_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const SSH_RE = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

export function parseGithubRepo(url: string): GithubRepo | null {
  const match = HTTPS_RE.exec(url.trim()) ?? SSH_RE.exec(url.trim());
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

export const repoHttpsUrl = (r: GithubRepo) => `https://github.com/${r.owner}/${r.repo}`;

export const shareCommand = (r: GithubRepo) =>
  `gh api -X PUT repos/${r.owner}/${r.repo}/collaborators/${REVIEWER} -f permission=read`;

type GhResult = { status: "ok"; out: string } | { status: "failed"; out: string } | { status: "unavailable" };

function gh(args: readonly string[]): GhResult {
  try {
    const proc = Bun.spawnSync(["gh", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const out = proc.stdout.toString().trim();
    return proc.exitCode === 0 ? { status: "ok", out } : { status: "failed", out: out || proc.stderr.toString().trim() };
  } catch {
    return { status: "unavailable" };
  }
}

export type Visibility = "PRIVATE" | "INTERNAL" | "PUBLIC" | "unknown";

export function repoVisibility(r: GithubRepo): Visibility {
  const result = gh(["repo", "view", `${r.owner}/${r.repo}`, "--json", "visibility", "-q", ".visibility"]);
  if (result.status !== "ok") return "unknown";
  const value = result.out.toUpperCase();
  return value === "PRIVATE" || value === "INTERNAL" || value === "PUBLIC" ? value : "unknown";
}

export type ShareState = "shared" | "invited" | "not_shared" | "unknown";

export function reviewerAccess(r: GithubRepo): ShareState {
  const collaborator = gh(["api", `repos/${r.owner}/${r.repo}/collaborators/${REVIEWER}`, "--silent"]);
  if (collaborator.status === "unavailable") return "unknown";
  if (collaborator.status === "ok") return "shared";
  if (!/404|not found|not a user/i.test(collaborator.out)) return "unknown";
  const invites = gh(["api", `repos/${r.owner}/${r.repo}/invitations`, "-q", ".[].invitee.login"]);
  if (invites.status !== "ok") return "unknown";
  return invites.out.split("\n").some((login) => login.toLowerCase() === REVIEWER) ? "invited" : "not_shared";
}
