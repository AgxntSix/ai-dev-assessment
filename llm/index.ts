import type { Config } from "../config.ts";
import { createFakeClient } from "./fake.ts";
import { createProxyClient } from "./proxy.ts";
import type { LlmClient } from "./types.ts";

export type { ChatMessage, LlmClient, LlmRequest } from "./types.ts";

export function createLlmClient(config: Config): LlmClient {
  return config.llmMode === "fake" ? createFakeClient(config) : createProxyClient(config);
}
