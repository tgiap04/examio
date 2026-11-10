/** The stats endpoint requires `exam:take`; without it the call would only 403. */
export function canLoadExamStats(hasAccess: boolean, canTakeExam: boolean): boolean {
  return hasAccess && canTakeExam;
}
