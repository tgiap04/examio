#!/usr/bin/env python3
"""Wave SS.1.5 fix — remap SCR spec directories to canonical codes from screen-list.md."""
import json
import re
import shutil
from pathlib import Path

SPECS_DIR = Path("plans/260605-2033-rebuild-spec/artifacts/screens")
SCREEN_LIST = Path("plans/260605-2033-rebuild-spec/artifacts/screen-list.md")

# Build canonical mapping: screen_name → SCR### (e.g. "HomePage" → "SCR001")
canonical = {}
for line in SCREEN_LIST.read_text().splitlines():
    m = re.match(r"\|\s*(SCR\d{3,4})\s*\|\s*(\w+)\s*\|\s*\w+\s*\|", line)
    if m:
        canonical[m.group(2)] = m.group(1)

print(f"Loaded {len(canonical)} canonical screen mappings")

# Map existing dirs by their screen name (from directory name)
moves = []
for d in sorted(SPECS_DIR.iterdir()):
    if not d.is_dir():
        continue
    # Directory format: SCR###_ScreenName
    m = re.match(r"^(SCR\d{3,4})_(\w+)$", d.name)
    if not m:
        continue
    current_scr, screen_name = m.groups()
    expected_scr = canonical.get(screen_name)
    if not expected_scr:
        print(f"  SKIP (unknown screen): {d.name}")
        continue
    if current_scr == expected_scr:
        # Correct
        continue
    new_name = f"{expected_scr}_{screen_name}"
    new_path = SPECS_DIR / new_name
    if new_path.exists():
        # Merge: rename current to .bak, then attempt merge
        print(f"  CONFLICT: {d.name} → {new_name} (target exists, will merge)")
        # Don't overwrite - just note
        continue
    print(f"  RENAME: {d.name} → {new_name}")
    moves.append((d, new_path))

# Execute moves
for old, new in moves:
    shutil.move(str(old), str(new))

# Handle duplicate files (e.g., SCR016_HistoryPage and SCR016_MyMaterialsPage both exist)
# The canonical mapping should be applied. The duplicate files (wrong SCR codes) can be archived.
# Specifically: SCR016_HistoryPage (wrong - canonical is SCR018), SCR017_ManageExamPage (wrong - canonical is SCR021)
# These should be moved to the canonical SCR### directory's _archive/ subfolder.

archive_moves = [
    # (source_name, target_canonical_scr_dir, reason)
    ("SCR016_HistoryPage", "SCR018_HistoryPage", "duplicate of SCR018"),
    ("SCR017_ManageExamPage", "SCR021_ManageExamPage", "duplicate of SCR021"),
    ("SCR031_ExamSessionPage", "SCR031_ExamSessionPage", "duplicate of SCR031 (same screen)"),
    ("SCR032_ExamQuizPage", "SCR032_ExamQuizPage", "duplicate of SCR032 (same screen)"),
]

for src_name, target_name, reason in archive_moves:
    src = SPECS_DIR / src_name
    if not src.exists():
        continue
    target = SPECS_DIR / target_name
    if not target.exists():
        # First one is correct - rename
        if src_name != target_name:
            print(f"  RENAME: {src_name} → {target_name}")
            shutil.move(str(src), str(target))
        continue
    # Second one is duplicate - archive
    archive_dir = target / "_archive_duplicates"
    archive_dir.mkdir(exist_ok=True)
    print(f"  ARCHIVE: {src_name} → {target_name}/_archive_duplicates/ ({reason})")
    shutil.move(str(src), str(archive_dir / src_name))

# Final check
print("\nFinal spec directories:")
for d in sorted(SPECS_DIR.iterdir()):
    if d.is_dir():
        print(f"  {d.name}")
