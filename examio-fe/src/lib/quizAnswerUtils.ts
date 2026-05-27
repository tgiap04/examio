const ANSWER_LETTERS = ["A", "B", "C", "D"] as const;

export type QuizOptionLike = string | { text?: string; content?: string; value?: string };

export function quizOptionToText(option: QuizOptionLike): string {
  const text = typeof option === "string"
    ? option
    : option?.text ?? option?.content ?? option?.value ?? "";

  return text
    .replace(/^<p>([A-D][.)\:\s]+)/i, "<p>")
    .replace(/^([A-D][.)\:\s]+)/i, "");
}

/**
 * Resolve answer to option index (0-based).
 * Handles: "A"/"B"/"C"/"D", numeric index, or text content matching an option.
 */
export function resolveAnswerIndex(answer: string | number, options: QuizOptionLike[]): number {
  if (typeof answer === "number") return answer;

  const trimmed = answer.trim();

  const letterIdx = ANSWER_LETTERS.indexOf(trimmed.toUpperCase() as typeof ANSWER_LETTERS[number]);
  if (letterIdx !== -1 && letterIdx < options.length) return letterIdx;

  if (/^\d+$/.test(trimmed)) {
    const numIdx = parseInt(trimmed, 10);
    if (numIdx >= 0 && numIdx < options.length) return numIdx;
  }

  const lowerAnswer = trimmed.toLowerCase();
  for (let i = 0; i < options.length; i++) {
    const optionText = quizOptionToText(options[i]).trim();
    const cleanOpt = optionText.replace(/^[A-D]\s*[.):\s]+/, "").trim();
    if (cleanOpt.toLowerCase() === lowerAnswer || optionText.toLowerCase() === lowerAnswer) {
      return i;
    }
  }

  for (let i = 0; i < options.length; i++) {
    const cleanOpt = quizOptionToText(options[i]).replace(/^[A-D]\s*[.):\s]+/, "").trim();
    if (cleanOpt.toLowerCase().includes(lowerAnswer) || lowerAnswer.includes(cleanOpt.toLowerCase())) {
      return i;
    }
  }

  return 0;
}

/**
 * Check if user's selected option letter matches the correct answer.
 */
export function isCorrectAnswer(answer: string | number, optionIndex: number, options: QuizOptionLike[]): boolean {
  return resolveAnswerIndex(answer, options) === optionIndex;
}
