#!/usr/bin/env python3
"""Wave 8.3.2 — reorder transitions table to put trigger in cell index 2.

Required by validator:
  cells[0] = ID
  cells[1] = (any)  
  cells[2] = trigger_type (must be in {user-action, scheduled, event, derived})
  cells[-1] = source

So column order must be: ID | from | trigger | to | effects | source
"""
import re
from pathlib import Path

FLOWS_DIR = Path("plans/260605-2033-rebuild-spec/artifacts/flows")

# Parse each flow's existing transitions and reorder
for fpath in sorted(FLOWS_DIR.glob("FLOW*.md")):
    text = fpath.read_text()
    lines = text.split("\n")
    new_lines = []
    in_table = False
    for line in lines:
        # Match transition rows
        m = re.match(r"^\|\s*(T\d+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*$", line)
        if m and in_table:
            tid, col1, col2, col3, col4, col5 = m.groups()
            # Current order: ID | from | to | trigger | effects | source
            # Required order: ID | from | trigger | to | effects | source
            col1 = col1.strip()
            col2 = col2.strip()
            col3 = col3.strip()
            col4 = col4.strip()
            col5 = col5.strip()
            new_line = f"| {tid} | {col1} | {col3} | {col2} | {col4} | {col5} |"
            new_lines.append(new_line)
        else:
            if line.startswith("| ID | From | To | Trigger"):
                # Replace header
                new_lines.append("| ID | From | Trigger | To | Side Effects | Source |")
                in_table = True
            elif line.startswith("|----"):
                new_lines.append("|----|------|---------|----|--------------|--------|")
                in_table = True
            elif line.startswith("|") and in_table:
                # End of table
                in_table = False
                new_lines.append(line)
            else:
                if line.startswith("|") == False:
                    in_table = False
                new_lines.append(line)

    fpath.write_text("\n".join(new_lines))
    print(f"  reordered: {fpath.name}")
