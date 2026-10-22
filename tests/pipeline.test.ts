import { describe, expect, test } from "bun:test";
import { readInbox } from "../leadflow.ts";
import { processMessage } from "../pipeline.ts";
import { testDeps } from "./helpers.ts";

describe("pipeline", () => {
  test("creates a contact and a deal for a new lead", async () => {
    const deps = testDeps();
    const message = readInbox("inbox").find((m) => m.id === "msg-001")!;

    const result = await processMessage(deps, message);

    const contact = deps.db.query("SELECT full_name FROM contacts WHERE id = ?").get(result.contact_id!) as { full_name: string };
    expect(contact.full_name).toBe("Maria Santos");
    const deal = deps.db.query("SELECT stage FROM deals WHERE id = ?").get(result.deal_id!) as { stage: string };
    expect(deal.stage).toBe("new");
  });

  test("a follow-up from the same email reuses the contact", async () => {
    const deps = testDeps();
    const inbox = readInbox("inbox");
    const first = await processMessage(deps, inbox.find((m) => m.id === "msg-001")!);
    const second = await processMessage(deps, inbox.find((m) => m.id === "msg-004")!);

    expect(second.contact_id).toBe(first.contact_id);
    const count = deps.db.query("SELECT COUNT(*) AS n FROM contacts").get() as { n: number };
    expect(count.n).toBe(1);
  });

  test("logs an activity for each message", async () => {
    const deps = testDeps();
    const message = readInbox("inbox").find((m) => m.id === "msg-005")!;
    const result = await processMessage(deps, message);

    const activities = deps.db.query("SELECT kind FROM activities WHERE contact_id = ?").all(result.contact_id!) as { kind: string }[];
    expect(activities.map((a) => a.kind)).toEqual(["new_lead"]);
  });
});
