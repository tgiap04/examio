import 'reflect-metadata';
import { declarationOf, type Declaration } from '@examio/auth-jwt';
import { collectControllers, routeHandlers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { AuthUsersGrpcController } from '../../apps/auth-service/src/grpc/auth-users.grpc.controller';
import { AuthGrpcController } from '../../apps/auth-service/src/grpc/auth.grpc.controller';
import { WalletGrpcController } from '../../apps/finance-service/src/modules/wallet/wallet.grpc.controller';
import { FinanceAdminGrpcController } from '../../apps/finance-service/src/modules/finance-admin/finance-admin.grpc.controller';
import { SubscriptionGrpcController } from '../../apps/finance-service/src/modules/sepay/subscription.grpc.controller';
import { FinanceStatsGrpcController } from '../../apps/finance-service/src/modules/stats/finance-stats.grpc.controller';
import { DocumentGrpcController } from '../../apps/document-service/src/modules/upload/document.grpc.controller';
import { R2ServiceController } from '../../apps/r2-service/src/r2-service.controller';
import { WordFamilyAdminGrpcController } from '../../apps/vocabulary-service/src/modules/word-family/word-family-admin.grpc.controller';
import { WordFamilyGrpcController } from '../../apps/vocabulary-service/src/modules/word-family/word-family.grpc.controller';

type Ctor = { prototype: object; name: string };

function declared(controller: Ctor, handler: string): Declaration | undefined {
    const fn = (controller.prototype as Record<string, object>)[handler];
    return declarationOf(<T>(key: string) => Reflect.getMetadata(key, fn) as T | undefined);
}

const anyUserOrService: Declaration = { kind: 'permissions-or-service', permissions: [], callers: undefined };

/** The RPC guard table of phase 04 (network placement is not the trust boundary). */
const TABLE: Array<[Ctor, string, Declaration]> = [
    [AuthGrpcController, 'getPublicProfilesByIds', anyUserOrService],
    [AuthGrpcController, 'getUser', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['admin', 'finance'] }],
    [AuthGrpcController, 'getUsersByIds', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['admin'] }],
    [AuthGrpcController, 'findUserByEmail', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['admin', 'finance'] }],
    [AuthGrpcController, 'listUsers', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['finance'] }],
    [AuthGrpcController, 'setUserRole', { kind: 'permissions', permissions: ['role:assign'] }],
    [AuthGrpcController, 'setSystemAdmin', { kind: 'permissions', permissions: ['role:assign'] }],
    [AuthGrpcController, 'setUserStatus', { kind: 'permissions', permissions: ['role:assign'] }],
    [AuthGrpcController, 'listRoleChanges', { kind: 'permissions', permissions: ['role:assign'] }],
    [AuthUsersGrpcController, 'updateUserAdmin', { kind: 'permissions', permissions: ['user:manage'] }],
    [AuthUsersGrpcController, 'searchUsers', { kind: 'permissions', permissions: ['user:search'] }],
    [AuthUsersGrpcController, 'getUserStats', { kind: 'permissions', permissions: ['stats:read'] }],
    [AuthUsersGrpcController, 'getUserAdminDetail', { kind: 'permissions', permissions: ['user:manage'] }],
    [WalletGrpcController, 'getWallet', anyUserOrService],
    [SubscriptionGrpcController, 'getUserBenefits', anyUserOrService],
    [WalletGrpcController, 'createWallet', { kind: 'service-only', callers: ['auth'] }],
    [WalletGrpcController, 'debit', { kind: 'permissions-or-service', permissions: ['wallet:use'], callers: ['exam', 'content', 'document'] }],
    [WalletGrpcController, 'credit', { kind: 'service-only', callers: ['exam', 'content', 'document'] }],
    [WalletGrpcController, 'refund', { kind: 'service-only', callers: ['exam', 'content', 'document'] }],
    [FinanceAdminGrpcController, 'adjustBalance', { kind: 'permissions', permissions: ['finance:admin'] }],
    [FinanceAdminGrpcController, 'refundPayment', { kind: 'permissions', permissions: ['finance:admin'] }],
    [FinanceAdminGrpcController, 'changeTier', { kind: 'permissions', permissions: ['finance:admin'] }],
    [FinanceAdminGrpcController, 'listPayments', { kind: 'permissions', permissions: ['finance:admin'] }],
    [FinanceAdminGrpcController, 'listSubscriptions', { kind: 'permissions', permissions: ['finance:admin'] }],
    [FinanceAdminGrpcController, 'getUserFinance', { kind: 'permissions', permissions: ['finance:admin'] }],
    [FinanceStatsGrpcController, 'getRevenueStats', { kind: 'permissions', permissions: ['stats:read'] }],
    [R2ServiceController, 'getFileUrl', { kind: 'service-only', callers: ['exam', 'auth'] }],
    [R2ServiceController, 'listUserFiles', anyUserOrService],
    [R2ServiceController, 'uploadFile', { kind: 'service-only', callers: ['exam', 'auth', 'document'] }],
    [R2ServiceController, 'deleteFile', { kind: 'service-only', callers: ['exam', 'auth'] }],
    [R2ServiceController, 'deleteObjects', { kind: 'service-only', callers: ['exam', 'auth', 'vocabulary', 'document', 'ai-chat'] }],
    [R2ServiceController, 'createPresignedDownload', { kind: 'service-only', callers: ['document'] }],
    // document: user-scoped by the forwarded token; no service caller is allowlisted on any RPC
    [DocumentGrpcController, 'createUpload', { kind: 'permissions', permissions: ['document:upload'] }],
    [DocumentGrpcController, 'getDocumentsByIds', { kind: 'permissions', permissions: ['document:upload'] }],
    [DocumentGrpcController, 'assertOwnership', { kind: 'permissions', permissions: ['document:upload'] }],
    [DocumentGrpcController, 'ensureProcessed', { kind: 'permissions', permissions: ['document:upload'] }],
    [DocumentGrpcController, 'deleteDocuments', { kind: 'permissions-or-service', permissions: ['document:upload'], callers: [] }],
    [DocumentGrpcController, 'listDocuments', { kind: 'permissions', permissions: ['document:upload'] }],
    [DocumentGrpcController, 'getDownloadUrl', { kind: 'permissions', permissions: ['document:upload'] }],
    [DocumentGrpcController, 'getQuota', { kind: 'permissions-or-service', permissions: [], callers: [] }],
    // vocabulary: admin RPCs need the forwarded admin token; GetWordFamily is shared catalog data
    [WordFamilyAdminGrpcController, 'listCategories', { kind: 'permissions', permissions: ['word_family:admin'] }],
    [WordFamilyAdminGrpcController, 'upsertCategory', { kind: 'permissions', permissions: ['word_family:admin'] }],
    [WordFamilyAdminGrpcController, 'deleteCategory', { kind: 'permissions', permissions: ['word_family:admin'] }],
    [WordFamilyGrpcController, 'getWordFamily', anyUserOrService],
];

