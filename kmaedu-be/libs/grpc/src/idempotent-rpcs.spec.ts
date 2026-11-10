import { join } from 'path';
import { loadSync } from '@grpc/proto-loader';
import { PROTO_FILES } from '@kmaedu/contracts';
import { IDEMPOTENT_RPCS, isIdempotentRpc } from './idempotent-rpcs';

const protoRoot = join(__dirname, '../../../proto');

function loadAllMethods(): string[] {
    const files = [
        ...new Set(Object.values(PROTO_FILES).map((p) => join(protoRoot, p.file))),
    ];
    const def = loadSync(files, { includeDirs: [protoRoot] });
    const out: string[] = [];
    for (const [svc, methods] of Object.entries(def)) {
        if ('format' in methods) continue; // message/enum type definition
        for (const m of Object.keys(methods)) out.push(`${svc}/${m}`);
    }
    return out;
}

describe('IDEMPOTENT_RPCS', () => {
    const all = loadAllMethods();

    it('every entry resolves to a method in the protos (no typos)', () => {
        const missing = [...IDEMPOTENT_RPCS].filter((r) => !all.includes(r));
        expect(missing).toEqual([]);
    });

    it('lists no finance RPC (finance-service was removed)', () => {
        expect([...IDEMPOTENT_RPCS].filter((r) => r.startsWith('kmaedu.finance.'))).toEqual([]);
    });

    it('contains every Get*/List*/Find* RPC', () => {
        const reads = all.filter((r) => /\/(Get|List|Find)/.test(r));
        expect(reads.length).toBeGreaterThan(0);
        expect(reads.filter((r) => !isIdempotentRpc(r))).toEqual([]);
    });

    it('contains DeleteObjects and GatewayControl/*', () => {
        for (const r of [
            'kmaedu.r2.v1.R2Service/DeleteObjects',
            'kmaedu.gateway.v1.GatewayControl/RevokeSession',
            'kmaedu.gateway.v1.GatewayControl/InvalidateUser',
            'kmaedu.gateway.v1.GatewayControl/SetPageFlags',
        ]) {
            expect(isIdempotentRpc(r)).toBe(true);
        }
    });

    it('excludes UploadFile and every other mutation', () => {
        for (const r of [
            'kmaedu.r2.v1.R2Service/UploadFile',
            'kmaedu.vocabulary.v1.WordFamilyAdminService/UpsertCategory',
            'kmaedu.vocabulary.v1.WordFamilyAdminService/DeleteCategory',
            'kmaedu.auth.v1.AuthUserService/UpdateUserAdmin',
            'kmaedu.r2.v1.R2Service/DeleteFile',
            'kmaedu.auth.v1.AuthService/SetUserRole',
            'kmaedu.auth.v1.AuthService/SetSystemAdmin',
            'kmaedu.auth.v1.AuthService/SetUserStatus',
        ]) {
            expect(isIdempotentRpc(r)).toBe(false);
        }
    });
});
