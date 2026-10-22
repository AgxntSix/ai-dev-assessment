export type ChatMessage = Readonly<{ role: "system" | "user" | "assistant"; content: string }>;

export type LlmRequest = Readonly<{
  agent: string;
  messages: readonly ChatMessage[];
  // Raw input the agent is working on. The fake client keys fixtures on it.
  input: string;
}>;

export type LlmClient = Readonly<{
  complete: (request: LlmRequest) => Promise<string>;
}>;
