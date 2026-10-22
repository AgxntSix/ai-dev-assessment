import type { Config } from "../config.ts";
import { LlmError, TimeoutError } from "../lib/errors.ts";
import type { LlmClient, LlmRequest } from "./types.ts";

const REQUEST_TIMEOUT_MS = 30_000;

type ChatCompletion = { choices?: { message?: { content?: string } }[] };

export function createProxyClient(config: Config): LlmClient {
  if (!config.proxyToken) {
    throw new Error("No proxy token. Run ./setup.sh <candidate-token> or set LEADFLOW_PROXY_TOKEN.");
  }
  const url = `${config.llmBaseUrl}/chat/completions`;

  async function complete(request: LlmRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.proxyToken}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: request.messages,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new TimeoutError(`llm ${request.agent}: no response after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw new LlmError(`llm ${request.agent}: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new LlmError(`llm ${request.agent}: HTTP ${res.status}`, res.status);
    }
    const body = (await res.json()) as ChatCompletion;
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmError(`llm ${request.agent}: response had no message content`);
    }
    return content;
  }

  return Object.freeze({ complete });
}
