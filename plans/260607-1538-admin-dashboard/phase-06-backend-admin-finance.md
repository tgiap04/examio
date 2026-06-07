## Context links

- Parent plan: [plan.md](../plan.md)
- Research: [researcher-01-backend.md](../research/researcher-01-backend.md)
- Locked design: [brainstorm session record](../../reports/brainstorm-260607-1517-admin-dashboard.md) (Q1: Payment.status = 4)
- Wallet: [examio-be/apps/finance-service/src/modules/wallet/wallet.service.ts](../../../../examio-be/apps/finance-service/src/modules/wallet/wallet.service.ts)
- Payment: [examio-be/libs/database/src/schema.prisma](../../../../examio-be/libs/database/src/schema.prisma) (lines 428-446)
- UserSubscription: [examio-be/libs/database/src/schema.prisma](../../../../examio-be/libs/database/src/schema.prisma) (lines 657-671)
- gRPC subscription: [examio-be/apps/finance-service/src/modules/sepay/subscription.grpc.controller.ts](../../../../examio-be/apps/finance-service/src/modules/sepay/subscription.grpc.controller.ts)
- Phase 04: [phase-04-backend-admin-users-and-audit.md](phase-04-backend-admin-users-and-audit.md)
- Phase 05: [phase-05-backend-admin-stats.md](phase-05-backend-admin-stats.md)

## Overview

- **Date:** 2026-06-07
- **Track:** Backend (B)
- **Priority:** P0 (highest financial risk — most audited actions)
- **Implementation status:** done
- **Review status:** done

3 thao tác tài chính cao rủi ro: refund, cộng/trừ credits (wallet adjustment), đổi tier subscription. Mỗi action ghi `AdminAudit` BẮT BUỘC với payload đầy đủ. Atomicity qua `prisma.$transaction` + isolation `Serializable` chống race condition. Refund extend `Payment.status` enum thêm `4 = refunded`.

## Key Insights

- Researcher flag: `WalletService` hiện có read-then-write race (read balance → check → write) — admin adjustment PHẢI wrap trong `prisma.$transaction` với isolation cao.
- `Payment.status` hiện tại: `0=unpaid, 1=paid, 2=overdue, 3=cancelled`. Cần thêm `4=refunded` (recommendation Q1 — extend enum).
- `WalletTransaction` đã có `type` (0=buy credits, 1=buy subscription, 2=refund, 3=admin adjustment, 4=use services) và `direction` (ADD/SUBTRACT). Admin adjustment = `type=3, direction=ADD/SUBTRACT`.
- Tier change qua gRPC: extend `subscription.proto` với `ChangeSubscriptionTier(userId, tier, billingCycle)` RPC. hoặc gọi HTTP qua gateway proxy (recommendation Q11: HTTP qua gateway).
- `UserSubscription` đã có fields `tier, billingCycle, isActive, lastPaymentDate, nextPaymentDate`.
- Cache invalidation: mỗi mutation phải `statsService.invalidateOverview()` + `invalidateSeries()`.

## Requirements

**Functional**

`POST /admin/finance/refund`:
- Body: `{ paymentId: string, reason: string }` (reason required, min 10 chars)
- Load payment, check `status === 1` (paid), else 409
- Wrap trong `prisma.$transaction` với isolation `Serializable`:
  - Update `Payment.status = 4 (refunded)`, `updatedAt = now()`
  - Tạo reversal `WalletTransaction` với `type = 2 (refund)`, `direction = SUBTRACT`, `amount = payment.amount`, `description = "Admin refund: {reason}"`
  - Update `Wallet.balance -= payment.amount` (chỉ nếu payment là credits; nếu là subscription thì KHÔNG touch wallet)
- Ghi audit `admin.finance.refund` với payload `{ paymentId, userId, amount, previousStatus, newStatus, reason }`
- Cache invalidation
- Concurrent refund attempts: 2 admin gọi cùng lúc → 1 thành công, 1 trả 409 (check status trong tx)

`POST /admin/finance/credit`:
- Body: `{ userId: string, amount: number, direction: "ADD"|"SUBTRACT", reason: string }` (reason required, amount > 0)
- Wrap trong `prisma.$transaction` Serializable:
  - Load user + wallet
  - Nếu SUBTRACT + `wallet.balance < amount` → 400 "Insufficient balance"
  - Update `Wallet.balance += amount` (ADD) hoặc `-= amount` (SUBTRACT)
  - Tạo `WalletTransaction` `type=3 (admin adjustment)`, `direction`, `amount`, `description = "Admin adjustment: {reason}"`
