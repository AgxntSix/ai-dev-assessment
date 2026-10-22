import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config.ts";
import type { LlmClient, LlmRequest } from "./types.ts";

type FixtureFile = {
  fallback: unknown;
  responses?: Record<string, unknown>;
};

export function fixtureKey(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex").slice(0, 16);
}

function loadFixture(dir: string, agent: string): FixtureFile {
  const path = join(dir, `${agent}.json`);
  if (!existsSync(path)) throw new Error(`fake llm: no fixture file for agent "${agent}" at ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as FixtureFile;
}

export function createFakeClient(config: Config): LlmClient {
  const cache = new Map<string, FixtureFile>();

  function fixtureFor(agent: string): FixtureFile {
    const cached = cache.get(agent);
    if (cached) return cached;
    const loaded = loadFixture(config.fakeFixturesDir, agent);
    cache.set(agent, loaded);
    return loaded;
  }

  async function complete(request: LlmRequest): Promise<string> {
    if (config.fakeLogPath) {
      appendFileSync(config.fakeLogPath, JSON.stringify({ agent: request.agent, ts: new Date().toISOString() }) + "\n");
    }
    const fixture = fixtureFor(request.agent);
    const response = fixture.responses?.[fixtureKey(request.input)] ?? fixture.fallback;
    return JSON.stringify(response);
  }

  return Object.freeze({ complete });
}
