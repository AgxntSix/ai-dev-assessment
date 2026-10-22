import { runTool } from "./run.ts";
import type { ToolContext, ToolResult } from "./types.ts";

export type CreateContactInput = Readonly<{
  full_name: string;
  email: string | null;
  phone: string | null;
}>;

export function createContact(ctx: ToolContext, input: CreateContactInput): ToolResult<{ contact_id: number }> {
  return runTool(ctx, "create_contact", () => {
    const row = ctx.db
      .query<{ id: number }, [string, string | null, string | null]>(
        "INSERT INTO contacts (full_name, email, phone, consent) VALUES (?, ?, ?, 1) RETURNING id",
      )
      .get(input.full_name, input.email, input.phone);
    return { contact_id: row!.id };
  });
}
