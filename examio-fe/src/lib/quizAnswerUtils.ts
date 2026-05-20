const ANSWER_LETTERS = ["A", "B", "C", "D"] as const;

/**
 * Resolve answer to option index (0-based).
 * Handles: "A"/"B"/"C"/"D", numeric index, or text content matching an option.
 */
export function resolveAnswerIndex(answer: string | number, options: string[]): number {
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
    const cleanOpt = options[i].replace(/^[A-D]\s*[.):\s]+/, "").trim();
    if (cleanOpt.toLowerCase() === lowerAnswer || options[i].trim().toLowerCase() === lowerAnswer) {
      return i;
    }
  }

  for (let i = 0; i < options.length; i++) {
    const cleanOpt = options[i].replace(/^[A-D]\s*[.):\s]+/, "").trim();
    if (cleanOpt.toLowerCase().includes(lowerAnswer) || lowerAnswer.includes(cleanOpt.toLowerCase())) {
      return i;
    }
  }

  return 0;
}

/**
 * Check if user's selected option letter matches the correct answer.
 */
export function isCorrectAnswer(answer: string | number, optionIndex: number, options: string[]): boolean {
  return resolveAnswerIndex(answer, options) === optionIndex;
}
