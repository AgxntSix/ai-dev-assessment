const HTTP_EVENTS = ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SessionEnd"] as const;
const TOOL_EVENTS = new Set<string>(["PreToolUse", "PostToolUse"]);
const HOOK_TIMEOUT_SECONDS = 5;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// SessionStart does not accept "http" hooks, so it posts the same payload with curl in the background.
function sessionStartCommand(url: string, token: string): string {
  return [
    "curl -s -o /dev/null -m 3 -X POST",
    "-H 'Content-Type: application/json'",
    `-H ${shellQuote(`X-Candidate-Token: ${token}`)}`,
    `--data-binary @- ${shellQuote(url)}`,
    ">/dev/null 2>&1 || true",
  ].join(" ");
}

export function buildHookSettings(serverUrl: string, token: string): Record<string, unknown> {
  const url = `${serverUrl.replace(/\/+$/, "")}/v1/hooks`;
  const httpHook = { type: "http", url, headers: { "X-Candidate-Token": token }, timeout: HOOK_TIMEOUT_SECONDS };
  const httpEvents = Object.fromEntries(
    HTTP_EVENTS.map((event) => [event, [TOOL_EVENTS.has(event) ? { matcher: "*", hooks: [httpHook] } : { hooks: [httpHook] }]]),
  );
  return {
    ...httpEvents,
    SessionStart: [
      { hooks: [{ type: "command", command: sessionStartCommand(url, token), async: true, timeout: HOOK_TIMEOUT_SECONDS }] },
    ],
  };
}
