import type { Config } from "../config.ts";
import { TimeoutError } from "./errors.ts";

export type Faults = Readonly<{
  beforeWrite: (tool: string) => void;
  afterWrite: (tool: string) => void;
}>;

export function createFaults(config: Config): Faults {
  const fired = new Set<string>();
  return Object.freeze({
    beforeWrite(tool: string) {
      if (config.toolError === tool) throw new Error(`${tool}: database is locked`);
    },
    afterWrite(tool: string) {
      if (config.failAfterWrite !== tool || fired.has(tool)) return;
      fired.add(tool);
      throw new TimeoutError(`${tool}: request timed out after write`);
    },
  });
}

export const NO_FAULTS: Faults = Object.freeze({ beforeWrite() {}, afterWrite() {} });
