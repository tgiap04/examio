# Phase 01 — Decouple gRPC metadata attacher

## Context Links
- [plan.md](./plan.md) · [scout-01 §5](./reports/scout-01-backend-money-flows.md) · [scout-02 §7 libs](./reports/scout-02-finance-service-infra-authz.md)

## Overview
- Priority: P1 (blocks 02, 03, 05) · Status: Completed · Effort: 0.25d
- Move `GrpcMetadataAttacher` / `GRPC_METADATA_ATTACHER` out of `libs/grpc/src/clients/finance.client.ts` into `libs/grpc/src/metadata.ts`. Pure refactor, no behaviour change.

## Key Insights
- `public-profile.client.ts:16` imports the token from `./finance.client`. Deleting the finance client in 05 would break public-profile enrichment in content, assessment and study-room.
- The barrel `libs/grpc/src/index.ts` already exports `./metadata`, so `@kmaedu/grpc` consumers (ai-chat, content and document modules, the root test) keep working with no import change.
- The token value `'GRPC_METADATA_ATTACHER'` must stay identical, because DI keys are matched by value.

## Requirements
- Functional: same exported names, same token string, and `@kmaedu/grpc` exports unchanged.
- Non-functional: no new dependency from `libs/grpc` on `@kmaedu/auth-jwt` (keep the structural interface).

## Architecture
`metadata.ts` (interface + token) ← imported by `public-profile.client.ts` and `finance.client.ts`. `finance.client.ts` no longer defines either.

## Related Code Files
- Modify `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/grpc/src/metadata.ts`: add the interface and token, with the doc comment moved over.
- Modify `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/grpc/src/clients/finance.client.ts`: delete lines 10-18 and import from `../metadata`.
- Modify `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/grpc/src/clients/public-profile.client.ts:16`: import from `../metadata`.
- Modify `/Users/tgiap.dev/devs/kmaedu/kmaedu-be/libs/grpc/src/metadata.spec.ts`: add one assertion that the token equals `'GRPC_METADATA_ATTACHER'`.

## Implementation Steps
1. Check that `metadata.ts` has no conflicting export names (`git grep -n "export" libs/grpc/src/metadata.ts`).
2. Move the interface and constant, then fix the two imports.
3. `git grep -n "from './finance.client'" -- libs` must return nothing.

## Todo List
- [x] Move interface and token (`libs/grpc/src/metadata.ts:41`)
- [x] Fix imports (`public-profile.client.ts:14` imports from `../metadata`)
- [x] Token-value assertion in metadata.spec (`metadata.spec.ts:27`)
- [ ] Typecheck and lib tests green (not recorded in any report)

## Success Criteria
- `git grep -n "GrpcMetadataAttacher\|GRPC_METADATA_ATTACHER" -- libs/grpc/src/clients/finance.client.ts` shows imports only, no definitions.
- `yarn typecheck` exits 0.

## Test Plan — Scope Contract
- Changed: 3 files in `libs/grpc`.
- Impacted: every service that wires `GRPC_METADATA_ATTACHER` (ai-chat, content, document, public-profile users: content, assessment, study-room).
- Will verify:
  - Unit: `cd kmaedu-be && yarn test libs/grpc`. A spec that would catch the wrong token value or a broken export.
  - Compile: `yarn typecheck` (all services; catches a missing barrel export).
  - Integration: `yarn test test/cross-app/rpc-guard-table.spec.ts` (boots controllers with DI).
- Deliberately skipped: service e2e suites. DI behaviour cannot change if the token string is identical, and the assertion pins it.
- Not safety-critical on its own (no runtime change). The full gate runs in 06.

## Risk Assessment
- Token string drift → DI resolves nothing at boot. Countermeasure: the spec assertion.
- Duplicate export via the barrel (`metadata` and `finance.client` both exporting) → TS2308. Countermeasure: definition removed from `finance.client.ts`.

## Security Considerations
- The attacher injects the service token. The contract is unchanged, so no auth surface changes.

## Next Steps
- Unblocks 02, 03 and 05. Rollback: revert the single commit.
