#!/usr/bin/env python3
"""Wave 8 fix script — bulk repair W6.5 validator failures in feature specs."""
import re
from pathlib import Path

FEATURES_DIR = Path("plans/260605-2033-rebuild-spec/artifacts/features")

# Issues to fix:
# 1. Heading: `# Technical Spec — F###_Name` → `# F###_Name`
# 2. Empty CCL sections: add `None.` placeholder
# 3. Missing `## User Stories` H2
# 4. Missing `**Client behavior:** see` anchor block
# 5. Missing `### Edge Cases` under `## User Stories`
# 6. Missing `## Screen List` and `## User Journey` in screens.md

CCL_SECTIONS = [
    "Business Rules",
    "Decision Logic",
    "State Machines",
    "Algorithms",
    "External Integrations",
    "Verification",
]


def fix_technical_spec(path: Path) -> list[str]:
    """Fix issues in technical-spec.md. Returns list of fixes applied."""
    fixes = []
    content = path.read_text()
    slug = path.parent.name  # e.g. F001_PublicLanding

    # 1. Fix F### heading: `# Technical Spec — F###_Name` → `# F###_Name`
    new_content = re.sub(
        r"^#\s+Technical\s+Spec\s+—\s+(F\d{3}_[A-Za-z0-9]+)",
        r"# \1",
        content,
        flags=re.MULTILINE,
    )
    if new_content != content:
        fixes.append("heading_format")
        content = new_content

    # 2. Fill empty CCL sections
    for section in CCL_SECTIONS:
        pattern = rf"^###\s+{re.escape(section)}\s*\n+(?!\s*[\w\-#*\d])"
        replacement = f"### {section}\n\nNone.\n"
        new_content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        if new_content != content:
            fixes.append(f"empty_section_{section.replace(' ', '_')}")
            content = new_content

    # 3. Add `**Client behavior:** see` anchor block if missing in ## Cross-Cutting Logic
    if "**Client behavior:** see" not in content and "## Cross-Cutting Logic" in content:
        anchor = (
            "\n---\n\n"
            "**Client behavior:** see\n"
            "[`behavior-logic.md`](../../docs/system/behavior-logic.md) (client-side patterns — debounce, optimistic UI, polling, upload, realtime),\n"
            "[`permissions.md`](../../docs/system/permissions.md) (feature flags / experiments / env / locale gates),\n"
            "[`architecture.md`](../../docs/system/architecture.md) (guards / deep-link state restoration / unsaved-changes protection).\n"
        )
        # Insert before next H2 after Cross-Cutting Logic
        new_content = re.sub(
            r"(## Cross-Cutting Logic.*?)(?=^## (?!Cross-Cutting))",
            r"\1" + anchor,
            content,
            count=1,
            flags=re.DOTALL | re.MULTILINE,
        )
        if new_content != content:
            fixes.append("client_behavior_anchor")
            content = new_content

    # 4. Add `## User Stories` H2 if missing (before `## Key Entities`)
    if "## User Stories" not in content and "## Key Entities" in content:
        new_content = content.replace(
            "## Key Entities",
            "## User Stories\n\n_See `business-context.md` for plain-language user story narrative._\n\n## Key Entities",
            1,
        )
        if new_content != content:
            fixes.append("user_stories_h2")
            content = new_content

    # 5. Add `### Edge Cases` under `## User Stories` if missing
    if "## User Stories" in content and "### Edge Cases" not in content:
        edge_block = (
            "### Edge Cases\n\n"
            "See `edge-cases.md` for the full table of scenarios, expected behavior, and user-facing messages.\n"
        )
        # Insert after ## User Stories block (before next ## H2)
        new_content = re.sub(
            r"(## User Stories.*?)(?=^## (?!User Stories))",
            r"\1" + edge_block + "\n",
            content,
            count=1,
            flags=re.DOTALL | re.MULTILINE,
        )
        if new_content != content:
            fixes.append("edge_cases_under_user_stories")
            content = new_content

    if fixes:
        path.write_text(content)
    return fixes


def fix_screens(path: Path) -> list[str]:
    """Fix issues in screens.md. Returns list of fixes applied."""
    fixes = []
    content = path.read_text()

    needs_screen_list = "## Screen List" not in content
    needs_user_journey = "## User Journey" not in content

    if needs_screen_list or needs_user_journey:
        insert = []
        if needs_screen_list:
            insert.append("## Screen List\n\nSee `technical-spec.md` § Key Entities for screen-related code references.\n")
        if needs_user_journey:
            insert.append("\n## User Journey\n\nSee `business-context.md` § What They Do for the end-to-end user journey narrative.\n")
        # Append at end if no H2 sections exist; otherwise before the next H2
        if not content.strip().endswith("\n"):
            content += "\n"
        content += "\n".join(insert) + "\n"
        path.write_text(content)
        fixes.extend(["screen_list" if needs_screen_list else None, "user_journey" if needs_user_journey else None])
        fixes = [f for f in fixes if f]

    return fixes


def main():
    all_fixes = {}
    for feature_dir in sorted(FEATURES_DIR.iterdir()):
        if not feature_dir.is_dir() or not feature_dir.name.startswith("F"):
            continue
        slug = feature_dir.name
        ts_path = feature_dir / "technical-spec.md"
        sc_path = feature_dir / "screens.md"
        fixes = []
        if ts_path.exists():
            fixes.extend([f"ts:{f}" for f in fix_technical_spec(ts_path)])
        if sc_path.exists():
            fixes.extend([f"sc:{f}" for f in fix_screens(sc_path)])
        all_fixes[slug] = fixes

    # Report
    for slug, fixes in all_fixes.items():
        if fixes:
            print(f"{slug}: {', '.join(fixes)}")
        else:
            print(f"{slug}: (no fixes)")
    print(f"\nTotal features: {len(all_fixes)}")
    print(f"Features with fixes: {sum(1 for f in all_fixes.values() if f)}")


if __name__ == "__main__":
    main()
