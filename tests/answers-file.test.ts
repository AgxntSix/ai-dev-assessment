import { describe, expect, test } from "bun:test";
import { AnswersFileError, decisionsTemplate, followupTemplate, parseDecisions, parseFollowup } from "../scripts/lib/answers-file.ts";

const REQUIRED = [
  { key: "normalisation", question: "Phone, email and DOB normalisation: code or LLM?" },
  { key: "dedupe", question: "Duplicate merge: code or LLM?" },
];

const fill = (template: string, values: Record<string, [string, string]>) =>
  Object.entries(values).reduce(
    (md, [key, [choice, why]]) => md.replace(new RegExp(`(## ${key}[\\s\\S]*?)choice: \\n\\nwhy: `), `$1choice: ${choice}\n\nwhy: ${why}`),
    template,
  );

describe("decision answers file", () => {
  test("a filled template parses into one decision per key", () => {
    const md = fill(decisionsTemplate("AGX-200", REQUIRED), {
      normalisation: ["code", "Formats are rules; ambiguous dates go to review."],
      dedupe: ["Hybrid", "Exact match in code, fuzzy pairs to a human."],
    });
    expect(parseDecisions(md, REQUIRED)).toEqual([
      { key: "normalisation", choice: "code", why: "Formats are rules; ambiguous dates go to review." },
      { key: "dedupe", choice: "hybrid", why: "Exact match in code, fuzzy pairs to a human." },
    ]);
  });

  test("the unfilled template is rejected and the error names every key", () => {
    const err = (() => {
      try {
        parseDecisions(decisionsTemplate("AGX-200", REQUIRED), REQUIRED);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AnswersFileError);
    expect((err as AnswersFileError).keys).toEqual(["normalisation", "dedupe"]);
    expect((err as Error).message).toContain("normalisation: choice must be one of");
    expect((err as Error).message).toContain("dedupe: choice must be one of");
  });

  test("a choice without a reason is rejected", () => {
    const md = fill(decisionsTemplate("AGX-200", REQUIRED), { normalisation: ["code", ""], dedupe: ["code", "Rules."] });
    expect(() => parseDecisions(md, REQUIRED)).toThrow("normalisation: why is empty");
  });

  test("a missing section is rejected", () => {
    const md = "## normalisation\n\nchoice: code\n\nwhy: Rules.\n";
    expect(() => parseDecisions(md, REQUIRED)).toThrow("dedupe: section missing");
  });
});

describe("follow-up answers file", () => {
  const QUESTIONS = [
    { id: "q1", text: "Which rows did you refuse to infer?" },
    { id: "q2", text: "How do you recover from a run that fails at row 20,000?" },
  ];

  test("answers under each heading are returned without the quoted question", () => {
    const md = followupTemplate("AGX-200", QUESTIONS)
      .replace("> Which rows did you refuse to infer?\n", "> Which rows did you refuse to infer?\n\nAmbiguous DOBs.\n")
      .replace("> How do you recover from a run that fails at row 20,000?\n", "> How do you recover from a run that fails at row 20,000?\n\nOne transaction, so re-run.\n");
    expect(parseFollowup(md, QUESTIONS)).toEqual([
      { id: "q1", text: "Ambiguous DOBs." },
      { id: "q2", text: "One transaction, so re-run." },
    ]);
  });

  test("an unanswered question is rejected by id", () => {
    expect(() => parseFollowup(followupTemplate("AGX-200", QUESTIONS), QUESTIONS)).toThrow("q1: answer is empty");
  });
});