describe('gRPC guard declarations', () => {
    it.each(TABLE)('%p.%s carries the declaration from the RPC guard table', (controller, handler, expected) => {
        expect(declared(controller, handler)).toEqual(expected);
    });

    it('every @GrpcMethod handler of every gRPC controller carries SOME declaration', () => {
        const controllers = [AuthGrpcController, AuthUsersGrpcController, FinanceStatsGrpcController, WalletGrpcController, SubscriptionGrpcController, FinanceAdminGrpcController, R2ServiceController, WordFamilyAdminGrpcController, WordFamilyGrpcController, DocumentGrpcController];
        const rpcHandlers = controllers.flatMap((c) => routeHandlers(c as never).filter((h) => h.kind === 'rpc'));
        expect(rpcHandlers.length).toBeGreaterThanOrEqual(34);
        expect(undeclaredHandlers(controllers as never)).toEqual([]);
    });

    it('state-changing RPCs are never open to "any user or service"', () => {
        const writes: Array<[Ctor, string]> = [
            [AuthGrpcController, 'setUserRole'],
            [AuthGrpcController, 'setSystemAdmin'],
            [AuthGrpcController, 'setUserStatus'],
            [AuthUsersGrpcController, 'updateUserAdmin'],
            [WalletGrpcController, 'createWallet'],
            [WalletGrpcController, 'debit'],
            [WalletGrpcController, 'credit'],
            [WalletGrpcController, 'refund'],
            [FinanceAdminGrpcController, 'adjustBalance'],
            [FinanceAdminGrpcController, 'refundPayment'],
            [FinanceAdminGrpcController, 'changeTier'],
            [R2ServiceController, 'uploadFile'],
            [R2ServiceController, 'deleteFile'],
            [R2ServiceController, 'deleteObjects'],
            [R2ServiceController, 'getFileUrl'],
            [R2ServiceController, 'createPresignedDownload'],
            [DocumentGrpcController, 'createUpload'],
            [DocumentGrpcController, 'deleteDocuments'],
            [WordFamilyAdminGrpcController, 'upsertCategory'],
            [WordFamilyAdminGrpcController, 'deleteCategory'],
        ];
        for (const [controller, handler] of writes) {
            const d = declared(controller, handler);
            expect(d).toBeDefined();
            expect(d).not.toEqual(anyUserOrService);
            expect(d?.kind).not.toBe('public');
        }
    });

    /**
     * IDOR audit: every RPC reachable with a plain user token ("any user or
     * service") must either carry no user id in its body or compare it to the
     * token subject via assertSelfOrService. The privileged-by-permission RPCs
     * (user:manage / role:assign) and service-only RPCs are not user-scoped.
     */
    const OPEN_TO_ANY_USER: Array<[Ctor, string, 'self-check' | 'no-user-id-in-body', string]> = [
        [WalletGrpcController, 'getWallet', 'self-check', 'GetWalletRequest.user_id'],
        [SubscriptionGrpcController, 'getUserBenefits', 'self-check', 'GetUserBenefitsRequest.user_id'],
        [R2ServiceController, 'listUserFiles', 'self-check', 'ListUserFilesRequest.user_id'],
        [AuthGrpcController, 'getPublicProfilesByIds', 'no-user-id-in-body', 'public projection (no email), batch lookup by design'],
        [WordFamilyGrpcController, 'getWordFamily', 'no-user-id-in-body', 'shared catalog row (no owner), looked up by word-family id'],
        [DocumentGrpcController, 'getQuota', 'no-user-id-in-body', 'the token sub is the only subject; no service caller (callers: [])'],
    ];

    it('the open-to-any-user list is exactly the set of "any user or service" declarations', () => {
        const controllers = [AuthGrpcController, AuthUsersGrpcController, FinanceStatsGrpcController, WalletGrpcController, SubscriptionGrpcController, FinanceAdminGrpcController, R2ServiceController, WordFamilyAdminGrpcController, WordFamilyGrpcController, DocumentGrpcController];
        const open = controllers.flatMap((c) =>
            routeHandlers(c as never)
                .filter((h) => h.kind === 'rpc')
                .filter((h) => {
                    const d = declared(c, h.handler);
                    return d?.kind === 'permissions-or-service' && d.permissions.length === 0;
                })
                .map((h) => `${c.name}.${h.handler}`)
        );
        expect(open.sort()).toEqual(OPEN_TO_ANY_USER.map(([c, h]) => `${c.name}.${h}`).sort());
    });

    it.each(OPEN_TO_ANY_USER)('%p.%s (%s: %s) enforces the IDOR rule', (controller, handler, mode) => {
        const source = String((controller.prototype as Record<string, unknown>)[handler]);
        if (mode === 'self-check') expect(source).toContain('assertSelfOrService');
    });

    it('collectControllers sees the gRPC controllers of the service modules', async () => {
        const { AuthServiceModule } = await import('../../apps/auth-service/src/auth-service.module');
        expect(collectControllers(AuthServiceModule).map((c) => c.name)).toContain('AuthGrpcController');
    });
});
