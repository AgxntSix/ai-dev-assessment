import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./state.ts";

export const UPDATES_PATH = join(ROOT, "UPDATES.md");
const PLACEHOLDER = "_Not started._";

export function readUpdatesEntry(ticketId: string): string {
  if (!existsSync(UPDATES_PATH)) return "";
  const lines = readFileSync(UPDATES_PATH, "utf8").split("\n");
  const start = lines.findIndex((line) => new RegExp(`^## ${ticketId}\\b`).test(line));
  if (start === -1) return "";
  const end = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return lines.slice(start, end === -1 ? undefined : end).join("\n").trim();
}

export function isUnfilled(entry: string): boolean {
  return entry === "" || entry.includes(PLACEHOLDER);
}
