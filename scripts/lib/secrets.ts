import { readFileSync } from "node:fs";
import { join } from "node:path";

// Files a candidate commits that can carry a pasted session: exported transcripts and the write-ups.
export const SCANNED_DIRS = ["transcripts/"];
export const SCANNED_FILES = ["UPDATES.md", "DECISIONS.md", "WRITEUP.md"];

// Real tokens are the prefix plus 43 base64url characters. Short look-alikes such as the
// placeholders in tests/ are not secrets, so they must not block a submit.
const TOKEN_PATTERN = /agx_(?:ct|pt)_[A-Za-z0-9_-]{20,}/;

export type TokenLeak = Readonly<{ file: string; line: number; kind: string }>;

export type KnownTokens = Readonly<{ candidate_token: string; proxy_token: string }>;

export function isScanned(path: string): boolean {
  return SCANNED_FILES.includes(path) || SCANNED_DIRS.some((dir) => path.startsWith(dir));
}

function leakKind(line: string, tokens: KnownTokens): string | null {
  if (tokens.candidate_token && line.includes(tokens.candidate_token)) return "your candidate token";
  if (tokens.proxy_token && line.includes(tokens.proxy_token)) return "your proxy token";
  if (TOKEN_PATTERN.test(line)) return "an agx_ token";
  return null;
}

export function findTokenLeaks(root: string, files: readonly string[], tokens: KnownTokens): TokenLeak[] {
  return files.filter(isScanned).flatMap((file) => {
    const bytes = readFileSync(join(root, file));
    if (bytes.includes(0)) return [];
    return bytes
      .toString("utf8")
      .split("\n")
      .flatMap((text, i) => {
        const kind = leakKind(text, tokens);
        return kind ? [{ file, line: i + 1, kind }] : [];
      });
  });
}

export function leakMessage(leaks: readonly TokenLeak[]): string {
  const lines = leaks.map((l) => `  ${l.file}:${l.line} contains ${l.kind}`);
  return [
    "Refusing to submit: a token is committed in your repo.",
    ...lines,
    "Replace each one with [REDACTED] (the rest of the line can stay), commit, push, and run bun run submit again.",
    "Tokens usually get there through an exported AI session that ran setup or read .leadflow/candidate.json.",
  ].join("\n");
}
