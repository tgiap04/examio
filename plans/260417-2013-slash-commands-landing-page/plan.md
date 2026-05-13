---
title: "Slash Commands Landing Page"
description: "New landing page listing all slash commands with client-side search"
status: pending
priority: P2
effort: 3h
branch: main
tags: [landing-page, commands, search]
created: 2026-04-17
---

# Slash Commands Landing Page

## Answer: Existing Command Lister

Yes — `fdk commands --list` already lists all slash commands. Implemented by:
- `cli/src/commands/commands/commands-discovery.ts` — recursive `.md` scanner with frontmatter parsing
- `cli/src/commands/commands/commands-command.ts` — CLI output formatter

## Architecture Decision

**Build-time generation, not runtime discovery.**

A Node script reuses the discovery logic (`discoverCommands`) at build time to produce a JSON file consumed by Astro. This avoids manual maintenance and guarantees completeness.

```
┌─────────────────────┐   build-time   ┌──────────────┐   import   ┌─────────────┐
│ .claude/commands/fdk │ ──────────────▸ │ commands.json│ ─────────▸ │ Astro page  │
│ (*.md frontmatter)  │   Node script  │ (generated)  │           │ + search UI │
└─────────────────────┘                └──────────────┘           └─────────────┘
```

## Phase 1 — Build-time Data Generator (~45min)

| ID | Task | Status |
|----|------|--------|
| 1.1 | Create `landing-pages/scripts/generate-commands-data.ts` | Pending |
| 1.2 | Script imports `parseFrontmatterFile` from CLI, scans `.claude/commands/fdk/` | Pending |
| 1.3 | Output: `landing-pages/src/data/commands.json` — array of `{name, displayName, description, category}` | Pending |
| 1.4 | Add `prebuild` npm script: `tsx scripts/generate-commands-data.ts` | Pending |
| 1.5 | Add `commands.json` to `.gitignore` (generated artifact) | Pending |

**Data shape:**
```json
[
  { "name": "ask", "displayName": "fdk:ask", "description": "Answer technical and architectural questions...", "category": "root" },
  { "name": "plan/fast", "displayName": "fdk:plan:fast", "description": "...", "category": "plan" }
]
```

**Failure modes:**
- Missing frontmatter → script logs warning, includes command with empty description
- New commands added but build not run → CI prebuild step catches this; also add validation in Phase 4

**Files touched:** `landing-pages/scripts/generate-commands-data.ts`, `landing-pages/package.json`, `.gitignore`

## Phase 2 — i18n Translations (~30min)

| ID | Task | Status |
|----|------|--------|
| 2.1 | Create `landing-pages/src/i18n/commands-translations.ts` | Pending |
| 2.2 | Add translations for: meta title/desc, hero section, search placeholder, empty-state text, category labels | Pending |
| 2.3 | Support `en`, `vi`, `ja` locales (matching existing pattern) | Pending |

**Note:** Command names and descriptions stay English (same convention as agent names on features page). Only page chrome is translated.

**Files touched:** `landing-pages/src/i18n/commands-translations.ts`

## Phase 3 — Page Route + Components (~1h)

| ID | Task | Status |
|----|------|--------|
| 3.1 | Create `landing-pages/src/pages/commands.astro` — thin route file | Pending |
| 3.2 | Create `landing-pages/src/pages/vi/commands.astro` and `ja/commands.astro` | Pending |
| 3.3 | Create `landing-pages/src/components/landing/CommandsPageContent.astro` — main layout | Pending |
| 3.4 | Create `landing-pages/src/components/landing/CommandSearch.astro` — search + filtered list | Pending |

**Component design:**

`CommandsPageContent.astro`:
- Imports `commands.json`, i18n translations
- Renders hero (reuse `HeroSection.astro`), command grid, CTA
- Passes command data as JSON to client-side `<script>` for search

`CommandSearch.astro`:
- `<input>` for search, renders command cards
- Client-side JS: filters commands array by `name` + `description` substring match (case-insensitive)
- Group commands by category (root, plan, etc.) with collapsible sections
- Empty state when no matches

**Search approach:** Pure client-side JS filtering. ~25 commands total — no need for Fuse.js or server-side search. Simple `includes()` on lowercased name+description.

**Failure modes:**
- Empty commands.json → show "No commands found" message + link to CLI fallback
- JS disabled → all commands visible by default (progressive enhancement: render full list in HTML, JS hides non-matches)

**Files touched:** 3 page files, 2 component files (no overlap with Phase 1/2)

## Phase 4 — Verification + Nav Integration (~45min)

| ID | Task | Status |
|----|------|--------|
| 4.1 | Add "Commands" link to nav in `LandingLayout.astro` | Pending |
| 4.2 | Add build validation: compare `commands.json` count vs `find .claude/commands/fdk -name '*.md' | wc -l` | Pending |
| 4.3 | Manual test: `cd landing-pages && npm run build && npm run preview` | Pending |
| 4.4 | Verify all ~27 commands appear (21 root + 6 plan/*) | Pending |
| 4.5 | Test search filters correctly by name and description | Pending |
| 4.6 | Test vi/ and ja/ locale routes render | Pending |

**Files touched:** `landing-pages/src/layouts/LandingLayout.astro` (nav only)

## Dependency Graph

```
Phase 1 (data gen) ──┐
                     ├──▸ Phase 3 (components) ──▸ Phase 4 (verify + nav)
Phase 2 (i18n) ──────┘
```

Phases 1 and 2 are independent and can run in parallel.

## Risk Assessment

| Risk | L x I | Mitigation |
|------|-------|------------|
| Commands.json stale after adding new commands | M x M | Prebuild script + CI count validation |
| Import path from CLI to landing-pages breaks | L x H | Copy `parseFrontmatterFile` logic into script (simple gray-matter parse, ~15 lines) instead of cross-package import |
| Search feels slow | L x L | Only ~25 items; not a real risk |

## Backwards Compatibility

No breaking changes. New route `/commands` added; no existing routes modified. Nav gets one new link.

## Rollback

Delete the 6 new files + revert `package.json` prebuild script + revert nav link. Zero cascade risk.

## Success Criteria

- [ ] `/commands` page lists exactly the same commands as `fdk commands --list`
- [ ] Search filters by name and description in real-time
- [ ] All 3 locales (en/vi/ja) render without error
- [ ] `astro build` succeeds with no warnings
- [ ] Progressive enhancement: full list visible without JS
