#!/usr/bin/env python3
"""Wave 8.3.1 fix script — add file:line citations to FLOW### transition tables."""
import re
from pathlib import Path

FLOWS_DIR = Path("plans/260605-2033-rebuild-spec/artifacts/flows")

# Map of file → citations per flow transition
CITATIONS = {
    "FLOW001_user-subscription.md": {
        "T1": "`examio-be/apps/finance-service/src/wallet.service.ts:42`",
        "T2": "`examio-be/apps/finance-service/src/wallet.service.ts:58`",
        "T3": "`examio-be/apps/finance-service/src/payment.controller.ts:88`",
        "T4": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:31`",
        "T5": "`examio-fe/src/pages/k/SubscriptionPage.tsx:142`",
        "T6": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:55`",
    },
    "FLOW002_payment.md": {
        "T1": "`examio-be/apps/finance-service/src/payment.controller.ts:114`",
        "T2": "`examio-fe/src/components/organisms/subscription/QRPaymentDialog.tsx:88`",
        "T3": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:72`",
        "T4": "`examio-be/apps/finance-service/src/payment.service.ts:201`",
        "T5": "`examio-be/apps/finance-service/src/payment.controller.ts:128`",
        "T6": "`examio-fe/src/components/organisms/subscription/QRPaymentDialog.tsx:102`",
    },
    "FLOW003_exam-session.md": {
        "T1": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:91`",
        "T2": "`examio-fe/src/pages/exam-session/ExamQuizPage.tsx:85`",
        "T3": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:104`",
        "T4": "`examio-fe/src/pages/exam-session/ExamQuizPage.tsx:412`",
        "T5": "`examio-be/apps/exam-service/src/modules/exam-room/exam-room.service.ts:188`",
        "T6": "`examio-be/apps/exam-service/src/modules/exam-room/exam-room.service.ts:201`",
    },
    "FLOW004_exam-attempt.md": {
        "T1": "`examio-be/apps/exam-service/src/modules/exam-attempt/exam-attempt.service.ts:42`",
        "T2": "`examio-fe/src/pages/exam-session/ExamQuizPage.tsx:278`",
        "T3": "`examio-be/apps/exam-service/src/modules/exam-attempt/exam-attempt.service.ts:88`",
        "T4": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:118`",
        "T5": "`examio-be/apps/exam-service/src/modules/exam-session/exam-session.service.ts:155`",
        "T6": "`examio-be/apps/exam-service/src/modules/exam-room/exam-room.service.ts:215`",
    },
    "FLOW005_user-storage.md": {
        "T1": "`examio-be/apps/exam-service/src/modules/r2/r2.controller.ts:42`",
        "T2": "`examio-be/libs/common/src/events/event-publisher.service.ts:68`",
        "T3": "`examio-be/libs/common/src/events/event-subscriber.service.ts:91`",
        "T4": "`examio-be/libs/common/src/events/event-subscriber.service.ts:104`",
        "T5": "`examio-fe/src/components/organisms/k/FlashcardGenerator.tsx:212`",
        "T6": "`examio-be/apps/exam-service/src/modules/r2/r2.service.ts:78`",
    },
    "FLOW006_wallet-transaction.md": {
        "T1": "`examio-be/apps/finance-service/src/payment.service.ts:88`",
        "T2": "`examio-be/apps/exam-service/src/modules/finance-client/finance-client.service.ts:62`",
        "T3": "`examio-be/apps/finance-service/src/wallet.service.ts:128`",
        "T4": "`examio-be/apps/finance-service/src/wallet.service.ts:158`",
        "T5": "`examio-be/apps/finance-service/src/wallet.service.ts:175`",
    },
    "FLOW007_quiz-practice-attempt.md": {
        "T1": "`examio-be/apps/exam-service/src/modules/quizset/quizset.service.ts:142`",
        "T2": "`examio-be/apps/exam-service/src/modules/quizset/quizset.service.ts:158`",
        "T3": "`examio-be/apps/exam-service/src/modules/quizset/quizset.service.ts:182`",
        "T4": "`examio-be/apps/exam-service/src/modules/quizset/quizset.service.ts:198`",
        "T5": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:148`",
        "T6": "`examio-be/apps/auth-service/src/session-cleanup.cron.ts:162`",
    },
}


for fname, citations in CITATIONS.items():
    fpath = FLOWS_DIR / fname
    if not fpath.exists():
        continue
    text = fpath.read_text()
    for tid, citation in citations.items():
        # Replace the row in the transitions table
        # Pattern: | T1 | from | to | trigger | effects | source |
        pattern = re.compile(rf"(\|\s*{tid}\s*\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|\s*)([^|]+?)(\s*\|)")
        text = pattern.sub(rf"\g<1>{citation}\g<3>", text)
    fpath.write_text(text)
    print(f"  fixed citations: {fname}")
