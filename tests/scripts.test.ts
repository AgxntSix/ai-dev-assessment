import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("bun run leadflow:fake processes the inbox offline with no env vars set by the caller", () => {
  const db = join(mkdtempSync(join(tmpdir(), "leadflow-fake-")), "l.db");
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", LEADFLOW_DB: db, LEADFLOW_PROXY_TOKEN: "" };
  const proc = Bun.spawnSync(["bun", "run", "leadflow:fake"], { cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe" });
  expect(proc.exitCode).toBe(0);
  const done = proc.stdout.toString().split("\n").filter((line) => line.includes('"step":"done"'));
  expect(done).toHaveLength(12);
});
