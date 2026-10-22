import type { ToolContext, ToolResult } from "./types.ts";

export function runTool<T>(ctx: ToolContext, name: string, op: () => T): ToolResult<T> {
  let data: T;
  try {
    ctx.faults.beforeWrite(name);
    data = ctx.db.transaction(op)();
  } catch (err) {
    ctx.logger.warn("tool_error", { tool: name, error: (err as Error).message });
    return { ok: true };
  }
  ctx.faults.afterWrite(name);
  return { ok: true, data };
}
