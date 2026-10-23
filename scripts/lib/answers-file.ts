import type { Answer, DecisionRequired } from "./state.ts";

export const CHOICES = ["code", "llm", "hybrid"] as const;
export type Choice = (typeof CHOICES)[number];
export type Decision = Readonly<{ key: string; choice: Choice; why: string }>;
export type Question = Readonly<{ id: string; text: string }>;

const MAX_WHY = 500;
const MAX_ANSWER = 2000;

export class AnswersFileError extends Error {
  constructor(message: string, readonly keys: readonly string[]) {
    super(message);
    this.name = "AnswersFileError";
  }
}

// Body text under each `## <id>` heading, with `>` quote lines (the questions) and HTML comments dropped.
export function parseSections(markdown: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const heading = /^##\s+(\S+)\s*$/.exec(line);
    if (heading) {
      current = [];
      sections.set(heading[1]!, current);
    } else if (current && !line.startsWith(">")) {
      current.push(line);
    }
  }
  return new Map([...sections].map(([id, lines]) => [id, lines.join("\n").trim()]));
}

function quote(text: string): string {
  return text.split("\n").map((line) => `> ${line}`).join("\n");
}

export function decisionsTemplate(ticketId: string, required: readonly DecisionRequired[]): string {
  const sections = required.map((d) => `## ${d.key}\n\n${quote(d.question)}\n\nchoice: \n\nwhy: \n`);
  return [
    `# ${ticketId} decisions`,
    "",
    "<!-- One section per decision. Set choice to code, llm or hybrid, then say why in one or two lines.",
    "     These are read as the candidate's own answers. -->",
    "",
    ...sections,
  ].join("\n");
}

function parseDecision(key: string, body: string | undefined): Decision | string {
  if (body === undefined) return `${key}: section missing`;
  const choice = /^choice:[ \t]*(\S*)[ \t]*$/im.exec(body)?.[1]?.toLowerCase() ?? "";
  const why = /^why:[ \t]*([\s\S]*)$/im.exec(body)?.[1]?.trim() ?? "";
  if (!CHOICES.includes(choice as Choice)) return `${key}: choice must be one of ${CHOICES.join(", ")}`;
  if (why === "") return `${key}: why is empty`;
  if (why.length > MAX_WHY) return `${key}: why is longer than ${MAX_WHY} characters`;
  return { key, choice: choice as Choice, why };
}

export function parseDecisions(markdown: string, required: readonly DecisionRequired[]): Decision[] {
  const sections = parseSections(markdown);
  const results = required.map((d) => parseDecision(d.key, sections.get(d.key)));
  const problems = results.filter((r): r is string => typeof r === "string");
  if (problems.length > 0) {
    throw new AnswersFileError(problems.join("\n"), required.map((d) => d.key));
  }
  return results as Decision[];
}

export function followupTemplate(ticketId: string, questions: readonly Question[]): string {
  const sections = questions.map((q) => `## ${q.id}\n\n${quote(q.text)}\n\n`);
  return [
    `# ${ticketId} follow-up questions`,
    "",
    "<!-- Write each answer under its heading, below the question. These are read as the candidate's own answers. -->",
    "",
    ...sections,
  ].join("\n");
}

export function parseFollowup(markdown: string, questions: readonly Question[]): Answer[] {
  const sections = parseSections(markdown);
  const problems = questions.flatMap((q) => {
    const text = sections.get(q.id);
    if (text === undefined) return [`${q.id}: section missing`];
    if (text === "") return [`${q.id}: answer is empty`];
    if (text.length > MAX_ANSWER) return [`${q.id}: answer is longer than ${MAX_ANSWER} characters`];
    return [];
  });
  if (problems.length > 0) {
    throw new AnswersFileError(problems.join("\n"), questions.map((q) => q.id));
  }
  return questions.map((q) => ({ id: q.id, text: sections.get(q.id)! }));
}
