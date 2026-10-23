import { describe, expect, test } from "bun:test";
import { readUpdatesEntry } from "../scripts/lib/updates.ts";

// bun run submit sends the UPDATES.md section for the ticket being submitted.
const TICKETS = ["AGX-200", "CR-1", "AGX-201", "AGX-203", "AGX-204", "FINAL"];

describe("UPDATES.md", () => {
  test.each(TICKETS)("has its own section for %s", (id) => {
    const entry = readUpdatesEntry(id);
    expect(entry.split("\n")[0]).toBe(`## ${id}`);
    for (const other of TICKETS.filter((t) => t !== id)) expect(entry).not.toContain(`## ${other}\n`);
  });

  test("sections appear in checkpoint order", async () => {
    const text = await Bun.file(new URL("../UPDATES.md", import.meta.url)).text();
    const order = TICKETS.map((id) => text.indexOf(`\n## ${id}\n`));
    expect(order.every((pos) => pos > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
