# Phase 07: Validation, Cleanup, And Docs Sync

## Context Links
- `examio-fe/package.json`
- `examio-fe/src/app/globals.css`
- `examio-fe/tailwind.config.ts`
- `docs/`

## Overview
- Priority: Critical
- Status: Completed
- Validate the full refactor, remove obvious style leftovers, and update docs if implementation changes design conventions.

## Key Insights
- Frontend has `yarn lint` and `yarn build`; no test script exists in `package.json`.
- Current migration should be proven through compile/lint plus manual visual smoke checks.

## Requirements
- Run validation from `examio-fe`, not repo root.
- Fix syntax/build errors introduced by visual refactor.
- Do not ignore failing lint/build output.
- Document changed design conventions if implementation materially updates code standards or project docs.

## Architecture
- Validation is command-based plus manual route smoke checklist.
- Cleanup should remain focused on migrated design system files.

## Related Code Files
- Read/modify as needed: files changed in prior phases
- Possibly update: `docs/code-standards.md`, `docs/project-changelog.md`, or design docs if user wants docs sync

## Implementation Steps
1. Run `cd examio-fe && yarn lint`.
2. Run `cd examio-fe && yarn build`.
3. Fix introduced errors without broad unrelated rewrites.
4. Grep for remaining high-risk conflicting classes in migrated files: `red-*`, `yellow-*`, `purple-*`, `violet-*`, `bg-white`, heavy shadows.
5. Manually inspect responsive pages: landing, login, register, forgot/reset, `/k`, dashboards, key modals.
6. Update docs only if conventions changed beyond the existing `DESIGN.md` and `ui-design.html` references.

## Todo List
- [x] Run lint.
- [x] Run build.
- [x] Fix validation issues.
- [x] Sweep migrated files for conflicting legacy styles.
- [x] Manual responsive smoke check.
- [x] Update docs if warranted.

## Validation Note
- `cd examio-fe && yarn lint && yarn build` passed.
- Lint reported 63 warnings and 0 errors; warnings are existing style warnings.
- Build passed with large chunk warnings only.
- Reviewer fixes applied: restored `--animate-grid`, removed hard-forced input height/padding, and replaced user-visible KMA branding in migrated auth/logo/feedback/footer with Examio/brand mark.

## Success Criteria
- `yarn lint` passes or only pre-existing accepted warnings remain clearly documented.
- `yarn build` passes.
- Public, auth, and dashboard shell screens are visually coherent with design references.
- No confidential files are touched or committed.

## Risk Assessment
- Existing lint warnings may predate the refactor; separate new issues from old ones.
- Visual QA may require browser screenshots if pixel-level acceptance is needed.

## Security Considerations
- Verify no `.env` values, tokens, or auth internals are exposed through visual changes.

## Next Steps
- Ask user whether to proceed with implementation, narrow the first pass, or split landing/auth/dashboard into separate delivery branches.
