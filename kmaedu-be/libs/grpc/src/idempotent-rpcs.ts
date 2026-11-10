/**
 * RPCs that are safe to retry on UNAVAILABLE. Explicit `"<pkg>.<Service>/<Method>"`
 * names: anything not listed (UploadFile, every other mutation)
 * is never retried. A spec asserts every entry exists in the protos.
 */
export const IDEMPOTENT_RPCS: ReadonlySet<string> = new Set([
    // auth reads
    'kmaedu.auth.v1.AuthService/GetUser',
    'kmaedu.auth.v1.AuthService/GetUsersByIds',
    'kmaedu.auth.v1.AuthService/GetPublicProfilesByIds',
    'kmaedu.auth.v1.AuthService/FindUserByEmail',
    'kmaedu.auth.v1.AuthService/ListUsers',
    'kmaedu.auth.v1.AuthService/ListRoleChanges',
    'kmaedu.auth.v1.AuthUserService/SearchUsers',
    'kmaedu.auth.v1.AuthUserService/GetUserStats',
    'kmaedu.auth.v1.AuthUserService/GetUserAdminDetail',
    // admin + vocabulary reads
    'kmaedu.admin.v1.AdminService/GetPageFlags',
    'kmaedu.vocabulary.v1.WordFamilyAdminService/ListCategories',
    'kmaedu.vocabulary.v1.WordFamilyService/GetWordFamily',
    // r2 reads + idempotent batch delete
    'kmaedu.r2.v1.R2Service/GetFileUrl',
    'kmaedu.r2.v1.R2Service/ListUserFiles',
    'kmaedu.r2.v1.R2Service/DeleteObjects',
    'kmaedu.r2.v1.R2Service/CreatePresignedDownload',
    // document reads (AssertOwnership is a pure check)
    'kmaedu.document.v1.DocumentService/GetDocumentsByIds',
    'kmaedu.document.v1.DocumentService/AssertOwnership',
    'kmaedu.document.v1.DocumentService/GetQuota',
    'kmaedu.document.v1.DocumentService/ListDocuments',
    'kmaedu.document.v1.DocumentService/GetDownloadUrl',
    // content reads (assessment-service snapshots and counts; nothing is written)
    'kmaedu.content.v1.ContentService/GetQuizSetSnapshot',
    'kmaedu.content.v1.ContentService/GetQuizSetsByIds',
    'kmaedu.content.v1.ContentService/GetUserContentStats',
    // ai reads
    'kmaedu.ai.v1.AiService/ListModels',
    // gateway control plane (set-style, last write wins)
    'kmaedu.gateway.v1.GatewayControl/RevokeSession',
    'kmaedu.gateway.v1.GatewayControl/InvalidateUser',
    'kmaedu.gateway.v1.GatewayControl/SetPageFlags',
]);

export function isIdempotentRpc(rpc: string): boolean {
    return IDEMPOTENT_RPCS.has(rpc);
}
