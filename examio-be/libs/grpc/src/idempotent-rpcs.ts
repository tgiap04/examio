/**
 * RPCs that are safe to retry on UNAVAILABLE. Explicit `"<pkg>.<Service>/<Method>"`
 * names: anything not listed (UpdateBalance, UploadFile, every other mutation)
 * is never retried. Money RPCs are only listed because the server de-duplicates
 * on `idempotency_key`. A spec asserts every entry exists in the protos.
 */
export const IDEMPOTENT_RPCS: ReadonlySet<string> = new Set([
    // auth reads
    'examio.auth.v1.AuthService/GetUser',
    'examio.auth.v1.AuthService/GetUsersByIds',
    'examio.auth.v1.AuthService/GetPublicProfilesByIds',
    'examio.auth.v1.AuthService/FindUserByEmail',
    'examio.auth.v1.AuthService/ListUsers',
    'examio.auth.v1.AuthService/ListRoleChanges',
    // finance reads + key-guarded money movement
    'examio.finance.v1.WalletService/GetWallet',
    'examio.finance.v1.SubscriptionService/GetUserBenefits',
    'examio.finance.v1.WalletService/Debit',
    'examio.finance.v1.WalletService/Credit',
    'examio.finance.v1.WalletService/Refund',
    // r2 reads + idempotent batch delete
    'examio.r2.v1.R2Service/GetFileUrl',
    'examio.r2.v1.R2Service/ListUserFiles',
    'examio.r2.v1.R2Service/DeleteObjects',
    // gateway control plane (set-style, last write wins)
    'examio.gateway.v1.GatewayControl/RevokeSession',
    'examio.gateway.v1.GatewayControl/InvalidateUser',
    'examio.gateway.v1.GatewayControl/SetPageFlags',
]);

export function isIdempotentRpc(rpc: string): boolean {
    return IDEMPOTENT_RPCS.has(rpc);
}
