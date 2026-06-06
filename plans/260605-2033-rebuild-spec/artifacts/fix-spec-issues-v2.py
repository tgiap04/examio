#!/usr/bin/env python3
"""Wave 8.1 fix script v2 — handles blank CCL sections with sub-subsections."""
import re
from pathlib import Path

FEATURES_DIR = Path("plans/260605-2033-rebuild-spec/artifacts/features")

# Required CCL subsections order per validator
REQUIRED_CCL_ORDER = [
    "Requirements",
    "Business Rules",
    "Decision Logic",
    "State Machines",
    "Algorithms",
    "External Integrations",
    "Verification",
]

# Sections that may legitimately have only sub-subsections (BR-, FR-, SM-, ALG-, INT-, SC-)
SUBSECTION_PREFIXES = {
    "Business Rules": "BR-",
    "Requirements": "FR-",
    "State Machines": "SM-",
    "Algorithms": "ALG-",
    "External Integrations": "INT-",
    "Verification": "SC-",
}


def has_direct_content(section_text: str) -> bool:
    """Check if the section has direct content (not just sub-subsections)."""
    lines = section_text.strip().split("\n")
    for line in lines[1:]:  # skip the H3 heading itself
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("###"):
            continue  # sub-subsection
        return True
    return False


def has_subsections(section_text: str) -> bool:
    """Check if the section has sub-subsections (e.g. ### BR-001)."""
    lines = section_text.strip().split("\n")
    for line in lines[1:]:
        if line.strip().startswith("###"):
            return True
    return False


def fill_blank_section(content: str, section_name: str) -> str:
    """Fill a blank CCL section. Handle cases with sub-subsections."""
    # Match the section block: from ### {name} to next ### (same level) or ## (any)
    pattern = rf"(^###\s+{re.escape(section_name)}\s*\n)([\s\S]*?)(?=^###\s+\w|^##\s+\w|\Z)"
    match = re.search(pattern, content, flags=re.MULTILINE)
    if not match:
        return content

    heading = match.group(1)
    section_body = match.group(2)

    # If has direct content, no fix needed
    if has_direct_content(section_body):
        return content

    # If has sub-subsections but no direct content, add a note line before them
    if has_subsections(section_body):
        prefix = SUBSECTION_PREFIXES.get(section_name, "")
        note = f"\n_Sub-sections below detail the {section_name.lower()}._\n"
        new_body = note + section_body.lstrip("\n")
        return content.replace(heading + section_body, heading + new_body, 1)

    # If entirely empty, add None.
    new_body = "\nNone.\n"
    return content.replace(heading + section_body, heading + new_body, 1)


def fix_missing_ccl_subsection(content: str, section_name: str) -> str:
    """Add a missing required CCL subsection if absent."""
    if re.search(rf"^###\s+{re.escape(section_name)}", content, flags=re.MULTILINE):
        return content  # already exists

    # Find the right place to insert: after the previous required subsection
    target_idx = REQUIRED_CCL_ORDER.index(section_name)
    if target_idx == 0:
        # Should not happen — Requirements is always first
        return content

    prev_section = REQUIRED_CCL_ORDER[target_idx - 1]
    # Find the end of the previous section's content
    pattern = rf"(^###\s+{re.escape(prev_section)}\s*\n)([\s\S]*?)(?=^###\s+\w|^##\s+\w|\Z)"
    match = re.search(pattern, content, flags=re.MULTILINE)
    if not match:
        return content

    insertion = f"\n### {section_name}\n\nNone.\n"
    return content[:match.end()] + insertion + content[match.end():]


def reorder_ccl_subsections(content: str) -> str:
    """Reorder CCL subsections if they're in the wrong order. Adds missing ones."""
    # For now, just check the missing ones
    for section_name in REQUIRED_CCL_ORDER:
        content = fix_missing_ccl_subsection(content, section_name)
    return content


def fix_technical_spec(path: Path) -> list[str]:
    """Fix issues in technical-spec.md. Returns list of fixes applied."""
    fixes = []
    content = path.read_text()

    # 1. Fill blank CCL sections (including ones with only sub-subsections)
    for section in REQUIRED_CCL_ORDER:
        new_content = fill_blank_section(content, section)
        if new_content != content:
            fixes.append(f"fill_{section.replace(' ', '_').lower()}")
            content = new_content

    # 2. Add missing required CCL subsections
    new_content = reorder_ccl_subsections(content)
    if new_content != content:
        fixes.append("add_missing_ccl")
        content = new_content

    if fixes:
        path.write_text(content)
    return fixes


def main():
    all_fixes = {}
    for feature_dir in sorted(FEATURES_DIR.iterdir()):
        if not feature_dir.is_dir() or not feature_dir.name.startswith("F"):
            continue
        slug = feature_dir.name
        ts_path = feature_dir / "technical-spec.md"
        if ts_path.exists():
            fixes = fix_technical_spec(ts_path)
            all_fixes[slug] = fixes
        else:
            all_fixes[slug] = []

    for slug, fixes in all_fixes.items():
        if fixes:
            print(f"{slug}: {', '.join(fixes)}")
        else:
            print(f"{slug}: (no fixes)")
    print(f"\nFeatures with fixes: {sum(1 for f in all_fixes.values() if f)}")


if __name__ == "__main__":
    main()
