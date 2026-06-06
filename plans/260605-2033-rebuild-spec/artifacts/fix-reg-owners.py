#!/usr/bin/env python3
"""Wave 8.2 fix script — repair REG owner F### code mismatches in screen-list.md."""
import re
from pathlib import Path

PATH = Path("plans/260605-2033-rebuild-spec/artifacts/screen-list.md")

# Specific REG owner corrections (line-anchored)
# These come from W7a finding: 16 REG owner F### mismatches
REG_OWNER_FIXES = {
    "F006_ProfileManagement": "F004_ProfileManagement",  # REG001/REG002 in SCR013 (ProfilePage)
    "F001_QuizAuthoring": "F006_QuizAuthoring",  # QuizSetGrid in ManageExamPage
    "F002_FlashcardAuthoring": "F007_FlashcardAuthoring",  # FlashCardSetGrid
    "F003_ExamHosting": "F008_ExamHosting",  # ExamRoomGrid + history + session panels
    "F007_AITeacherKnowledgeBase": "F009_AITeacherKnowledgeBase",  # Knowledge folder/file/dataset panels
}


def fix_reg_owners():
    content = PATH.read_text()
    original = content

    fixes = []
    for wrong, correct in REG_OWNER_FIXES.items():
        pattern = re.compile(rf"(REG\d{{3}}\s+\|\s+[\w\s]+?\s+\|\s+){re.escape(wrong)}\b")
        new_content, count = pattern.subn(rf"\g<1>{correct}", content)
        if count > 0:
            fixes.append(f"{wrong} -> {correct} ({count} occurrences)")
            content = new_content

    if content != original:
        PATH.write_text(content)
    return fixes


if __name__ == "__main__":
    fixes = fix_reg_owners()
    if fixes:
        for f in fixes:
            print(f"  {f}")
        print(f"\nTotal REG owner fixes: {len(fixes)}")
    else:
        print("No REG owner fixes needed")