- Ghi audit `admin.finance.credit` với payload `{ userId, previousBalance, newBalance, amount, direction, reason }`
- Cache invalidation

`POST /admin/finance/tier`:
- Body: `{ userId: string, tier: 0|1|2|3, billingCycle?: "monthly"|"yearly", reason: string }` (reason required)
- Wrap trong `prisma.$transaction`:
  - Load `UserSubscription` (or create if missing)
  - Update `tier, billingCycle, isActive = (tier > 0), lastPaymentDate = now(), nextPaymentDate = +1 month/year`
  - Ghi audit `admin.finance.tier_change` với payload `{ userId, previousTier, newTier, previousBillingCycle, newBillingCycle, reason }`
- Cache invalidation
- Gọi `financeService` qua gateway proxy (HTTP) hoặc gRPC nếu extend proto (recommendation Q11: HTTP đơn giản hơn, dùng `HttpService`)

**Non-functional**
- 1 mutation = 1 transaction = atomic
- Reason bắt buộc, min 10 chars, max 500
- Idempotency: client có thể retry; service detect duplicate (vd cùng payment đã refund → 409)
- Stats cache invalidate synchronous (không chờ Redis ack — fire and forget OK)

## Architecture

```
admin-service/src/modules/admin-finance/
  admin-finance.service.ts
  admin-finance.controller.ts
  admin-finance.module.ts
  dto/
    refund.body.ts                ← Zod
    credit.body.ts                ← Zod
    tier.body.ts                  ← Zod
  admin-finance.service.spec.ts
  admin-finance.types.ts
```

Service pattern:
```ts
@Injectable()
export class AdminFinanceService {
  constructor(
    private prisma: PrismaService,
    private auditWriter: AuditWriterService,
    private statsService: AdminStatsService,
    private httpService: HttpService,  // for finance-service tier RPC via HTTP
  ) {}

  async refund(dto: RefundDto, adminId: string, req: Request) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: dto.paymentId },
        // Serializable: row lock
      });
      if (payment.status !== 1) throw new ConflictException('Payment not in paid status');
      
      await tx.payment.update({
        where: { id: dto.paymentId },
        data: { status: 4 },  // 4 = refunded
      });
      
      if (payment.paymentType === 'credits') {
        await tx.wallet.update({
          where: { userId: payment.userId },
          data: { balance: { decrement: payment.amount } },
        });
        await tx.walletTransaction.create({
          data: {
            id: this.generateId.generate(),
            walletId: ...,
            amount: payment.amount,
            type: 2,  // refund
            direction: 'SUBTRACT',
            description: `Admin refund: ${dto.reason}`,
          },
        });
      }
      
      await this.auditWriter.write({
        adminId,
        action: 'admin.finance.refund',
        targetId: payment.userId,
        payload: { paymentId, userId, amount, previousStatus: 1, newStatus: 4, reason },
        reason: dto.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }, { isolationLevel: 'Serializable' });
    
    await this.statsService.invalidateOverview();
    await this.statsService.invalidateSeries();
  }
}
```

## Related code files

**New:**
- `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.service.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.controller.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.module.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/dto/refund.body.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/dto/credit.body.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/dto/tier.body.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.service.spec.ts`
- `examio-be/apps/admin-service/src/modules/admin-finance/admin-finance.types.ts`

**Modify:**
- `examio-be/libs/database/src/schema.prisma` — `Payment.status` thêm comment `// 4 = refunded` (giữ int thay vì convert enum, để tránh migration phá)
- `examio-be/apps/finance-service/src/modules/wallet/wallet.service.ts` — wrap balance updates trong `$transaction` (nếu chưa có) — **CẢNH BÁO**: chỉnh sửa finance-service có thể ảnh hưởng logic khác. Phase này chỉ **đảm bảo admin path dùng tx riêng**, không refactor toàn bộ
- `examio-be/apps/finance-service/src/modules/sepay/subscription.grpc.controller.ts` — thêm RPC `ChangeSubscriptionTier(userId, tier, billingCycle, reason)` nếu chọn gRPC; nếu HTTP, dùng `HttpService` từ admin-service
- `examio-be/apps/admin-service/src/admin-service.module.ts` — import `AdminFinanceModule`
- `examio-be/libs/common/src/protos/subscription.proto` (nếu gRPC path) — thêm `ChangeSubscriptionTier` RPC
- Migration: `add_payment_refunded_status` (comment-only, không đổi column type)

