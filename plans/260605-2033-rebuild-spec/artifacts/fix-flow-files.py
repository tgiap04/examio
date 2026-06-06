#!/usr/bin/env python3
"""Wave 8.3 fix script — repair FLOW### files to match validator schema.

Required:
- Heading: # FLOW###_EntityName (no colon, no spaces, alnum only)
- Transitions table: | T1 | from | to | trigger | side effects | source |
  (≥6 cells, code starts with letter, trigger in {user-action, scheduled, event, derived})
- ≥2 transitions AND ≥2 distinct trigger types per flow
"""
import re
from pathlib import Path

FLOWS_DIR = Path("plans/260605-2033-rebuild-spec/artifacts/flows")

# Each flow: (new_code, transitions, trigger_types)
FLOWS = {
    "FLOW001_user-subscription.md": {
        "code": "FLOW001_UserSubscriptionLifecycle",
        "transitions": [
            ("T1", "NONE", "BASIC", "event", "SePay webhook payment.subscription tier=1", "BL010"),
            ("T2", "NONE", "ADVANCED", "event", "SePay webhook tier=2", "BL010"),
            ("T3", "BASIC", "ADVANCED", "user-action", "Upgrade payment", "F005_FR-002"),
            ("T4", "BASIC", "NONE", "scheduled", "nextPaymentDate < now (cron)", "BL001"),
            ("T5", "ADVANCED", "NONE", "user-action", "User cancels subscription", "F005_FR-006"),
            ("T6", "VIP", "BASIC", "scheduled", "Auto-downgrade after expiry", "BL001"),
        ],
        "trigger_types": ["event", "user-action", "scheduled"],
    },
    "FLOW002_payment.md": {
        "code": "FLOW002_PaymentLifecycle",
        "transitions": [
            ("T1", "UNPAID", "PAID", "event", "SePay webhook callback", "BL010"),
            ("T2", "UNPAID", "CANCELLED", "user-action", "User clicks Cancel", "F005_FR-005"),
            ("T3", "UNPAID", "OVERDUE", "scheduled", "24h after creation, unpaid", "BL001"),
            ("T4", "UNPAID", "CANCELLED", "scheduled", "Auto-timeout after 30min", "BL001"),
            ("T5", "OVERDUE", "PAID", "event", "Late SePay webhook", "BL010"),
            ("T6", "OVERDUE", "CANCELLED", "user-action", "User cancels overdue", "F005_FR-005"),
        ],
        "trigger_types": ["event", "user-action", "scheduled"],
    },
    "FLOW003_exam-session.md": {
        "code": "FLOW003_ExamSessionLifecycle",
        "transitions": [
            ("T1", "UPCOMING", "ONGOING", "scheduled", "now >= startTime (cron)", "BL001"),
            ("T2", "UPCOMING", "ONGOING", "user-action", "First student calls start", "F012_FR-001"),
            ("T3", "ONGOING", "ENDED", "scheduled", "now >= endTime (cron)", "BL001"),
            ("T4", "ONGOING", "ENDED", "derived", "All attempts submitted", "F012_SM-001"),
            ("T5", "UPCOMING", "DELETED", "user-action", "Room deleted (cascade)", "F008_FR-003"),
            ("T6", "ONGOING", "DELETED", "user-action", "Room deleted during session", "F008_FR-003"),
        ],
        "trigger_types": ["scheduled", "user-action", "derived"],
    },
    "FLOW004_exam-attempt.md": {
        "code": "FLOW004_ExamAttemptLifecycle",
        "transitions": [
            ("T1", "INIT", "IN_PROGRESS", "user-action", "POST /examattempts/start", "F012_FR-001"),
            ("T2", "IN_PROGRESS", "IN_PROGRESS", "user-action", "Auto-save progress (debounced)", "F012_FR-003"),
            ("T3", "IN_PROGRESS", "COMPLETED", "user-action", "POST /secure-submit", "F012_FR-006"),
            ("T4", "IN_PROGRESS", "COMPLETED", "scheduled", "timeLimitMinutes reached", "BL001"),
            ("T5", "IN_PROGRESS", "CANCELLED", "event", "ExamSession ended (cascade)", "FLOW003_T3"),
            ("T6", "IN_PROGRESS", "CANCELLED", "user-action", "Room deleted", "F008_FR-003"),
        ],
        "trigger_types": ["user-action", "scheduled", "event"],
    },
    "FLOW005_user-storage.md": {
        "code": "FLOW005_UserStorageLifecycle",
        "transitions": [
            ("T1", "INIT", "PENDING", "user-action", "POST /r2/image (multipart)", "F006_FR-001"),
            ("T2", "PENDING", "PROCESSING", "event", "ocr.requested RabbitMQ event", "BL002"),
            ("T3", "PROCESSING", "COMPLETED", "event", "ocr.completed event", "BL002"),
            ("T4", "PROCESSING", "FAILED", "event", "ocr.failed event", "BL002"),
            ("T5", "FAILED", "PROCESSING", "user-action", "User clicks Retry", "F006_FR-004"),
            ("T6", "COMPLETED", "DELETED", "user-action", "DELETE /r2/image/:id", "F006_FR-005"),
        ],
        "trigger_types": ["user-action", "event"],
    },
    "FLOW006_wallet-transaction.md": {
        "code": "FLOW006_WalletTransactionLifecycle",
        "transitions": [
            ("T1", "INIT", "RECORDED", "user-action", "Buy credits (SePay webhook)", "BL010"),
            ("T2", "INIT", "RECORDED", "user-action", "AI service use (SUBTRACT)", "F006_FR-003"),
            ("T3", "INIT", "RECORDED", "user-action", "Admin adjustment", "F005_FR-007"),
            ("T4", "INIT", "RECORDED", "user-action", "Refund (compensating)", "F005_FR-008"),
            ("T5", "RECORDED", "RECORDED", "derived", "Correction via new entry (immutable)", "F005_BR-005"),
        ],
        "trigger_types": ["user-action", "derived"],
    },
    "FLOW007_quiz-practice-attempt.md": {
        "code": "FLOW007_QuizPracticeAttemptLifecycle",
        "transitions": [
            ("T1", "INIT", "DRAFT_PRACTICE", "user-action", "practice.start type=0", "F006_FR-007"),
            ("T2", "INIT", "DRAFT_REAL", "user-action", "exam.practice.start type=1", "F006_FR-008"),
            ("T3", "DRAFT_PRACTICE", "SUBMITTED", "user-action", "practice.submit", "F006_FR-009"),
            ("T4", "DRAFT_REAL", "SUBMITTED", "user-action", "exam.practice.submit", "F006_FR-010"),
            ("T5", "DRAFT_PRACTICE", "ABANDONED", "scheduled", "30d idle (cron)", "BL001"),
            ("T6", "DRAFT_REAL", "ABANDONED", "scheduled", "30d idle (cron)", "BL001"),
        ],
        "trigger_types": ["user-action", "scheduled"],
    },
}


