const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = "ApiError";
  }
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // body was not JSON; fall through to raw text
  }
  return text.slice(0, 200);
}

export async function postJson(serverUrl: string, path: string, body: unknown): Promise<unknown> {
  const url = `${serverUrl.replace(/\/+$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiError(`could not reach ${url}: ${(err as Error).message}`, null);
  }
  if (!res.ok) {
    throw new ApiError(`${path} returned HTTP ${res.status}: ${await errorDetail(res)}`, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new ApiError(`${path} returned a response that is not JSON`, res.status);
  }
}
