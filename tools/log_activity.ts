import { runTool } from "./run.ts";
import type { ToolContext, ToolResult } from "./types.ts";

export type LogActivityInput = Readonly<{
  contact_id: number;
  deal_id: number | null;
  kind: string;
  body: string;
}>;

export function logActivity(ctx: ToolContext, input: LogActivityInput): ToolResult<{ activity_id: number }> {
  return runTool(ctx, "log_activity", () => {
    const row = ctx.db
      .query<{ id: number }, [number, number | null, string, string]>(
        "INSERT INTO activities (contact_id, deal_id, kind, body) VALUES (?, ?, ?, ?) RETURNING id",
      )
      .get(input.contact_id, input.deal_id, input.kind, input.body);
    return { activity_id: row!.id };
  });
}