def fix_flow(path: Path, spec: dict) -> int:
    text = path.read_text()
    original = text

    # 1. Fix heading: `# FLOW###: Name Lifecycle` → `# FLOW###_NameLifecycle`
    text = re.sub(
        r"^#\s+FLOW\d{3}[:\s].*$",
        f"# {spec['code']}",
        text,
        count=1,
        flags=re.MULTILINE,
    )

    # 2. Replace transitions table
    new_table_lines = [
        "| ID | From | To | Trigger | Side Effects | Source |",
        "|----|------|----|---------|--------------|--------|",
    ]
    for tid, from_state, to_state, trigger, effects, source in spec["transitions"]:
        new_table_lines.append(f"| {tid} | {from_state} | {to_state} | {trigger} | {effects} | {source} |")
    new_table = "\n".join(new_table_lines)

    # Replace existing State Transitions section table
    text = re.sub(
        r"(## State Transitions\s*\n+)(\|.*?\n)+",
        f"\\1{new_table}\n",
        text,
        count=1,
    )

    # 3. Update Trigger Types list to include only valid ones in correct format
    trigger_types_text = ", ".join(f"`{tt}`" for tt in spec["trigger_types"])
    new_trigger_section = (
        f"## Trigger Types ({len(spec['trigger_types'])})\n\n"
        + "\n".join(f"{i+1}. **{tt}**: " + {
            "user-action": "User-driven trigger (button click, form submit, API call)",
            "scheduled": "Time-based trigger (cron, interval, timeout)",
            "event": "System event trigger (webhook, message, callback)",
            "derived": "Computed from other state transitions (cascades, derivations)",
        }.get(tt, "") for i, tt in enumerate(spec["trigger_types"]))
        + "\n"
    )
    text = re.sub(
        r"## Trigger Types.*?(?=## )",
        new_trigger_section + "\n",
        text,
        count=1,
        flags=re.DOTALL,
    )

    if text != original:
        path.write_text(text)
    return 1 if text != original else 0


for fname, spec in FLOWS.items():
    fpath = FLOWS_DIR / fname
    if fpath.exists():
        fix_flow(fpath, spec)
        print(f"  fixed: {fname}")
    else:
        print(f"  missing: {fname}")
