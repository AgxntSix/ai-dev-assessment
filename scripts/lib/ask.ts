export function ask(question: string): string {
  const answer = prompt(question);
  if (answer === null) throw new Error("input closed before an answer was given");
  return answer.trim();
}

export function askRequired(question: string, maxLength = 2000): string {
  for (;;) {
    const answer = ask(question);
    if (answer !== "" && answer.length <= maxLength) return answer;
    console.log(answer === "" ? "  An answer is required." : `  Keep it under ${maxLength} characters.`);
  }
}

export function askChoice<T extends string>(question: string, choices: readonly T[]): T {
  for (;;) {
    const answer = ask(`${question} [${choices.join("/")}]`).toLowerCase();
    const match = choices.find((c) => c === answer);
    if (match) return match;
    console.log(`  Please type one of: ${choices.join(", ")}`);
  }
}

export function confirm(question: string): boolean {
  return /^(y|yes)$/i.test(ask(`${question} [y/N]`));
}