## Implementation Steps

1. **Schema** — update `Payment.status` comment với `// 4 = refunded`. (Không convert sang enum, giữ int — backward compatible.)
2. **DTO Zod** — 3 file body schemas. Validate: reason min 10 max 500, amount > 0, tier enum, billingCycle enum.
3. **admin-finance.service.refund()**:
   - `prisma.$transaction(fn, { isolationLevel: 'Serializable' })`
   - Inside tx: load payment, validate status === 1, update to 4, tạo reversal WalletTransaction nếu credits
   - `auditWriter.write(...)` inside tx (atomic với mutation)
   - Outside tx: `statsService.invalidateOverview()` + `invalidateSeries()`
4. **admin-finance.service.credit()** — tương tự, check balance >= amount cho SUBTRACT.
5. **admin-finance.service.setTier()**:
   - `prisma.$transaction` cho `UserSubscription` upsert + audit
   - Gọi HTTP `POST ${FINANCE_SERVICE_URL}/api/v1/subscription/admin-set-tier` với service-to-service auth (env `ADMIN_SERVICE_TOKEN`)
   - Cache invalidation
6. **admin-finance.controller** — 3 endpoints, `@UseGuards(AdminGuard)` + `@Throttle({ admin: { ttl: 60000, limit: 10 } })` (limit chặt hơn vì tài chính). Zod validation pipe.
7. **finance-service gRPC** — nếu chọn gRPC: thêm RPC `ChangeSubscriptionTier` vào `subscription.proto` + `subscription.grpc.controller.ts`. **Recommendation Q11**: HTTP đơn giản hơn, dùng `HttpService` qua gateway hoặc direct `FINANCE_SERVICE_URL`. Để giai đoạn sau có thể refactor sang gRPC.
8. **Wallet service safety** — kiểm tra `wallet.service.ts` có wrap balance update trong tx không. Nếu không, **không refactor toàn bộ** (rủi ro), chỉ đảm bảo admin path đi qua `$transaction` riêng. Thêm comment "TODO: refactor finance-service wallet to use transactions consistently" cho phase sau.
9. **Unit tests** — mock Prisma `$transaction`, mock auditWriter, mock statsService. Test cases:
   - refund happy path: paid → 4, wallet -= amount, audit row
   - refund idempotency: gọi 2 lần → 1 success + 1 409
   - refund không phải paid status → 409
   - refund subscription payment → không touch wallet
   - credit ADD → balance += amount, audit row
   - credit SUBTRACT + insufficient balance → 400
   - tier change → upsert UserSubscription, audit row
   - reason < 10 chars → 400
10. **E2E test** (sau phase 10): admin login → create test payment → refund → verify wallet delta + audit row visible trong `/admin/audit`.

## Todo list

- [ ] Update `Payment.status` comment với `4 = refunded`
- [ ] Tạo 3 DTO Zod files (refund, credit, tier)
- [ ] Tạo `admin-finance.types.ts` (constants: REFUNDED_STATUS = 4, etc.)
- [ ] Implement `refund()` với `prisma.$transaction` Serializable + audit
- [ ] Implement `credit()` với balance check + audit
- [ ] Implement `setTier()` với upsert + HTTP/gRPC call + audit
- [ ] Tạo `admin-finance.controller.ts` với 3 endpoints
- [ ] Tạo `admin-finance.module.ts`
- [ ] Add finance-service HTTP endpoint `POST /subscription/admin-set-tier` (nếu chọn HTTP path)
- [ ] HOẶC extend gRPC proto với `ChangeSubscriptionTier` (nếu chọn gRPC)
- [ ] Wire vào `admin-service.module.ts`
- [ ] Add `ADMIN_SERVICE_TOKEN` env (cho service-to-service auth)
- [ ] Unit tests: refund happy + idempotency, credit ADD/SUBTRACT, tier change, validation
- [ ] Concurrency test: 2 concurrent refund → 1 success + 1 409
- [ ] `yarn build` pass
- [ ] `yarn dev:admin` boot OK
- [ ] Manual: refund 1 paid payment → 200 + audit row + wallet delta
- [ ] Manual: credit 100k ADD to user → wallet +100k + audit
- [ ] Manual: tier 0 → 2 → UserSubscription updated + audit

