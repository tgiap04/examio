export interface SessionSummary {
  examSessionId: string
  examRoomId: string
  title: string
  description: string | null
  showAnswersAfterSubmit: boolean
  attemptCount: number
  bestScore: number | null
  bestPercentage: number
  lastAttemptAt: string
  hasInProgress: boolean
  inProgressAttemptId: string | null
  totalViolations: number
  isPinned: boolean
}
