import 'reflect-metadata';
import { declarationOf, type Declaration } from '@examio/auth-jwt';
import { collectControllers, routeHandlers, undeclaredHandlers } from '@examio/auth-jwt/testing';
import { AuthGrpcController } from '../src/grpc/auth.grpc.controller';
import { WalletGrpcController } from '../../finance-service/src/modules/wallet/wallet.grpc.controller';
import { SubscriptionGrpcController } from '../../finance-service/src/modules/sepay/subscription.grpc.controller';
import { R2ServiceController } from '../../r2-service/src/r2-service.controller';

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
    [AuthGrpcController, 'getUsersByIds', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['admin', 'finance'] }],
    [AuthGrpcController, 'findUserByEmail', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['admin', 'finance'] }],
    [AuthGrpcController, 'listUsers', { kind: 'permissions-or-service', permissions: ['user:manage'], callers: ['finance'] }],
    [AuthGrpcController, 'setUserRole', { kind: 'permissions', permissions: ['role:assign'] }],
    [AuthGrpcController, 'setSystemAdmin', { kind: 'permissions', permissions: ['role:assign'] }],
    [AuthGrpcController, 'listRoleChanges', { kind: 'permissions', permissions: ['role:assign'] }],
    [WalletGrpcController, 'getWallet', anyUserOrService],
    [SubscriptionGrpcController, 'getUserBenefits', anyUserOrService],
    [WalletGrpcController, 'createWallet', { kind: 'service-only', callers: ['auth'] }],
    [WalletGrpcController, 'updateBalance', { kind: 'service-only', callers: ['exam'] }],
    [R2ServiceController, 'getFileUrl', { kind: 'service-only', callers: ['exam', 'auth'] }],
    [R2ServiceController, 'listUserFiles', anyUserOrService],
    [R2ServiceController, 'uploadFile', { kind: 'service-only', callers: ['exam', 'auth'] }],
    [R2ServiceController, 'deleteFile', { kind: 'service-only', callers: ['exam', 'auth'] }],
    [R2ServiceController, 'deleteObjects', { kind: 'service-only', callers: ['exam', 'auth'] }],
];

describe('gRPC guard declarations', () => {
    it.each(TABLE)('%p.%s carries the declaration from the RPC guard table', (controller, handler, expected) => {
        expect(declared(controller, handler)).toEqual(expected);
    });

    it('every @GrpcMethod handler of every gRPC controller carries SOME declaration', () => {
        const controllers = [AuthGrpcController, WalletGrpcController, SubscriptionGrpcController, R2ServiceController];
        const rpcHandlers = controllers.flatMap((c) => routeHandlers(c as never).filter((h) => h.kind === 'rpc'));
        expect(rpcHandlers.length).toBeGreaterThanOrEqual(17);
        expect(undeclaredHandlers(controllers as never)).toEqual([]);
    });

    it('state-changing RPCs are never open to "any user or service"', () => {
        const writes: Array<[Ctor, string]> = [
            [AuthGrpcController, 'setUserRole'],
            [AuthGrpcController, 'setSystemAdmin'],
            [AuthGrpcController, 'setUserStatus'],
            [WalletGrpcController, 'createWallet'],
            [WalletGrpcController, 'updateBalance'],
            [WalletGrpcController, 'debit'],
            [WalletGrpcController, 'credit'],
            [WalletGrpcController, 'refund'],
            [R2ServiceController, 'uploadFile'],
            [R2ServiceController, 'deleteFile'],
            [R2ServiceController, 'deleteObjects'],
            [R2ServiceController, 'getFileUrl'],
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
    ];

    it('the open-to-any-user list is exactly the set of "any user or service" declarations', () => {
        const controllers = [AuthGrpcController, WalletGrpcController, SubscriptionGrpcController, R2ServiceController];
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
        const { AuthServiceModule } = await import('../src/auth-service.module');
        expect(collectControllers(AuthServiceModule).map((c) => c.name)).toContain('AuthGrpcController');
    });
});
