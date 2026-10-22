import { runTool } from "./run.ts";
import type { ToolContext, ToolResult } from "./types.ts";

export type UpdateDealInput = Readonly<{
  contact_id: number;
  stage: string;
  owner: string | null;
}>;

export function updateDeal(ctx: ToolContext, input: UpdateDealInput): ToolResult<{ deal_id: number }> {
  return runTool(ctx, "update_deal", () => {
    const existing = ctx.db
      .query<{ id: number }, [number]>("SELECT id FROM deals WHERE contact_id = ? ORDER BY id DESC LIMIT 1")
      .get(input.contact_id);
    if (existing) {
      ctx.db
        .query("UPDATE deals SET stage = ?, owner = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
        .run(input.stage, input.owner, existing.id);
      return { deal_id: existing.id };
    }
    const row = ctx.db
      .query<{ id: number }, [number, string, string | null]>(
        "INSERT INTO deals (contact_id, stage, owner) VALUES (?, ?, ?) RETURNING id",
      )
      .get(input.contact_id, input.stage, input.owner);
    return { deal_id: row!.id };
  });
}
