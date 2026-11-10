/**
 * RPCs that are safe to retry on UNAVAILABLE. Explicit `"<pkg>.<Service>/<Method>"`
 * names: anything not listed (UploadFile, every other mutation)
 * is never retried. A spec asserts every entry exists in the protos.
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
    // content reads (assessment-service snapshots and counts; nothing is written)
    'examio.content.v1.ContentService/GetQuizSetSnapshot',
    'examio.content.v1.ContentService/GetQuizSetsByIds',
    'examio.content.v1.ContentService/GetUserContentStats',
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
