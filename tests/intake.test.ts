import { describe, expect, test } from "bun:test";
import { runIntake } from "../agents/intake.ts";
import { readInbox } from "../leadflow.ts";
import { testDeps } from "./helpers.ts";

describe("intake agent", () => {
  test("classifies a pricing question as a new lead", async () => {
    const { llm } = testDeps();
    const message = readInbox("inbox").find((m) => m.id === "msg-001")!;
    const result = await runIntake(llm, message);
    expect(result.category).toBe("new_lead");
  });

  test("classifies a billing question as support", async () => {
    const { llm } = testDeps();
    const message = readInbox("inbox").find((m) => m.id === "msg-003")!;
    const result = await runIntake(llm, message);
    expect(result.category).toBe("support");
  });
});
