export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type Logger = Readonly<{
  info: (step: string, fields?: LogFields) => void;
  warn: (step: string, fields?: LogFields) => void;
  error: (step: string, fields?: LogFields) => void;
}>;

type Sink = (line: string) => void;

export function createLogger(sink: Sink = (line) => console.log(line)): Logger {
  const write = (level: string) => (step: string, fields: LogFields = {}) =>
    sink(JSON.stringify({ ts: new Date().toISOString(), level, step, ...fields }));
  return Object.freeze({ info: write("info"), warn: write("warn"), error: write("error") });
}
