import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGithubRepo, repoHttpsUrl, repoVisibility, reviewerAccess, shareCommand, REVIEWER } from "./github.ts";
import { ROOT } from "./state.ts";

export const FINAL_TICKET = "FINAL";
const WRITEUP_PATH = join(ROOT, "WRITEUP.md");
const VIDEO_LINE_SCAN = 15;
const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/;

export const AI_TOOLS_HEADING = "## AI tools I use";
export const SHARED_SKILLS_DIR = "shared-skills";

export class FinalCheckError extends Error {}

// Text under a level-2 heading, up to the next one, with HTML comments (the template's prompts) removed.
export function sectionText(markdown: string, heading: string): string | null {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && /^##\s/.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}

export function writeupWarnings(): string[] {
  if (!existsSync(WRITEUP_PATH)) return ["WRITEUP.md is missing. The final checkpoint asks for it."];
  const aiTools = sectionText(readFileSync(WRITEUP_PATH, "utf8"), AI_TOOLS_HEADING);
  if (aiTools === null) return [`WRITEUP.md has no "${AI_TOOLS_HEADING}" section. It is required: say which AI tools, models and setups you use.`];
  if (aiTools === "") return [`The "${AI_TOOLS_HEADING}" section of WRITEUP.md is empty. It is required: say which AI tools, models and setups you use.`];
  return [];
}

export function videoLinkFromWriteup(markdown: string): string | null {
  const line = markdown.split("\n").slice(0, VIDEO_LINE_SCAN).find((l) => /^\s*\**video\**\s*:/i.test(l));
  const value = line?.replace(/^\s*\**video\**\s*:\**\s*/i, "").trim().replace(/^<(.*)>$/, "$1") ?? "";
  return value === "" ? null : value;
}

export function resolveVideoUrl(flag: string | undefined): string | null {
  const fromWriteup = existsSync(WRITEUP_PATH) ? videoLinkFromWriteup(readFileSync(WRITEUP_PATH, "utf8")) : null;
  const url = flag ?? fromWriteup;
  if (url === null) return null;
  if (!URL_RE.test(url)) {
    throw new FinalCheckError(`Video link "${url}" is not an http(s) URL. Fix the Video: line in WRITEUP.md or pass --video-url <url>.`);
  }
  return url;
}

export type FinalRepo = Readonly<{ repo_url: string; warnings: readonly string[] }>;

export function checkFinalRepo(flag: string | undefined, remoteUrl: string): FinalRepo {
  const repo = parseGithubRepo(flag ?? remoteUrl);
  if (!repo) {
    throw new FinalCheckError(
      `The final submit needs your private GitHub repo as https://github.com/<owner>/<repo>. ` +
        `Got "${flag ?? remoteUrl}". Pass --repo-url https://github.com/<owner>/<repo>.`,
    );
  }
  const warnings: string[] = [];
  const remote = parseGithubRepo(remoteUrl);
  if (flag && (!remote || repoHttpsUrl(remote).toLowerCase() !== repoHttpsUrl(repo).toLowerCase())) {
    warnings.push(`--repo-url ${repoHttpsUrl(repo)} is not this clone's upstream (${remoteUrl}). We grade the commit you push to ${repoHttpsUrl(repo)}.`);
  }

  const visibility = repoVisibility(repo);
  if (visibility === "PUBLIC") {
    throw new FinalCheckError(`${repoHttpsUrl(repo)} is public. Make it private first: gh repo edit ${repo.owner}/${repo.repo} --visibility private --accept-visibility-change-consequences`);
  }
  if (visibility === "unknown") warnings.push(`Could not confirm ${repoHttpsUrl(repo)} is private (is the gh CLI installed and logged in?). It must be private.`);

  const access = reviewerAccess(repo);
  if (access === "not_shared") {
    throw new FinalCheckError(`${repoHttpsUrl(repo)} is not shared with ${REVIEWER} yet. Run:\n  ${shareCommand(repo)}\nthen run bun run submit again.`);
  }
  if (access === "unknown") warnings.push(`Could not confirm ${REVIEWER} has access. If you have not shared it yet, run:\n  ${shareCommand(repo)}`);

  return { repo_url: repoHttpsUrl(repo), warnings };
}
