/**
 * RPCs that are safe to retry on UNAVAILABLE. Explicit `"<pkg>.<Service>/<Method>"`
 * names: anything not listed (UploadFile, every other mutation)
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
    'examio.auth.v1.AuthUserService/SearchUsers',
    'examio.auth.v1.AuthUserService/GetUserStats',
    'examio.auth.v1.AuthUserService/GetUserAdminDetail',
    // finance reads + key-guarded money movement
    'examio.finance.v1.WalletService/GetWallet',
    'examio.finance.v1.SubscriptionService/GetUserBenefits',
    'examio.finance.v1.WalletService/Debit',
    'examio.finance.v1.WalletService/Credit',
    'examio.finance.v1.WalletService/Refund',
    // finance admin: writes carry an idempotency_key the server de-duplicates on
    'examio.finance.v1.FinanceAdminService/AdjustBalance',
    'examio.finance.v1.FinanceAdminService/RefundPayment',
    'examio.finance.v1.FinanceAdminService/ChangeTier',
    'examio.finance.v1.FinanceAdminService/ListPayments',
    'examio.finance.v1.FinanceAdminService/ListSubscriptions',
    'examio.finance.v1.FinanceAdminService/GetUserFinance',
    'examio.finance.v1.FinanceStatsService/GetRevenueStats',
    // admin + vocabulary reads
    'examio.admin.v1.AdminService/GetPageFlags',
    'examio.vocabulary.v1.WordFamilyAdminService/ListCategories',
    'examio.vocabulary.v1.WordFamilyService/GetWordFamily',
    // r2 reads + idempotent batch delete
    'examio.r2.v1.R2Service/GetFileUrl',
    'examio.r2.v1.R2Service/ListUserFiles',
    'examio.r2.v1.R2Service/DeleteObjects',
    'examio.r2.v1.R2Service/CreatePresignedDownload',
    // document reads (AssertOwnership is a pure check)
    'examio.document.v1.DocumentService/GetDocumentsByIds',
    'examio.document.v1.DocumentService/AssertOwnership',
    'examio.document.v1.DocumentService/GetQuota',
    'examio.document.v1.DocumentService/ListDocuments',
    'examio.document.v1.DocumentService/GetDownloadUrl',
    // ai reads
    'examio.ai.v1.AiService/ListModels',
    // gateway control plane (set-style, last write wins)
    'examio.gateway.v1.GatewayControl/RevokeSession',
    'examio.gateway.v1.GatewayControl/InvalidateUser',
    'examio.gateway.v1.GatewayControl/SetPageFlags',
]);

export function isIdempotentRpc(rpc: string): boolean {
    return IDEMPOTENT_RPCS.has(rpc);
}