## Success Criteria

- [ ] `POST /admin/finance/refund` với paid paymentId + reason ≥ 10 chars → 200, `Payment.status = 4`, audit row, cache invalidated
- [ ] `POST /admin/finance/refund` với already-refunded paymentId → 409 "Payment already refunded"
- [ ] `POST /admin/finance/refund` với reason < 10 chars → 400 "Reason too short"
- [ ] `POST /admin/finance/credit` ADD 100 → wallet +100, audit row
- [ ] `POST /admin/finance/credit` SUBTRACT 200 với balance 100 → 400 "Insufficient balance"
- [ ] `POST /admin/finance/tier` set tier 2 → UserSubscription updated, audit row
- [ ] 2 concurrent refund requests cho cùng paymentId → 1 success + 1 409
- [ ] Stats endpoint trả KPI mới sau khi mutation (cache invalidated)
- [ ] Mọi mutation có 1 AdminAudit row với payload đầy đủ
- [ ] Throttler 10 req/min (chặt hơn stats/users vì rủi ro tài chính)
- [ ] Non-admin JWT → 403
- [ ] Service-to-service auth token enforced (HTTP path)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Race condition concurrent refund | Isolation `Serializable` + re-check status trong tx |
| `prisma.$transaction` deadlock với finance-service | Admin path dùng tx riêng, không gọi finance-service giữa tx (chỉ enqueue event hoặc call HTTP ngoài tx) |
| Refund subscription payment mà không trừ credits → admin confuse | Document rõ: subscription payment KHÔNG touch wallet. Hiện tier downgrade là manual decision |
| Wallet service hiện tại không transactional | Phase này admin path wrap tx riêng. Refactor toàn bộ → phase sau với audit riêng |
| `ADMIN_SERVICE_TOKEN` leak | Dùng env, không commit; rotate policy định kỳ |
| Stats cache stale | Synchronous invalidate sau mỗi mutation (chấp nhận cost nhỏ) |
| `Payment.status` int thay vì enum | Giữ int, document rõ mapping; v2 convert sang enum |
| `UserSubscription.upsert` race | Tx Serializable vẫn OK; concurrent setTier cho cùng user sẽ serialize |

## Security Considerations

- **Critical:** reason bắt buộc min 10 chars — audit trail phải có ngữ cảnh.
- **Critical:** throttler 10 req/min (so với 30 cho stats/users) — chống admin runaway script.
- **Critical:** self-tier-change = 0 → 0 không ghi audit (no-op); nhưng force logout admin để clear JWT? Optional.
- Service-to-service token env (`ADMIN_SERVICE_TOKEN`) random 32+ chars, không default value, fail-fast nếu thiếu.
- Audit payload KHÔNG chứa user email/name — chỉ ID. Frontend join display.
- IP + UA capture cho mọi audit row.

## Next steps

- Phase 07 (admin-logs-and-gateway) — không phụ thuộc phase này, có thể chạy song song.
- Phase 09 (frontend AdminFinance) — consume 3 endpoints này.
- Phase 10 (integration) — e2e test full flow.

## Implementation Notes

- 3 endpoints: POST /admin/finance/refund, /admin/finance/credit, /admin/finance/tier
- All mutations wrapped in `prisma.$transaction` with `Serializable` isolation
- Refund: status check (only paid=1 can be refunded) → set status=4 → create reversal WalletTransaction → update wallet balance (credits only, not subscription)
- Credit: balance check for SUBTRACT → insufficient balance → 400
- Tier change: upsert UserSubscription, call finance-service via HTTP proxy
- AuditWriter.write() called inside transaction for atomic audit trail
- Cache invalidation (`invalidateOverview` + `invalidateSeries`) called after mutation
- Reason required (min 10, max 500 chars) enforced via Zod validation
- Idempotency: double-refund returns 409
- Throttler stricter at 10 req/min (financial actions)
